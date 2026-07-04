//! AI task-labeling for terminal panes.
//!
//! When many panes are open they all read "claude" / "codex" and become
//! indistinguishable. This asks a user-configured provider to condense a pane's
//! recent transcript (see [`crate::terminal::terminal_tail`]) into a short
//! task label — e.g. "refactor git panel layout" — shown in the pane header and
//! sidebar. Reuses [`crate::llm`], the same plumbing as AI commit messages.

/// Max characters for a task label. Longer than a commit subject is pointless —
/// it must fit a pane header chip.
const LABEL_MAX_CHARS: usize = 48;

const SYSTEM_PROMPT: &str = "You label coding-assistant terminal sessions so a \
user can tell many open terminals apart. Given the recent transcript of one \
terminal, reply with a SHORT task label (3 to 6 words) describing the TASK being \
worked on. Rules: START WITH A VERB in the imperative (e.g. \"refactor git panel \
layout\", \"debug auth token refresh\", \"add screenshot permission prompt\"). \
Describe the intent, NOT the code — NEVER output a bare function name, file path, \
line number, commit hash, or a raw code snippet. Use lowercase, no trailing \
punctuation, no quotes, no code fences. Output ONLY the label.";

/// Summarize a pane's recent transcript into a short task label. Returns a
/// trimmed lowercase phrase, or an error string for inline display. Never
/// invents a label from nothing: an empty transcript is an error the caller
/// treats as "keep the current label".
#[tauri::command]
pub async fn ai_summarize_terminal(
    provider_id: String,
    transcript: String,
) -> Result<String, String> {
    if transcript.trim().is_empty() {
        return Err("no terminal output to summarize".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        // Prefer the prose/dialogue in the transcript over raw code & diffs, so
        // the model labels the *intent* rather than grabbing a function name.
        let cleaned = denoise(&transcript);
        let body = if cleaned.trim().is_empty() { &transcript } else { &cleaned };
        let user = format!("Terminal transcript:\n\n{body}");
        let raw = crate::llm::complete(&provider_id, SYSTEM_PROMPT, &user)?;
        let label = sanitize(&raw);
        if label.is_empty() {
            return Err("model returned an empty label".into());
        }
        Ok(label)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Max characters for a completion report — one spoken sentence, not a paragraph.
const REPORT_MAX_CHARS: usize = 140;

const REPORT_PROMPT: &str = "You are a coding terminal's little mascot reporting \
back to your player. Given the recent transcript of one coding-assistant terminal \
session, reply with ONE short sentence (at most 24 words) summarizing what was \
just accomplished or where things stand — first person, playful but informative, \
like a game companion reporting quest progress. Reply in the SAME LANGUAGE as the \
transcript. No quotes, no markdown, no code. Output ONLY the sentence.";

/// Generate a game-companion style one-sentence report of what a pane just
/// finished doing. Shown in the Session Deck's speech bubble when a run ends.
/// Same provider plumbing as labels; same "never invent from nothing" rule.
#[tauri::command]
pub async fn ai_pane_report(
    provider_id: String,
    transcript: String,
) -> Result<String, String> {
    if transcript.trim().is_empty() {
        return Err("no terminal output to report on".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let cleaned = denoise(&transcript);
        let body = if cleaned.trim().is_empty() { &transcript } else { &cleaned };
        let user = format!("Terminal transcript:\n\n{body}");
        let raw = crate::llm::complete(&provider_id, REPORT_PROMPT, &user)?;
        let report = sanitize_report(&raw);
        if report.is_empty() {
            return Err("model returned an empty report".into());
        }
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Reduce a report reply to one clean spoken sentence: first non-empty line,
/// stripped of quotes/fences, capped. Unlike labels, case is preserved — it's a
/// sentence the character "says", not a chip.
fn sanitize_report(raw: &str) -> String {
    let line = raw
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("```"))
        .unwrap_or("")
        .trim_matches(|c| c == '"' || c == '`' || c == '\'')
        .trim();
    line.chars().take(REPORT_MAX_CHARS).collect::<String>().trim().to_string()
}

/// Drop lines that read as code rather than prose, so the summarizer keys off
/// the human/assistant dialogue (what the task IS) instead of grabbing a
/// function name or hash out of a pasted diff. Best-effort and conservative: if
/// it would strip everything, the caller falls back to the raw transcript.
pub(crate) fn denoise(transcript: &str) -> String {
    transcript
        .lines()
        .filter(|l| is_prose(l))
        .collect::<Vec<_>>()
        .join("\n")
}

/// A line is "prose" if it looks like natural language, not source. Rejects diff
/// markers, and lines dominated by code punctuation or with too few real words.
pub(crate) fn is_prose(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return false;
    }
    // Unified-diff / patch chrome.
    if t.starts_with("+++") || t.starts_with("---") || t.starts_with("@@") || t.starts_with("diff ")
    {
        return false;
    }
    // A leading source-code keyword marks a declaration/statement, not intent.
    let first = t.split_whitespace().next().unwrap_or("");
    const CODE_KW: &[&str] = &[
        "fn", "let", "const", "pub", "use", "impl", "struct", "enum", "return",
        "if", "for", "while", "match", "import", "export", "class", "def",
        "function", "var", "async", "await", "#[", "//", "/*",
    ];
    if CODE_KW.contains(&first) {
        return false;
    }
    let letters = t.chars().filter(|c| c.is_alphabetic()).count();
    // Punctuation-heavy lines (`});`, `foo(bar, baz)`, tables) are code, not intent.
    let symbols = t
        .chars()
        .filter(|c| "{}()[]<>;=:|/\\*&%$#`~".contains(*c))
        .count();
    if letters < 3 || symbols * 3 > letters {
        return false;
    }
    // snake_case / path-y tokens are identifiers, not prose words; a line whose
    // words are mostly identifiers is code. Count real prose words (alphabetic,
    // no underscores/slashes).
    let prose_words = t
        .split_whitespace()
        .filter(|w| {
            w.chars().filter(|c| c.is_alphabetic()).count() >= 2
                && !w.contains('_')
                && !w.contains('/')
                && !w.contains('.')
        })
        .count();
    prose_words >= 2
}

/// Reduce a model reply to a single clean label: first non-empty line, stripped
/// of quotes / fences / a leading list marker, lowercased, capped.
fn sanitize(raw: &str) -> String {
    let line = raw
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("```"))
        .unwrap_or("")
        .trim_matches(|c| c == '"' || c == '`' || c == '\'')
        .trim_start_matches("- ")
        .trim_end_matches(['.', '!'])
        .trim()
        .to_lowercase();
    line.chars().take(LABEL_MAX_CHARS).collect::<String>().trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::{denoise, is_prose, sanitize, sanitize_report};

    #[test]
    fn sanitize_report_keeps_case_strips_and_caps() {
        assert_eq!(
            sanitize_report("\"任务完成!Git 面板重构好了。\""),
            "任务完成!Git 面板重构好了。"
        );
        assert_eq!(sanitize_report("```\nDone — tests pass!\n```"), "Done — tests pass!");
        let long = "很".repeat(200);
        assert_eq!(sanitize_report(&long).chars().count(), 140);
    }

    #[test]
    fn is_prose_keeps_sentences_drops_code() {
        assert!(is_prose("I refactored the git panel to use a split button."));
        assert!(is_prose("Let me run the tests now"));
        // Code / diff / punctuation-heavy lines are rejected.
        assert!(!is_prose("  fn git_inner_function(cwd: &str) {"));
        assert!(!is_prose("@@ -1,4 +1,8 @@"));
        assert!(!is_prose("});"));
        assert!(!is_prose("+++ b/src/git.rs"));
        assert!(!is_prose("3893"));
    }

    #[test]
    fn denoise_keeps_dialogue_over_diff() {
        let t = "Adding a screenshot permission prompt.\n\
                 --- a/src/screenshot.rs\n\
                 +    open_settings();\n\
                 This shows a red toast when capture fails.";
        let out = denoise(t);
        assert!(out.contains("screenshot permission prompt"));
        assert!(out.contains("red toast"));
        assert!(!out.contains("open_settings"));
    }

    #[test]
    fn sanitize_lowercases_strips_and_caps() {
        assert_eq!(sanitize("\"Refactor Git Panel.\""), "refactor git panel");
        assert_eq!(sanitize("- Debug Auth"), "debug auth");
        assert_eq!(sanitize("```\nfix build\n```"), "fix build");
        let long = "x".repeat(80);
        assert_eq!(sanitize(&long).chars().count(), 48);
    }
}
