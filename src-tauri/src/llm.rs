//! Shared single-shot LLM text completion over a configured provider.
//!
//! CoCodes drives embedded CLIs for everything conversational; the two places
//! that need a *direct* one-off text generation — AI commit messages
//! ([`crate::ai_commit`]) and AI terminal task-labels ([`crate::ai_summary`]) —
//! both route through here. Given a provider id, a system prompt and a user
//! message, [`complete`] resolves the provider (reusing [`crate::providers`] for
//! base URL + token), picks the wire protocol, and returns the raw model reply.
//!
//! Two wire flavours mirror the two embedded CLIs:
//!   * **Anthropic-compatible** (`claude` providers) → `POST <base>/v1/messages`,
//!   * **OpenAI-compatible** (`codex` providers, `wire_api` set) →
//!     `POST <base>/chat/completions`.

use std::time::Duration;

use serde_json::json;

use crate::providers;

/// Run one blocking completion against `provider_id`. Returns the raw text reply
/// (callers sanitize/trim); errors are human strings suitable for inline display.
pub fn complete(provider_id: &str, system: &str, user: &str) -> Result<String, String> {
    // Prefer the Anthropic resolution (requires a token); fall back to the Codex
    // one, which also resolves keyless local providers.
    let (base_url, model, token, wire_api) = match providers::resolve(provider_id)? {
        Some(r) => (r.base_url, r.model, Some(r.auth_token), r.wire_api),
        None => {
            let r = providers::resolve_codex(provider_id)?
                .ok_or_else(|| format!("provider '{provider_id}' is not configured"))?;
            (r.base_url, r.model, r.token, Some("chat".to_string()))
        }
    };

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    if wire_api.is_some() {
        openai_chat(&client, &base_url, token.as_deref(), &model, system, user)
    } else {
        anthropic_messages(&client, &base_url, token.as_deref(), &model, system, user)
    }
}

/// `POST <base>/v1/messages` (Anthropic wire). `base_url` already ends in the
/// vendor's Anthropic root (e.g. `https://api.moonshot.ai/anthropic`).
fn anthropic_messages(
    client: &reqwest::blocking::Client,
    base_url: &str,
    token: Option<&str>,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, String> {
    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));
    let body = json!({
        "model": model,
        "max_tokens": 128,
        "system": system,
        "messages": [{ "role": "user", "content": user }],
    });
    let mut req = client
        .post(&url)
        .header("anthropic-version", "2023-06-01")
        .json(&body);
    if let Some(t) = token {
        req = req.header("x-api-key", t);
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let json = ok_json(resp)?;
    // { content: [ { type: "text", text: "…" } ] }
    json.get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.iter().find_map(|b| b.get("text").and_then(|t| t.as_str())))
        .map(str::to_string)
        .ok_or_else(|| "no text in provider response".into())
}

/// `POST <base>/chat/completions` (OpenAI wire). `base_url` ends in `/v1`.
fn openai_chat(
    client: &reqwest::blocking::Client,
    base_url: &str,
    token: Option<&str>,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let body = json!({
        "model": model,
        "max_tokens": 128,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
    });
    let mut req = client.post(&url).json(&body);
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let json = ok_json(resp)?;
    // { choices: [ { message: { content: "…" } } ] }
    json.get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(str::to_string)
        .ok_or_else(|| "no content in provider response".into())
}

/// Parse a successful JSON body, or turn a non-2xx into a trimmed error string
/// (the provider's message, capped) for inline display.
fn ok_json(resp: reqwest::blocking::Response) -> Result<serde_json::Value, String> {
    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let body = resp.text().unwrap_or_default();
        return Err(format!("{code}: {}", body.chars().take(200).collect::<String>()));
    }
    resp.json().map_err(|e| e.to_string())
}
