//! App-owned persona store.
//!
//! Re-homed from hermes-orb's `~/.hermes` profile dirs to OpenTerminus's own
//! data home. Each persona is a directory:
//!
//! ```text
//! ~/.openterminus/personas/<id>/
//!   ├─ meta.json   { "name": "Dev Bot" }
//!   ├─ SOUL.md     persona / system identity
//!   ├─ MEMORY.md   long-lived facts the CLI should remember
//!   └─ USER.md     about the user
//! ```
//!
//! SOUL/MEMORY/USER are folded into `--append-system-prompt-file` by
//! [`crate::terminal`] when a session spawns under that persona's id. A persona
//! with no SOUL/MEMORY/USER yields an all-empty context, which `write_persona_file`
//! treats as "no persona append" so claude keeps its own default identity.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const DEFAULT_PROFILE: &str = "default";

/// Persona + memory for one profile, folded into the CLI's system prompt.
#[derive(Serialize, Clone, Default)]
pub struct PersonaContext {
    pub soul: String,
    pub memory: String,
    pub user_profile: String,
    pub name: String,
}

/// A persona's full document, for the editor.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PersonaDoc {
    pub id: String,
    pub name: String,
    /// Avatar: a data URL / http(s) URL / file path (image) or an emoji. Empty
    /// means "use the fallback" (the Claude mascot for the default persona, a
    /// tinted initial otherwise).
    #[serde(default)]
    pub avatar: String,
    pub soul: String,
    pub memory: String,
    pub user: String,
}

/// A persona list-row summary (id, display name, avatar, short SOUL preview).
#[derive(Serialize, Clone)]
pub struct PersonaSummary {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub soul_preview: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Meta {
    #[serde(default)]
    name: String,
    #[serde(default)]
    avatar: String,
}

/// The OpenTerminus data home — `~/.openterminus`.
pub fn app_home() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openterminus")
}

fn personas_root() -> PathBuf {
    app_home().join("personas")
}

fn persona_dir(profile_id: &str) -> PathBuf {
    personas_root().join(profile_id)
}

/// Filesystem-safe id: keep alphanumerics, dash and underscore; collapse the
/// rest to '-'. Lowercased. Empty → "default".
fn sanitize_id(raw: &str) -> String {
    let s: String = raw
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let s = s.trim_matches('-').to_string();
    if s.is_empty() {
        DEFAULT_PROFILE.to_string()
    } else {
        s
    }
}

fn read_meta(dir: &std::path::Path) -> Meta {
    std::fs::read_to_string(dir.join("meta.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Meta>(&s).ok())
        .unwrap_or_default()
}

fn read_name(dir: &std::path::Path, fallback_id: &str) -> String {
    let n = read_meta(dir).name;
    if n.trim().is_empty() {
        fallback_id.to_string()
    } else {
        n
    }
}

/// Load the persona context for `profile_id` (default when None/empty). Missing
/// files are empty strings.
#[tauri::command]
pub async fn load_persona_context(profile_id: Option<String>) -> PersonaContext {
    load(profile_id)
}

fn load(profile_id: Option<String>) -> PersonaContext {
    let pid = profile_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_PROFILE.to_string());

    let dir = persona_dir(&pid);
    let read = |name: &str| std::fs::read_to_string(dir.join(name)).unwrap_or_default();

    PersonaContext {
        soul: read("SOUL.md"),
        memory: read("MEMORY.md"),
        user_profile: read("USER.md"),
        name: read_name(&dir, &pid),
    }
}

/// List all personas. Always includes a synthetic "default" first even if it
/// has no directory yet, so the cockpit always has a selectable persona.
#[tauri::command]
pub async fn persona_list() -> Result<Vec<PersonaSummary>, String> {
    let root = personas_root();
    let mut out: Vec<PersonaSummary> = Vec::new();
    let mut seen_default = false;

    if let Ok(entries) = std::fs::read_dir(&root) {
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            if id == DEFAULT_PROFILE {
                seen_default = true;
            }
            let dir = entry.path();
            let meta = read_meta(&dir);
            let soul = std::fs::read_to_string(dir.join("SOUL.md")).unwrap_or_default();
            out.push(PersonaSummary {
                name: if meta.name.trim().is_empty() {
                    id.clone()
                } else {
                    meta.name
                },
                avatar: meta.avatar,
                soul_preview: soul.trim().chars().take(120).collect(),
                id,
            });
        }
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    if !seen_default {
        out.insert(
            0,
            PersonaSummary {
                id: DEFAULT_PROFILE.to_string(),
                name: "Default".to_string(),
                avatar: String::new(),
                soul_preview: String::new(),
            },
        );
    }
    Ok(out)
}

/// Read one persona's full document for the editor.
#[tauri::command]
pub async fn persona_get(id: String) -> Result<PersonaDoc, String> {
    let pid = sanitize_id(&id);
    let dir = persona_dir(&pid);
    let read = |name: &str| std::fs::read_to_string(dir.join(name)).unwrap_or_default();
    Ok(PersonaDoc {
        name: read_name(&dir, &pid),
        avatar: read_meta(&dir).avatar,
        soul: read("SOUL.md"),
        memory: read("MEMORY.md"),
        user: read("USER.md"),
        id: pid,
    })
}

/// Create or update a persona. The id is derived from the doc's id (edit) or
/// name (create); returns the resolved id so the caller can select it.
#[tauri::command]
pub async fn persona_save(doc: PersonaDoc) -> Result<String, String> {
    let pid = if doc.id.trim().is_empty() {
        sanitize_id(&doc.name)
    } else {
        sanitize_id(&doc.id)
    };
    let dir = persona_dir(&pid);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let name = if doc.name.trim().is_empty() {
        pid.clone()
    } else {
        doc.name.trim().to_string()
    };
    let meta = serde_json::to_string_pretty(&Meta {
        name,
        avatar: doc.avatar,
    })
    .map_err(|e| e.to_string())?;
    std::fs::write(dir.join("meta.json"), meta).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("SOUL.md"), doc.soul).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("MEMORY.md"), doc.memory).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("USER.md"), doc.user).map_err(|e| e.to_string())?;
    Ok(pid)
}

/// Delete a persona directory. The default persona can't be removed.
#[tauri::command]
pub async fn persona_delete(id: String) -> Result<(), String> {
    let pid = sanitize_id(&id);
    if pid == DEFAULT_PROFILE {
        return Err("the default persona can't be deleted".into());
    }
    let dir = persona_dir(&pid);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_profile_yields_empty_context_with_name() {
        let ctx = load(Some("does-not-exist-xyz".into()));
        assert!(ctx.soul.is_empty());
        assert_eq!(ctx.name, "does-not-exist-xyz");
    }

    #[test]
    fn blank_profile_id_falls_back_to_default() {
        let ctx = load(Some("   ".into()));
        assert_eq!(ctx.name, DEFAULT_PROFILE);
    }

    #[test]
    fn sanitize_id_is_filesystem_safe() {
        assert_eq!(sanitize_id("Dev Bot 2!"), "dev-bot-2");
        assert_eq!(sanitize_id("  "), "default");
        assert_eq!(sanitize_id("../etc/passwd"), "etc-passwd");
    }
}
