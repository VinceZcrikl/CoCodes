//! AI commit-message generation for the Git panel.
//!
//! The panel's Commit button has no text box: it stages everything, then asks a
//! user-chosen base-model provider to summarize the staged diff into a single
//! conventional-commit subject line. This is the app's only direct LLM text
//! call — the rest of CoCodes drives embedded CLIs — so it's deliberately small:
//! one blocking `reqwest` POST to the provider the persona already configured,
//! reusing [`crate::providers`] for the base URL + token.
//!
//! Providers come in two wire flavours (mirroring the two embedded CLIs):
//!   * **Anthropic-compatible** (`claude` providers) → `POST <base>/v1/messages`,
//!   * **OpenAI-compatible** (`codex` providers, `wire_api` set) →
//!     `POST <base>/chat/completions`.
//! We branch on the resolved `wire_api` so either kind can generate a message.

use serde::Serialize;

use crate::providers::{self, Provider};

/// A provider offered in the Commit model dropdown: the id/label to show and
/// whether a token is on file (local Codex providers may legitimately have none).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitProvider {
    id: String,
    label: String,
    model: String,
    has_token: bool,
}

/// Providers usable for AI commit messages: every configured provider that can
/// actually answer — i.e. has a token, or is a local (keyless) Codex endpoint.
/// The frontend defaults the dropdown to the active persona's `base_model`.
#[tauri::command]
pub async fn ai_commit_providers() -> Vec<CommitProvider> {
    providers::list()
        .into_iter()
        .filter(usable)
        .map(|p| CommitProvider {
            has_token: p.has_token,
            id: p.id,
            label: if p.label.trim().is_empty() { "provider".into() } else { p.label },
            model: p.model,
        })
        .collect()
}

/// A provider can generate a message if it has a stored token, or is a keyless
/// local Codex endpoint (Ollama / LM Studio — a loopback base URL).
fn usable(p: &Provider) -> bool {
    p.has_token || (p.wire_api.is_some() && is_local(&p.base_url))
}

fn is_local(base_url: &str) -> bool {
    let b = base_url.to_ascii_lowercase();
    b.contains("localhost") || b.contains("127.0.0.1") || b.contains("0.0.0.0")
}

/// System instruction: one line, conventional-commit style, no chatter. Kept
/// terse so small/local models comply.
const SYSTEM_PROMPT: &str = "You are a git commit message generator. Given a \
staged diff, reply with ONE concise commit message subject line in the \
Conventional Commits style (e.g. \"fix(auth): handle expired tokens\"). Use the \
imperative mood, no trailing period, at most 72 characters. Output ONLY the \
subject line — no body, no quotes, no explanation, no code fences.";

/// Generate a commit-message subject line from a staged diff using the given
/// provider. Returns a trimmed single line, or an error string the panel shows
/// inline. Never falls back to a canned message: a failed generation must not
/// silently commit a meaningless subject.
#[tauri::command]
pub async fn ai_commit_message(provider_id: String, diff: String) -> Result<String, String> {
    if diff.trim().is_empty() {
        return Err("nothing staged to summarize".into());
    }
    tauri::async_runtime::spawn_blocking(move || generate(&provider_id, &diff))
        .await
        .map_err(|e| e.to_string())?
}

fn generate(provider_id: &str, diff: &str) -> Result<String, String> {
    let user = format!("Staged diff:\n\n{diff}");
    Ok(sanitize(&crate::llm::complete(provider_id, SYSTEM_PROMPT, &user)?))
}

/// Reduce a model reply to a single clean subject line: first non-empty line,
/// stripped of code fences / surrounding quotes / a leading list marker, capped
/// at 72 chars.
fn sanitize(raw: &str) -> String {
    let line = raw
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("```"))
        .unwrap_or("")
        .trim_matches(|c| c == '"' || c == '`' || c == '\'')
        .trim_start_matches("- ")
        .trim();
    line.chars().take(72).collect::<String>().trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::{is_local, sanitize};

    #[test]
    fn sanitize_strips_fences_quotes_and_caps() {
        assert_eq!(sanitize("```\nfeat: add panel\n```"), "feat: add panel");
        assert_eq!(sanitize("\"fix: bug\""), "fix: bug");
        assert_eq!(sanitize("- chore: tidy"), "chore: tidy");
        let long = "feat: ".to_string() + &"x".repeat(100);
        assert_eq!(sanitize(&long).chars().count(), 72);
    }

    #[test]
    fn local_detection() {
        assert!(is_local("http://localhost:11434/v1"));
        assert!(is_local("http://127.0.0.1:1234/v1"));
        assert!(!is_local("https://api.deepseek.com/v1"));
    }
}
