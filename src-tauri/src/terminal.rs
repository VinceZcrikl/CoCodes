//! Embedded-terminal PTY bridge.
//!
//! Spawns the `claude` CLI inside a real pseudo-terminal and pipes it to an
//! xterm.js surface in the cockpit. The frontend renders the terminal and
//! relays keystrokes; the composer can also inject a line straight into the
//! PTY's stdin (`terminal_write` + `\r`) — that's how the chat box "drives"
//! the embedded claude.
//!
//! Each profile gets its own claude session spawned with the profile's persona
//! (SOUL.md) and memory (MEMORY.md / USER.md) folded into
//! `--append-system-prompt-file`, so the terminal-side claude speaks with the
//! profile's identity.
//!
//! Auth: we never set `ANTHROPIC_API_KEY`, so claude falls back to the user's
//! subscription OAuth (`/login`) credentials in `~/.claude` — no API key
//! required. The spawned child inherits the parent environment.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::persona::PersonaContext;

/// One live PTY-backed claude session. The master side stays open for resize;
/// the writer is a cloned handle for stdin; the child is held so we can reap /
/// kill it on close.
struct TerminalSession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    persona_file: Option<PathBuf>,
}

/// App-managed table of live terminal sessions keyed by the id we hand the
/// frontend. A std `Mutex` is fine here — every critical section is a short,
/// non-awaiting handle juggle.
#[derive(Default)]
pub struct TerminalRegistry {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

#[derive(Clone, Serialize)]
struct DataEvent {
    id: String,
    /// base64 of the raw PTY bytes — keeps multi-byte UTF-8 intact across
    /// chunk boundaries; the frontend decodes to a Uint8Array for xterm.
    data: String,
}

#[derive(Clone, Serialize)]
struct ExitEvent {
    id: String,
    code: Option<i32>,
}

/// Structured failure the frontend can branch on. `ClaudeNotFound` drives the
/// "install claude" card instead of a generic error toast.
#[derive(Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum TerminalError {
    ClaudeNotFound(String),
    Spawn(String),
    Internal(String),
}

impl TerminalError {
    fn internal(e: impl std::fmt::Display) -> Self {
        TerminalError::Internal(e.to_string())
    }
}

/// 16 random bytes as hex — a session id without pulling in the `uuid` crate.
fn gen_id() -> String {
    let mut buf = [0u8; 16];
    // getrandom failure is effectively impossible on desktop, so a weak
    // fallback is acceptable.
    if getrandom::getrandom(&mut buf).is_err() {
        for (i, b) in buf.iter_mut().enumerate() {
            *b = (i as u8).wrapping_mul(31).wrapping_add(7);
        }
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// Resolve the `claude` binary. GUI apps on macOS launch with a minimal PATH
/// (no /usr/local/bin, no node-manager dirs), so we search PATH first, then a
/// list of common global-install locations. Returns the absolute path.
fn find_claude() -> Option<PathBuf> {
    let exe = if cfg!(windows) { "claude.cmd" } else { "claude" };

    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(exe);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    let home = dirs::home_dir();
    let mut extras: Vec<PathBuf> = vec![
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
    ];
    if let Some(h) = home {
        extras.push(h.join(".npm-global/bin"));
        extras.push(h.join(".local/bin"));
        extras.push(h.join(".bun/bin"));
        extras.push(h.join(".local/share/claude/bin"));
    }
    extras
        .into_iter()
        .map(|d| d.join(exe))
        .find(|c| c.is_file())
}

/// Fold the profile's persona + memory into the file we pass to
/// `--append-system-prompt-file`. Returns `None` when there's nothing to say,
/// so claude keeps its own default identity rather than getting an empty
/// system-prompt append.
fn write_persona_file(id: &str, ctx: &PersonaContext) -> Option<PathBuf> {
    let mut sections: Vec<String> = Vec::new();

    let soul = ctx.soul.trim();
    if !soul.is_empty() {
        let name = ctx.name.trim();
        sections.push(if name.is_empty() {
            soul.to_string()
        } else {
            format!("You are {name}.\n\n{soul}")
        });
    }
    let memory = ctx.memory.trim();
    if !memory.is_empty() {
        sections.push(format!("## What you remember\n\n{memory}"));
    }
    let user = ctx.user_profile.trim();
    if !user.is_empty() {
        sections.push(format!("## About the user\n\n{user}"));
    }

    if sections.is_empty() {
        return None;
    }

    let path = std::env::temp_dir().join(format!("openterminus-claude-persona-{id}.md"));
    match std::fs::write(&path, sections.join("\n\n")) {
        Ok(()) => Some(path),
        Err(e) => {
            tracing::warn!("terminal: failed to write persona file: {e}");
            None
        }
    }
}

/// Open a PTY, spawn `claude` with the active profile's persona/memory, and
/// start streaming its output as `terminal://data` events. Returns the session
/// id the frontend uses to write/resize/close and to filter inbound events.
#[tauri::command]
pub async fn terminal_open(
    profile_id: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    // `claude_session_id`: claude conversation UUID this terminal binds to, so
    // each cockpit-side Claude session maps to a distinct, resumable claude
    // chat. `resume`: true → `--resume` an existing session; false/absent →
    // start it with `--session-id`.
    claude_session_id: Option<String>,
    resume: Option<bool>,
    app: AppHandle,
    reg: State<'_, TerminalRegistry>,
) -> Result<String, TerminalError> {
    let claude = find_claude().ok_or_else(|| {
        TerminalError::ClaudeNotFound(
            "`claude` not found on PATH. Install it with `npm i -g @anthropic-ai/claude-code`."
                .into(),
        )
    })?;

    let id = gen_id();

    // Persona + memory for this profile (app-owned, from ~/.openterminus).
    let persona_ctx = crate::persona::load_persona_context(profile_id.clone()).await;
    let persona_file = write_persona_file(&id, &persona_ctx);

    let size = PtySize {
        cols: cols.unwrap_or(80).max(2),
        rows: rows.unwrap_or(24).max(2),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = native_pty_system()
        .openpty(size)
        .map_err(TerminalError::internal)?;

    let mut cmd = CommandBuilder::new(claude.as_os_str());
    if let Some(file) = persona_file.as_ref() {
        cmd.arg("--append-system-prompt-file");
        cmd.arg(file.as_os_str());
    }
    // Bind this terminal to a specific claude conversation so the sidebar can
    // list / resume independent Claude sessions.
    if let Some(sid) = claude_session_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if resume.unwrap_or(false) {
            cmd.arg("--resume");
        } else {
            cmd.arg("--session-id");
        }
        cmd.arg(sid);
    }
    // Run claude from the user's home so relative paths and CLAUDE.md discovery
    // behave like a normal shell launch. Pre-trust the dir in ~/.claude.json so
    // the workspace-trust dialog doesn't reappear on every relaunch — our PTY
    // close SIGKILLs claude, which can drop its own persistence of the accept.
    if let Some(home) = dirs::home_dir() {
        ensure_claude_trusts(&home);
        cmd.cwd(home);
    }
    // Force a real terminal type so claude's TUI renders correctly in xterm.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let writer = pair
        .master
        .take_writer()
        .map_err(TerminalError::internal)?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(TerminalError::internal)?;

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| TerminalError::Spawn(e.to_string()))?;
    // Drop the slave handle so the master sees EOF once claude exits — without
    // this the read thread would block forever after the child is gone.
    drop(pair.slave);

    reg.sessions.lock().unwrap().insert(
        id.clone(),
        TerminalSession {
            writer,
            master: pair.master,
            child,
            persona_file,
        },
    );

    // Pump PTY output → frontend. Runs until EOF (claude exited) or read error.
    let app_for_thread = app.clone();
    let id_for_thread = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let payload = DataEvent {
                        id: id_for_thread.clone(),
                        data: STANDARD.encode(&buf[..n]),
                    };
                    let _ = app_for_thread.emit("terminal://data", payload);
                }
                Err(_) => break,
            }
        }

        // Reap the child and notify the frontend. Removing from the registry
        // here also covers the case where claude exits on its own (vs an
        // explicit terminal_close).
        let reg = app_for_thread.state::<TerminalRegistry>();
        let session = reg.sessions.lock().unwrap().remove(&id_for_thread);
        let code = session.and_then(|mut s| {
            cleanup_persona(&s.persona_file);
            s.child.wait().ok().map(|status| status.exit_code() as i32)
        });
        let _ = app_for_thread.emit(
            "terminal://exit",
            ExitEvent {
                id: id_for_thread,
                code,
            },
        );
    });

    Ok(id)
}

/// Write bytes to the PTY stdin. Shared by keystroke relay and composer
/// injection — the latter appends `\r` to submit the line to claude.
#[tauri::command]
pub async fn terminal_write(
    id: String,
    data: String,
    reg: State<'_, TerminalRegistry>,
) -> Result<(), TerminalError> {
    let mut sessions = reg.sessions.lock().unwrap();
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| TerminalError::Internal("no such terminal".into()))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(TerminalError::internal)?;
    session.writer.flush().map_err(TerminalError::internal)?;
    Ok(())
}

/// Resize the PTY (sends SIGWINCH) when the xterm surface reflows.
#[tauri::command]
pub async fn terminal_resize(
    id: String,
    cols: u16,
    rows: u16,
    reg: State<'_, TerminalRegistry>,
) -> Result<(), TerminalError> {
    let sessions = reg.sessions.lock().unwrap();
    let session = sessions
        .get(&id)
        .ok_or_else(|| TerminalError::Internal("no such terminal".into()))?;
    session
        .master
        .resize(PtySize {
            cols: cols.max(2),
            rows: rows.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(TerminalError::internal)?;
    Ok(())
}

/// Kill the claude child and drop the session. Safe to call after the child
/// already exited on its own (the read thread may have removed it first).
#[tauri::command]
pub async fn terminal_close(
    id: String,
    reg: State<'_, TerminalRegistry>,
) -> Result<(), TerminalError> {
    let session = reg.sessions.lock().unwrap().remove(&id);
    if let Some(mut session) = session {
        let _ = session.child.kill();
        let _ = session.child.wait();
        cleanup_persona(&session.persona_file);
    }
    Ok(())
}

fn cleanup_persona(persona_file: &Option<PathBuf>) {
    if let Some(path) = persona_file {
        let _ = std::fs::remove_file(path);
    }
}

/// Mark `dir` as a trusted workspace in `~/.claude.json` so Claude Code skips
/// the "Do you trust this folder?" dialog. Reads the existing config, flips a
/// single boolean under `projects.<dir>.hasTrustDialogAccepted`, and writes it
/// back, preserving everything else. Best-effort: any failure just means the
/// dialog shows as before.
///
/// This is the atomic, preserve-the-rest config-edit pattern the roadmap
/// generalizes into `config_edit` for per-CLI provider switching (§8).
fn ensure_claude_trusts(dir: &std::path::Path) {
    let Some(home) = dirs::home_dir() else {
        return;
    };
    let cfg_path = home.join(".claude.json");

    let mut root: serde_json::Value = std::fs::read_to_string(&cfg_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let Some(obj) = root.as_object_mut() else {
        return;
    };

    let projects = obj
        .entry("projects")
        .or_insert_with(|| serde_json::json!({}));
    let Some(projects) = projects.as_object_mut() else {
        return;
    };

    let key = dir.to_string_lossy().to_string();
    let entry = projects
        .entry(key)
        .or_insert_with(|| serde_json::json!({}));
    let Some(entry) = entry.as_object_mut() else {
        return;
    };

    // Already trusted → don't rewrite (avoids clobbering a concurrent writer).
    if entry
        .get("hasTrustDialogAccepted")
        .and_then(serde_json::Value::as_bool)
        == Some(true)
    {
        return;
    }
    entry.insert("hasTrustDialogAccepted".into(), serde_json::Value::Bool(true));

    if let Ok(s) = serde_json::to_string_pretty(&root) {
        let _ = std::fs::write(&cfg_path, s);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persona_file_renders_named_sections() {
        let ctx = PersonaContext {
            soul: "You speak tersely.".into(),
            memory: "The project is OpenTerminus.".into(),
            user_profile: "Prefers Rust.".into(),
            name: "Atlas".into(),
        };
        let path = write_persona_file("test-render", &ctx).expect("some file");
        let body = std::fs::read_to_string(&path).unwrap();
        let _ = std::fs::remove_file(&path);
        assert!(body.contains("You are Atlas."));
        assert!(body.contains("You speak tersely."));
        assert!(body.contains("## What you remember"));
        assert!(body.contains("## About the user"));
    }

    #[test]
    fn persona_file_is_none_when_empty() {
        let ctx = PersonaContext {
            soul: "   ".into(),
            memory: String::new(),
            user_profile: String::new(),
            name: "Atlas".into(),
        };
        assert!(write_persona_file("test-empty", &ctx).is_none());
    }
}
