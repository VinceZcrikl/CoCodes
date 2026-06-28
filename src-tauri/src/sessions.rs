//! App-owned chat-session store.
//!
//! The cockpit's session list + groups used to live only in the webview's
//! `localStorage` — opaque, per-webview (so dev and the installed build had
//! separate copies), wiped by a WebKit data clear, and lost on reinstall. This
//! moves them into the CoCodes data home alongside personas/providers:
//!
//! ```text
//! ~/.cocodes/sessions/<cli>/<profileId>.json   // { "sessions": [...], "groups": [...] }
//! ```
//!
//! The schema is treated as opaque JSON (`serde_json::Value`) so the frontend
//! owns the shape — the backend just persists it durably and atomically.

use std::path::PathBuf;

use serde_json::Value;

use crate::persona::app_home;

/// Filesystem-safe segment: keep alphanumerics, dash and underscore; collapse
/// the rest to '-'. Lowercased. Empty → "_". Mirrors `persona::sanitize_id`'s
/// intent so a `<cli>`/`<profileId>` can never escape the sessions dir.
fn sanitize(raw: &str) -> String {
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
    if s.is_empty() { "_".to_string() } else { s }
}

fn sessions_root() -> PathBuf {
    app_home().join("sessions")
}

fn store_path(cli: &str, profile_id: &str) -> PathBuf {
    sessions_root()
        .join(sanitize(cli))
        .join(format!("{}.json", sanitize(profile_id)))
}

/// Load one persona+CLI's session store. `None` when nothing is persisted yet
/// (the caller then falls back to legacy localStorage and migrates it).
#[tauri::command]
pub async fn sessions_load(profile_id: String, cli: String) -> Result<Option<Value>, String> {
    let path = store_path(&cli, &profile_id);
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s)
            .map(Some)
            .map_err(|e| format!("corrupt session store {}: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

/// Persist one persona+CLI's session store. Written atomically (temp + rename)
/// so a crash mid-write can't truncate the file.
#[tauri::command]
pub async fn sessions_save(profile_id: String, cli: String, store: Value) -> Result<(), String> {
    let path = store_path(&cli, &profile_id);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    }
    let json = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename {}: {e}", path.display()))?;
    Ok(())
}

/// Remove a persona's session stores across all CLIs — called when a persona is
/// deleted so its sessions don't linger as orphans.
#[tauri::command]
pub async fn sessions_delete(profile_id: String) -> Result<(), String> {
    let pid = sanitize(&profile_id);
    let root = sessions_root();
    let Ok(cli_dirs) = std::fs::read_dir(&root) else {
        return Ok(());
    };
    for entry in cli_dirs.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let f = entry.path().join(format!("{pid}.json"));
        if f.is_file() {
            let _ = std::fs::remove_file(&f);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_is_safe() {
        assert_eq!(sanitize("Claude-Deepseek"), "claude-deepseek");
        assert_eq!(sanitize("../../etc"), "etc");
        assert_eq!(sanitize("  "), "_");
        assert_eq!(sanitize("claude"), "claude");
    }

    #[test]
    fn store_path_is_under_sessions_root() {
        let p = store_path("claude", "claude-deepseek");
        assert!(p.ends_with("sessions/claude/claude-deepseek.json"));
    }
}
