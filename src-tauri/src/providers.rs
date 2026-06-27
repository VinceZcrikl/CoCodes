//! Per-persona base-model provider presets.
//!
//! A "provider" is a third-party model endpoint a persona can point its embedded
//! CLI at, instead of the vendor default:
//!   * **Anthropic-compatible** (DeepSeek, Kimi/Moonshot, …) for the `claude` CLI,
//!   * **OpenAI-compatible** (Ollama, LM Studio, DeepSeek, …) for the `codex` CLI.
//!
//! The registry lives at `~/.cocodes/providers.json` and is **secret-free**:
//! tokens are stored separately in `~/.cocodes/.env` under `PROVIDER_TOKEN_<ID>`,
//! and the registry only carries a `has_token` flag. `wire_api` is set on
//! OpenAI/Codex providers (`"chat"` | `"responses"`) and absent on Anthropic ones.
//!
//! [`terminal_open`](crate::terminal) calls [`resolve`] (Claude) or
//! [`resolve_codex`] (Codex) at spawn time and injects the result into that one
//! process — per-persona, no global file touched. For Claude a missing preset or
//! token yields `None` (falls back to subscription Claude); for Codex a missing
//! token is allowed (local providers like Ollama need no key).

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
    /// Codex/OpenAI wire protocol: `"chat"` (default) or `"responses"`. Set on
    /// OpenAI-compatible providers (for the `codex` CLI); `None` on Anthropic
    /// ones (for `claude`). Its presence is how the UI tells the two kinds apart.
    #[serde(default)]
    pub wire_api: Option<String>,
    /// Codex model metadata for custom models (the `codex` CLI). Codex warns
    /// "Model metadata for <model> not found" and falls back to conservative
    /// defaults for unknown slugs; setting these injects `model_context_window`
    /// / `model_max_output_tokens` so compaction and limits are correct.
    #[serde(default)]
    pub context_window: Option<i64>,
    #[serde(default)]
    pub max_output_tokens: Option<i64>,
    #[serde(default)]
    pub has_token: bool,
}

/// The strings [`terminal_open`](crate::terminal) injects for a persona's chosen
/// provider.
pub struct Resolved {
    /// Human-readable provider label (e.g. "DeepSeek"), used to tell the model
    /// its true identity in the persona system prompt.
    pub name: String,
    pub base_url: String,
    pub auth_token: String,
    pub model: String,
    pub small_fast_model: Option<String>,
}

/// What the Codex launch path needs to route a `codex` process through the
/// loopback translator proxy ([`crate::codex_proxy`]): the human-readable name
/// (shown in Codex), the upstream OpenAI-compatible Chat Completions base URL,
/// the model, and the API key. Unlike [`Resolved`], the `token` is optional —
/// local providers (Ollama, LM Studio) need no API key.
pub struct ResolvedCodex {
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub token: Option<String>,
    /// Codex model metadata overrides (see [`Provider::context_window`]).
    pub context_window: Option<i64>,
    pub max_output_tokens: Option<i64>,
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
        name: if p.label.trim().is_empty() { p.id.clone() } else { p.label.clone() },
        base_url: p.base_url,
        auth_token: token,
        model: p.model,
        small_fast_model: p.small_fast_model,
    }))
}

/// Resolve a provider for the `codex` CLI. Returns `None` only when the preset id
/// is unknown — a missing token is fine (local providers like Ollama need none),
/// surfacing as `token: None` so the proxy forwards without an `Authorization`
/// header. Called both at spawn time and per-request from [`crate::codex_proxy`].
pub fn resolve_codex(id: &str) -> Result<Option<ResolvedCodex>, String> {
    resolve_codex_in(&app_home(), id)
}

fn resolve_codex_in(base: &Path, id: &str) -> Result<Option<ResolvedCodex>, String> {
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
    Ok(Some(ResolvedCodex {
        name: if p.label.trim().is_empty() { p.id.clone() } else { p.label },
        base_url: p.base_url,
        model: p.model,
        token,
        context_window: p.context_window,
        max_output_tokens: p.max_output_tokens,
    }))
}

// ---- Minimal `.env` reader/writer (cocodes has no shared one yet). ----

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

/// Fetch the live model list from a provider's OpenAI-compatible `…/models`
/// endpoint so the UI dropdown reflects what the vendor actually offers (e.g.
/// Kimi at `https://api.moonshot.ai/v1/models`). `token` is the key the user just
/// typed; when blank, the stored key for `provider_id` is used. Returns the model
/// ids — the caller falls back to its static preset list on any error.
#[tauri::command]
pub async fn provider_models(
    models_url: String,
    provider_id: Option<String>,
    token: Option<String>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fetch_models_blocking(&models_url, provider_id.as_deref(), token.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn fetch_models_blocking(
    models_url: &str,
    provider_id: Option<&str>,
    token: Option<&str>,
) -> Result<Vec<String>, String> {
    // Prefer the freshly-typed key; otherwise the stored one (token storage is
    // kind-agnostic, so resolve_codex finds it for claude providers too).
    let token = token
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .or_else(|| {
            provider_id
                .and_then(|id| resolve_codex(id).ok().flatten())
                .and_then(|r| r.token)
        });

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(models_url);
    if let Some(t) = token.as_deref() {
        req = req.bearer_auth(t);
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let body = resp.text().unwrap_or_default();
        return Err(format!("{code} {}", body.chars().take(200).collect::<String>()));
    }
    let v: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let ids = v
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|x| x.as_str()).map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(ids)
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
            wire_api: None,
            context_window: None,
            max_output_tokens: None,
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
            wire_api: None,
            context_window: None,
            max_output_tokens: None,
            has_token: false,
        };
        // Save with no token → has_token false, resolve yields None.
        let saved = save_in(&base, p, None).unwrap();
        assert!(!saved.has_token);
        assert!(resolve_in(&base, "kimi").unwrap().is_none());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_codex_allows_missing_token_and_defaults_wire_api() {
        let base = tmp_base("codex");
        // A keyless local provider (Ollama-style) still resolves for codex.
        let local = Provider {
            id: "ollama-oss".into(),
            label: "Ollama".into(),
            base_url: "http://localhost:11434/v1".into(),
            model: "gpt-oss:20b".into(),
            small_fast_model: None,
            wire_api: None, // → defaults to "chat"
            context_window: None,
            max_output_tokens: None,
            has_token: false,
        };
        save_in(&base, local, None).unwrap();
        let r = resolve_codex_in(&base, "ollama-oss").unwrap().expect("resolves");
        assert_eq!(r.base_url, "http://localhost:11434/v1");
        assert_eq!(r.model, "gpt-oss:20b");
        assert_eq!(r.name, "Ollama");
        assert!(r.token.is_none());

        // A cloud provider carries its key through for the proxy to inject.
        let cloud = Provider {
            id: "deepseek-codex".into(),
            label: "DeepSeek".into(),
            base_url: "https://api.deepseek.com/v1".into(),
            model: "deepseek-chat".into(),
            small_fast_model: None,
            wire_api: Some("chat".into()),
            context_window: Some(131072),
            max_output_tokens: Some(8192),
            has_token: false,
        };
        save_in(&base, cloud, Some("sk-codex".into())).unwrap();
        let r = resolve_codex_in(&base, "deepseek-codex").unwrap().expect("resolves");
        assert_eq!(r.token.as_deref(), Some("sk-codex"));
        assert_eq!(r.context_window, Some(131072));
        assert_eq!(r.max_output_tokens, Some(8192));

        // Unknown id → None.
        assert!(resolve_codex_in(&base, "nope").unwrap().is_none());
        let _ = std::fs::remove_dir_all(&base);
    }
}
