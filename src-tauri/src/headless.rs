//! Headless `claude` runs for the custom chat UI.
//!
//! Spawns `claude -p <prompt> --output-format stream-json --verbose
//! --include-partial-messages` (no PTY), reusing the exact same binary
//! discovery, persona injection and environment as the interactive terminal
//! ([`crate::terminal`]) — so headless runs authenticate via the Claude Code
//! subscription login in `~/.claude`, never an API key.
//!
//! Each NDJSON stdout line is forwarded to the frontend as a `claude-run://event`
//! Tauri event; process exit emits `claude-run://done`. Stderr lines (auth /
//! usage errors) go out as `claude-run://stderr`. Multi-turn continuity is the
//! caller's job: pass the conversation id as `session_id` with `resume: true`
//! on every turn after the first.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Live headless runs, keyed by `run_id`, so a run can be cancelled.
#[derive(Default)]
pub struct RunRegistry(pub Mutex<HashMap<String, Arc<Mutex<Option<Child>>>>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunLine {
    run_id: String,
    line: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunDone {
    run_id: String,
    code: Option<i32>,
}

/// Spawn one headless claude turn. Returns immediately; output streams as
/// `claude-run://event` / `claude-run://stderr` and finishes with
/// `claude-run://done`, all tagged with `run_id`.
#[tauri::command]
pub async fn claude_run(
    run_id: String,
    prompt: String,
    profile_id: Option<String>,
    session_id: Option<String>,
    resume: Option<bool>,
    cwd: Option<String>,
    model: Option<String>,
    app: AppHandle,
    reg: State<'_, RunRegistry>,
) -> Result<(), String> {
    let binary = crate::terminal::find_claude().ok_or_else(|| "claude binary not found".to_string())?;

    let persona = crate::terminal::claude_persona_args(&run_id, profile_id.clone()).await;

    let mut cmd = Command::new(&binary);
    cmd.arg("-p")
        .arg(&prompt)
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages");

    if let Some((file, replace)) = persona.as_ref() {
        cmd.arg(if *replace {
            "--system-prompt-file"
        } else {
            "--append-system-prompt-file"
        });
        cmd.arg(file);
    }

    // Conversation binding: a fresh id uses `--session-id`; an existing one is
    // continued with `--resume` (reusing `--session-id` errors "already in use").
    if let Some(sid) = session_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        cmd.arg(if resume.unwrap_or(false) {
            "--resume"
        } else {
            "--session-id"
        });
        cmd.arg(sid);
    }

    if let Some(m) = model.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        cmd.arg("--model").arg(m);
    }

    let work_dir: Option<PathBuf> = cwd
        .as_deref()
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(dirs::home_dir);
    if let Some(dir) = &work_dir {
        crate::terminal::ensure_claude_trusts(dir);
        cmd.current_dir(dir);
    }

    // Subscription OAuth unless the persona selected a third-party provider.
    for (k, v) in crate::terminal::claude_env_overrides(profile_id.as_deref()) {
        match v {
            Some(val) => {
                cmd.env(&k, &val);
            }
            None => {
                cmd.env_remove(&k);
            }
        }
    }

    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("spawn claude failed: {e}"))?;
    let stdout = child.stdout.take().ok_or_else(|| "no stdout pipe".to_string())?;
    let stderr = child.stderr.take();

    let shared: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(Some(child)));
    reg.0.lock().unwrap().insert(run_id.clone(), shared);

    // Stderr → surface auth / usage errors.
    if let Some(stderr) = stderr {
        let app_e = app.clone();
        let rid = run_id.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                let _ = app_e.emit("claude-run://stderr", RunLine { run_id: rid.clone(), line });
            }
        });
    }

    // Stdout NDJSON → one event per line; reap on EOF.
    let app_o = app.clone();
    let rid = run_id.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.is_empty() {
                continue;
            }
            let _ = app_o.emit("claude-run://event", RunLine { run_id: rid.clone(), line });
        }
        let code = {
            let reg = app_o.state::<RunRegistry>();
            let entry = reg.0.lock().unwrap().remove(&rid);
            entry
                .and_then(|s| s.lock().unwrap().take())
                .and_then(|mut c| c.wait().ok())
                .and_then(|st| st.code())
        };
        let _ = app_o.emit("claude-run://done", RunDone { run_id: rid, code });
    });

    Ok(())
}

/// Kill a running headless claude turn (if still alive).
#[tauri::command]
pub fn claude_run_cancel(run_id: String, reg: State<'_, RunRegistry>) {
    let entry = reg.0.lock().unwrap().get(&run_id).cloned();
    if let Some(shared) = entry {
        if let Some(child) = shared.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }
}
