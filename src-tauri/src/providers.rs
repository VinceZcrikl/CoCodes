//! Per-persona base-model provider presets.
//!
//! A "provider" is an Anthropic-compatible endpoint (DeepSeek, Kimi/Moonshot, …)
//! that a persona can point its embedded `claude` CLI at, instead of the default
//! Claude subscription. The registry lives at `~/.theoi/providers.json`
//! and is **secret-free**: tokens are stored separately in `~/.theoi/.env`
//! under `PROVIDER_TOKEN_<ID>`, and the registry only carries a `has_token` flag.
//!
//! [`terminal_open`](crate::terminal) calls [`resolve`] at spawn time and, when
//! it returns `Some`, injects `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` /
//! `ANTHROPIC_MODEL` / `ANTHROPIC_SMALL_FAST_MODEL` into that one process —
//! per-persona, no global file touched. A missing preset or token yields `None`,
//! so the caller falls back to subscription Claude.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::persona::app_home;

/// One Anthropic-compatible endpoint preset. The auth token is NOT stored here;
/// it lives in `.env` under [`token_env_key`]. `has_token` is a presence flag the
/// UI uses to render "configured" vs "needs key".
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Provider {
    pub id: String,
    pub label: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub small_fast_model: Option<String>,
    #[serde(default)]
    pub has_token: bool,
}

/// The strings [`terminal_open`](crate::terminal) injects for a persona's chosen
/// provider.
pub struct Resolved {
    pub base_url: String,
    pub auth_token: String,
    pub model: String,
    pub small_fast_model: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct Registry {
    #[serde(default)]
    providers: Vec<Provider>,
}

fn registry_path(base: &Path) -> PathBuf {
    base.join("providers.json")
}

fn env_path(base: &Path) -> PathBuf {
    base.join(".env")
}

/// Env-var key holding the token for provider `id`, e.g. `deep-seek` →
/// `PROVIDER_TOKEN_DEEP_SEEK`. Single source of truth for the key name.
fn token_env_key(id: &str) -> String {
    format!("PROVIDER_TOKEN_{}", id.to_ascii_uppercase().replace('-', "_"))
}

/// Filesystem/env-safe provider id: alphanumerics + dash/underscore, collapsed
/// and lowercased. Empty after sanitization is an error (unlike persona ids,
/// which fall back to a default).
fn sanitize_provider_id(raw: &str) -> Result<String, String> {
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
        Err("provider id is empty after sanitization".into())
    } else {
        Ok(s)
    }
}

fn load_registry(base: &Path) -> Registry {
    std::fs::read_to_string(registry_path(base))
        .ok()
        .and_then(|s| serde_json::from_str::<Registry>(&s).ok())
        .unwrap_or_default()
}

fn write_registry(base: &Path, reg: &Registry) -> Result<(), String> {
    let path = registry_path(base);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(reg).map_err(|e| e.to_string())?;
    // Atomic: write a temp sibling then rename over the target.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// All configured providers.
pub fn list() -> Vec<Provider> {
    list_in(&app_home())
}

fn list_in(base: &Path) -> Vec<Provider> {
    load_registry(base).providers
}

/// Create or update a provider. When `token` is `Some(non-empty)`, the secret is
/// written to `.env` and `has_token` set true; when `None`, any existing token is
/// preserved. A blank `small_fast_model` defaults to `model` so background
/// (haiku-class) calls always have a servable target on third-party endpoints.
pub fn save(p: Provider, token: Option<String>) -> Result<Provider, String> {
    save_in(&app_home(), p, token)
}

fn save_in(base: &Path, mut p: Provider, token: Option<String>) -> Result<Provider, String> {
    p.id = sanitize_provider_id(&p.id)?;
    if p.base_url.trim().is_empty() {
        return Err("base_url is required".into());
    }
    if p.model.trim().is_empty() {
        return Err("model is required".into());
    }
    p.base_url = p.base_url.trim().to_string();
    p.model = p.model.trim().to_string();
    p.label = {
        let l = p.label.trim();
        if l.is_empty() {
            p.id.clone()
        } else {
            l.to_string()
        }
    };
    p.small_fast_model = match p.small_fast_model {
        Some(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => Some(p.model.clone()),
    };

    // Write the new token, or keep whatever already exists.
    let key = token_env_key(&p.id);
    match token {
        Some(t) if !t.trim().is_empty() => {
            write_env_key(&env_path(base), &key, t.trim())?;
            p.has_token = true;
        }
        _ => {
            p.has_token = parse_env_key(&env_path(base), &key).is_some();
        }
    }

    let mut reg = load_registry(base);
    if let Some(existing) = reg.providers.iter_mut().find(|x| x.id == p.id) {
        *existing = p.clone();
    } else {
        reg.providers.push(p.clone());
    }
    write_registry(base, &reg)?;
    Ok(p)
}

/// Remove a provider and its `.env` token.
pub fn delete(id: &str) -> Result<(), String> {
    delete_in(&app_home(), id)
}

fn delete_in(base: &Path, id: &str) -> Result<(), String> {
    let id = sanitize_provider_id(id)?;
    let mut reg = load_registry(base);
    let before = reg.providers.len();
    reg.providers.retain(|x| x.id != id);
    if reg.providers.len() != before {
        write_registry(base, &reg)?;
    }
    remove_env_key(&env_path(base), &token_env_key(&id))?;
    Ok(())
}

/// Resolve a provider to the strings `terminal_open` injects, or `None` when the
/// preset is missing or has no token (caller falls back to subscription Claude).
pub fn resolve(id: &str) -> Result<Option<Resolved>, String> {
    resolve_in(&app_home(), id)
}

fn resolve_in(base: &Path, id: &str) -> Result<Option<Resolved>, String> {
    let id = sanitize_provider_id(id)?;
    let Some(p) = load_registry(base).providers.into_iter().find(|x| x.id == id) else {
        return Ok(None);
    };
    // Process env first (a power user may export it shell-side), then `.env`.
    let key = token_env_key(&id);
    let token = std::env::var(&key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| parse_env_key(&env_path(base), &key));
    let Some(token) = token else {
        return Ok(None);
    };
    Ok(Some(Resolved {
        base_url: p.base_url,
        auth_token: token,
        model: p.model,
        small_fast_model: p.small_fast_model,
    }))
}

// ---- Minimal `.env` reader/writer (theoi has no shared one yet). ----

/// Read `KEY=value` from a `.env`-style file. Returns the trimmed value, or
/// `None` if the file or key is absent / empty. First match wins.
fn parse_env_key(path: &Path, key: &str) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            if k.trim() == key {
                let v = v.trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

/// Upsert `KEY=value` in a `.env`-style file, preserving other lines. Rejects
/// multi-line values (single-line `.env` only).
fn write_env_key(path: &Path, key: &str, value: &str) -> Result<(), String> {
    if value.contains('\n') || value.contains('\r') {
        return Err("token must be a single line".into());
    }
    let existing = std::fs::read_to_string(path).unwrap_or_default();
    let mut lines: Vec<String> = Vec::new();
    let mut replaced = false;
    for line in existing.lines() {
        let is_key = line
            .split_once('=')
            .map(|(k, _)| k.trim() == key)
            .unwrap_or(false);
        if is_key {
            lines.push(format!("{key}={value}"));
            replaced = true;
        } else {
            lines.push(line.to_string());
        }
    }
    if !replaced {
        lines.push(format!("{key}={value}"));
    }
    let mut body = lines.join("\n");
    body.push('\n');
    write_secret_file(path, body.as_bytes())
}

/// Remove a `KEY=...` line from a `.env`-style file if present.
fn remove_env_key(path: &Path, key: &str) -> Result<(), String> {
    let Ok(existing) = std::fs::read_to_string(path) else {
        return Ok(());
    };
    let mut changed = false;
    let kept: Vec<&str> = existing
        .lines()
        .filter(|line| {
            let is_key = line
                .split_once('=')
                .map(|(k, _)| k.trim() == key)
                .unwrap_or(false);
            changed |= is_key;
            !is_key
        })
        .collect();
    if !changed {
        return Ok(());
    }
    let mut body = kept.join("\n");
    if !body.is_empty() {
        body.push('\n');
    }
    write_secret_file(path, body.as_bytes())
}

/// Write a secret file, owner-only (0600) on Unix.
fn write_secret_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

// ---- Tauri command wrappers. ----

/// All configured providers (secret-free; `has_token` flags which have a key).
#[tauri::command]
pub async fn provider_list() -> Vec<Provider> {
    list()
}

/// Create / update a provider; `token` (when present) is stored in `.env`.
#[tauri::command]
pub async fn provider_save(provider: Provider, token: Option<String>) -> Result<Provider, String> {
    save(provider, token)
}

/// Delete a provider and its stored token.
#[tauri::command]
pub async fn provider_delete(id: String) -> Result<(), String> {
    delete(&id)
}

/// The real default model the subscription `claude` CLI runs, read from the
/// user's `~/.claude/settings.json` `model` field. Returns `None` when no model
/// is pinned there — Claude Code then picks one dynamically and there is no
/// static answer to show. Used by the cockpit to label a persona that has no
/// base-model provider preset, instead of hardcoding a model name.
#[tauri::command]
pub async fn claude_default_model() -> Option<String> {
    let path = dirs::home_dir()?.join(".claude").join("settings.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    json.get("model")?.as_str().map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ot-providers-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn token_env_key_uppercases_and_underscores() {
        assert_eq!(token_env_key("deep-seek"), "PROVIDER_TOKEN_DEEP_SEEK");
        assert_eq!(token_env_key("kimi"), "PROVIDER_TOKEN_KIMI");
    }

    #[test]
    fn sanitize_provider_id_rejects_empty() {
        assert!(sanitize_provider_id("   ").is_err());
        assert!(sanitize_provider_id("!!!").is_err());
        assert_eq!(sanitize_provider_id("Deep Seek").unwrap(), "deep-seek");
    }

    #[test]
    fn env_roundtrip_write_parse_remove() {
        let base = tmp_base("env");
        let path = env_path(&base);
        write_env_key(&path, "PROVIDER_TOKEN_X", "sk-abc").unwrap();
        assert_eq!(parse_env_key(&path, "PROVIDER_TOKEN_X").as_deref(), Some("sk-abc"));
        // Upsert replaces in place, never duplicates.
        write_env_key(&path, "PROVIDER_TOKEN_X", "sk-def").unwrap();
        assert_eq!(parse_env_key(&path, "PROVIDER_TOKEN_X").as_deref(), Some("sk-def"));
        let body = std::fs::read_to_string(&path).unwrap();
        assert_eq!(body.matches("PROVIDER_TOKEN_X=").count(), 1);
        remove_env_key(&path, "PROVIDER_TOKEN_X").unwrap();
        assert_eq!(parse_env_key(&path, "PROVIDER_TOKEN_X"), None);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn save_list_resolve_roundtrip() {
        let base = tmp_base("crud");
        let p = Provider {
            id: "DeepSeek".into(),
            label: "DeepSeek".into(),
            base_url: "https://api.deepseek.com/anthropic".into(),
            model: "deepseek-chat".into(),
            small_fast_model: None, // should default to `model`
            has_token: false,
        };
        let saved = save_in(&base, p, Some("sk-test".into())).unwrap();
        assert_eq!(saved.id, "deepseek");
        assert!(saved.has_token);
        assert_eq!(saved.small_fast_model.as_deref(), Some("deepseek-chat"));

        let list = list_in(&base);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "deepseek");

        let resolved = resolve_in(&base, "deepseek").unwrap().expect("resolves");
        assert_eq!(resolved.base_url, "https://api.deepseek.com/anthropic");
        assert_eq!(resolved.auth_token, "sk-test");
        assert_eq!(resolved.model, "deepseek-chat");
        assert_eq!(resolved.small_fast_model.as_deref(), Some("deepseek-chat"));

        // Unknown id → None (fail-safe → subscription Claude).
        assert!(resolve_in(&base, "nope").unwrap().is_none());

        // Delete drops the entry and the token.
        delete_in(&base, "deepseek").unwrap();
        assert!(list_in(&base).is_empty());
        assert!(resolve_in(&base, "deepseek").unwrap().is_none());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_is_none_without_token() {
        let base = tmp_base("notoken");
        let p = Provider {
            id: "kimi".into(),
            label: "Kimi".into(),
            base_url: "https://api.moonshot.ai/anthropic".into(),
            model: "kimi-k2".into(),
            small_fast_model: Some("kimi-k2".into()),
            has_token: false,
        };
        // Save with no token → has_token false, resolve yields None.
        let saved = save_in(&base, p, None).unwrap();
        assert!(!saved.has_token);
        assert!(resolve_in(&base, "kimi").unwrap().is_none());
        let _ = std::fs::remove_dir_all(&base);
    }
}
