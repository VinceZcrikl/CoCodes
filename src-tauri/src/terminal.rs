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
use std::sync::{Arc, Mutex};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Cap on the per-session replay buffer (most-recent bytes kept). A TUI like
/// Claude Code repaints the whole screen, so the recent tail reconstructs the
/// current view on reconnect.
const REPLAY_BUFFER_MAX: usize = 256 * 1024;

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
    /// Most-recent PTY output, replayed when an xterm view reconnects to this
    /// still-running session (after a reload / remount).
    buffer: Arc<Mutex<Vec<u8>>>,
    /// The model parsed from the CLI's startup banner (e.g. "Opus 4.8"), once
    /// seen. Lets a reconnecting view show the model the session is really
    /// running, without re-probing the CLI. Set by the PTY pump thread.
    detected_model: Arc<Mutex<Option<String>>>,
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

/// Result of opening a terminal. `replay` is set only when reconnecting to an
/// already-running session — base64 of its buffered output so the new xterm
/// view shows the live task instead of a blank screen.
#[derive(Serialize)]
pub struct OpenResult {
    id: String,
    replay: Option<String>,
    /// Model parsed from the banner on a reconnect (None on a fresh open — the
    /// banner hasn't rendered yet; the `terminal://model` event delivers it then).
    model: Option<String>,
}

/// Emitted once the CLI's startup banner reveals which model it's running, so the
/// pane header can show the real model instead of a config guess.
#[derive(Clone, Serialize)]
struct ModelEvent {
    id: String,
    model: String,
}

/// Structured failure the frontend can branch on. `CliNotFound` drives the
/// "install <cli>" card instead of a generic error toast.
#[derive(Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum TerminalError {
    CliNotFound(String),
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

/// Search PATH then a list of common global-install dirs for `exe`.
/// GUI apps on macOS launch with a minimal PATH (no /usr/local/bin, no
/// node-manager dirs), so the fallback list is necessary.
pub(crate) fn find_in_path(exe: &str, extra_dirs: &[PathBuf]) -> Option<PathBuf> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(exe);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    extra_dirs.iter().map(|d| d.join(exe)).find(|c| c.is_file())
}

/// Common bin dirs where Node.js / package managers install `node` and `npx`.
/// GUI apps launched from Finder/Dock inherit a minimal PATH, so a spawned CLI
/// (e.g. `claude`) can't find `npx` when it tries to launch an npx-based MCP
/// server — it fails with "No such file or directory (os error 2)". Callers
/// prepend these to the inherited PATH before spawning a CLI.
pub(crate) fn node_bin_dirs() -> Vec<PathBuf> {
    let mut dirs_list = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if let Some(h) = dirs::home_dir() {
        dirs_list.push(h.join(".local/bin"));
        dirs_list.push(h.join(".npm-global/bin"));
        dirs_list.push(h.join(".bun/bin"));
        dirs_list.push(h.join(".volta/bin"));
        // nvm installs node under a per-version dir; add every version's bin so
        // whichever one holds `npx` is reachable regardless of the active alias.
        if let Ok(entries) = std::fs::read_dir(h.join(".nvm/versions/node")) {
            for e in entries.flatten() {
                let bin = e.path().join("bin");
                if bin.is_dir() {
                    dirs_list.push(bin);
                }
            }
        }
    }
    dirs_list.retain(|d| d.is_dir());
    dirs_list
}

/// Prepend `node_bin_dirs()` (and the spawned binary's own directory) to the
/// inherited PATH so child processes the CLI launches — notably npx-based MCP
/// servers — resolve on GUI-launched (minimal-PATH) apps.
pub(crate) fn cli_path_env(binary: &std::path::Path) -> std::ffi::OsString {
    let mut dirs_list = Vec::new();
    if let Some(dir) = binary.parent() {
        dirs_list.push(dir.to_path_buf());
    }
    dirs_list.extend(node_bin_dirs());
    if let Some(existing) = std::env::var_os("PATH") {
        dirs_list.extend(std::env::split_paths(&existing));
    }
    // Drop exact duplicates while preserving order (first occurrence wins).
    let mut seen = std::collections::HashSet::new();
    dirs_list.retain(|d| seen.insert(d.clone()));
    std::env::join_paths(dirs_list).unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

/// On Windows, `where.exe` reads the registry-based PATH (HKCU + HKLM) and
/// finds binaries installed after the current process started — essential for
/// CLIs installed by PowerShell scripts that modify the user PATH via registry.
#[cfg(windows)]
fn where_exe(name: &str) -> Option<PathBuf> {
    let mut cmd = std::process::Command::new("where");
    cmd.arg(name);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .map(|l| PathBuf::from(l.trim()))
        })
        .filter(|p| p.is_file())
}

fn find_claude() -> Option<PathBuf> {
    let home = dirs::home_dir();
    let mut extras = vec![
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
    ];
    if let Some(h) = &home {
        extras.push(h.join(".npm-global/bin"));
        extras.push(h.join(".local/bin"));
        extras.push(h.join(".bun/bin"));
        extras.push(h.join(".local/share/claude/bin"));
    }
    #[cfg(windows)]
    if let Ok(appdata) = std::env::var("APPDATA") {
        let npm = PathBuf::from(&appdata).join("npm");
        // Search the native binary directly before falling back to the .cmd
        // wrapper. npm-generated .cmd scripts use %~dp0 which expands to the
        // directory with a trailing backslash, giving npm\\node_modules (double
        // backslash) that Windows cannot resolve when quoted.
        extras.push(npm.join("node_modules").join("@anthropic-ai").join("claude-code").join("bin"));
        extras.push(npm);
    }

    // Windows candidates: only real Win32 executables.
    // - Bare name ("claude") is a Unix shebang script in APPDATA\npm — not a
    //   valid Win32 application (os error 193).
    // - .cmd wrappers are handled below in terminal_open via cmd.exe /D /C.
    #[cfg(windows)]
    let candidates = ["claude.exe", "claude.cmd"];
    #[cfg(not(windows))]
    let candidates = ["claude"];

    candidates.iter().find_map(|exe| find_in_path(exe, &extras))
        .or_else(|| {
            #[cfg(windows)] { where_exe("claude") }
            #[cfg(not(windows))] { None }
        })
}

fn find_codex() -> Option<PathBuf> {
    let home = dirs::home_dir();
    let mut extras = vec![
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
    ];
    if let Some(h) = &home {
        extras.push(h.join(".npm-global/bin"));
        extras.push(h.join(".local/bin"));
        extras.push(h.join(".bun/bin"));
    }
    #[cfg(windows)]
    if let Ok(appdata) = std::env::var("APPDATA") {
        let npm = PathBuf::from(&appdata).join("npm");
        extras.push(npm.join("node_modules").join("@openai").join("codex").join("bin"));
        extras.push(npm);
    }

    #[cfg(windows)]
    let candidates = ["codex.exe", "codex.cmd"];
    #[cfg(not(windows))]
    let candidates = ["codex"];

    candidates.iter().find_map(|exe| find_in_path(exe, &extras))
        // Final fallback: ask where.exe, which reads the live registry PATH
        // and finds binaries installed by PowerShell scripts after app launch.
        .or_else(|| {
            #[cfg(windows)] { where_exe("codex") }
            #[cfg(not(windows))] { None }
        })
}

fn find_grok() -> Option<PathBuf> {
    // xAI installs the `grok` binary; on Windows the PowerShell installer may
    // place it in %LOCALAPPDATA%\xai\bin which isn't always on PATH.
    let home = dirs::home_dir();
    let mut extras = vec![
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
    ];
    if let Some(h) = &home {
        extras.push(h.join(".local/bin"));
        extras.push(h.join(".grok/bin"));
        extras.push(h.join(".npm-global/bin"));
    }
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            extras.push(PathBuf::from(&local).join("xai").join("bin"));
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            extras.push(PathBuf::from(&appdata).join("npm"));
        }
    }

    #[cfg(windows)]
    let candidates = ["grok.exe", "grok.cmd"];
    #[cfg(not(windows))]
    let candidates = ["grok"];

    candidates.iter().find_map(|exe| find_in_path(exe, &extras))
        .or_else(|| {
            #[cfg(windows)] { where_exe("grok") }
            #[cfg(not(windows))] { None }
        })
}

fn find_kimi() -> Option<PathBuf> {
    // Kimi Code CLI's official install.sh drops the `kimi` binary into
    // ~/.kimi-code/bin (KIMI_INSTALL_DIR); a global npm install puts it on the
    // usual npm bin dirs.
    let home = dirs::home_dir();
    let mut extras = vec![
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
    ];
    if let Some(h) = &home {
        extras.push(h.join(".kimi-code/bin"));
        extras.push(h.join(".local/bin"));
        extras.push(h.join(".npm-global/bin"));
        extras.push(h.join(".bun/bin"));
    }
    #[cfg(windows)]
    if let Ok(appdata) = std::env::var("APPDATA") {
        extras.push(PathBuf::from(&appdata).join("npm"));
    }

    #[cfg(windows)]
    let candidates = ["kimi.exe", "kimi.cmd"];
    #[cfg(not(windows))]
    let candidates = ["kimi"];

    candidates.iter().find_map(|exe| find_in_path(exe, &extras))
        .or_else(|| {
            #[cfg(windows)] { where_exe("kimi") }
            #[cfg(not(windows))] { None }
        })
}

/// Resolve the user's interactive login shell for a plain terminal tab (the
/// "shell" CLI). Unlike the AI CLIs this is never persona/session-aware — it's
/// just a real shell in the cockpit for git, dev servers, and scratch commands.
///
/// Unix: honour `$SHELL`, then fall back to the common login shells. Windows:
/// prefer PowerShell 7 (`pwsh`), then Windows PowerShell, then `cmd.exe`.
fn find_shell() -> Option<PathBuf> {
    #[cfg(not(windows))]
    {
        if let Some(sh) = std::env::var_os("SHELL")
            .map(PathBuf::from)
            .filter(|p| p.is_file())
        {
            return Some(sh);
        }
        ["/bin/zsh", "/bin/bash", "/usr/bin/fish", "/bin/sh"]
            .iter()
            .map(PathBuf::from)
            .find(|p| p.is_file())
    }
    #[cfg(windows)]
    {
        let extras: Vec<PathBuf> = Vec::new();
        find_in_path("pwsh.exe", &extras)
            .or_else(|| where_exe("pwsh"))
            .or_else(|| find_in_path("powershell.exe", &extras))
            .or_else(|| find_in_path("cmd.exe", &extras))
            .or_else(|| std::env::var_os("ComSpec").map(PathBuf::from))
    }
}

/// The truthful-identity section appended to a third-party Claude persona's
/// system prompt, so it reports its real backend instead of parroting "I am
/// Claude, made by Anthropic". (Claude talks straight to the endpoint — no proxy
/// to intercept — so the system prompt is where we set the record straight.)
fn claude_identity_note(model: &str, provider: &str) -> String {
    format!(
        "## Your actual model (authoritative)\n\n\
         You are running on the \"{model}\" model from {provider}, an Anthropic-compatible \
         endpoint configured in CoCodes — you are NOT Anthropic's Claude. If the user asks which \
         model or provider powers you, answer truthfully and concisely: \"{model}\" (via \
         {provider}). This identity overrides any default persona; it does not change how you \
         perform tasks."
    )
}

/// Fold the profile's persona + memory into the file we pass to
/// `--append-system-prompt-file`. Returns `None` when there's nothing to say,
/// so claude keeps its own default identity rather than getting an empty
/// system-prompt append.
fn write_persona_file(id: &str, ctx: &PersonaContext, identity: Option<&str>) -> Option<PathBuf> {
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
    // Usage guidance for enabled MCP servers (e.g. "prefer the x-api tools over
    // web search"). Folded in so the model reaches for connected tools by
    // default, without the user re-stating it every turn.
    let hints = crate::mcp::enabled_usage_hints();
    if !hints.is_empty() {
        sections.push(format!("## Connected tools\n\n{}", hints.join("\n\n")));
    }

    // Truthful base-model identity (only set when this persona routes its claude
    // at a third-party Anthropic-compatible endpoint). Last so it overrides any
    // earlier "you are Claude" framing in the SOUL.
    if let Some(note) = identity {
        let note = note.trim();
        if !note.is_empty() {
            sections.push(note.to_string());
        }
    }

    if sections.is_empty() {
        return None;
    }

    let path = std::env::temp_dir().join(format!("cocodes-claude-persona-{id}.md"));
    match std::fs::write(&path, sections.join("\n\n")) {
        Ok(()) => Some(path),
        Err(e) => {
            tracing::warn!("terminal: failed to write persona file: {e}");
            None
        }
    }
}

/// Render `s` as a TOML basic string (double-quoted, with `\` and `"` escaped)
/// for a Codex `-c key=value` override. Values are URLs / model / provider names,
/// but quoting defensively keeps a stray character from breaking the TOML parse.
fn toml_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Open a PTY, spawn the requested CLI tool with the active profile's
/// persona/memory (Claude only), and stream its output as `terminal://data`
/// events. Returns the session id the frontend uses to write/resize/close.
///
/// `cli`: "claude" (default) | "codex" | "grok"
#[tauri::command]
pub async fn terminal_open(
    profile_id: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    claude_session_id: Option<String>,
    // True when this conversation already exists on disk (a previously-started
    // session being restored). Claude Code rejects a reused `--session-id` with
    // "already in use", so existing sessions must be reopened with `--resume`.
    resume: Option<bool>,
    cwd: Option<String>,
    cli: Option<String>,
    // Stable session key (the pane's id + conversation id). When a view
    // remounts with the same key and the PTY is still alive, we reconnect to it
    // rather than spawning a new process — so the running task keeps going.
    key: Option<String>,
    // True when the active panel palette is a light one. Drives COLORFGBG so a
    // CLI's TUI renders in light mode (dark text on light) rather than painting
    // an explicit dark background our xterm theme can't override.
    light: Option<bool>,
    app: AppHandle,
    reg: State<'_, TerminalRegistry>,
) -> Result<OpenResult, TerminalError> {
    let key = key.filter(|s| !s.trim().is_empty());

    // Reconnect to an already-running session with this key, replaying its
    // buffered output so the new xterm shows the live task.
    if let Some(ref k) = key {
        let sessions = reg.sessions.lock().unwrap();
        if let Some(session) = sessions.get(k) {
            let buf = session.buffer.lock().unwrap();
            let replay = if buf.is_empty() {
                None
            } else {
                Some(STANDARD.encode(&buf[..]))
            };
            let model = session.detected_model.lock().unwrap().clone();
            return Ok(OpenResult {
                id: k.clone(),
                replay,
                model,
            });
        }
    }

    let cli_name = cli.as_deref().unwrap_or("claude");

    let binary = match cli_name {
        "shell" => find_shell().ok_or_else(|| {
            TerminalError::CliNotFound(
                "No shell found. Set $SHELL or install zsh/bash (Windows: pwsh/cmd).".into(),
            )
        })?,
        "codex" => find_codex().ok_or_else(|| {
            TerminalError::CliNotFound(
                "`codex` not found on PATH. Install: npm install -g @openai/codex".into(),
            )
        })?,
        "grok" => find_grok().ok_or_else(|| {
            TerminalError::CliNotFound(
                "`grok` not found on PATH. Install: https://docs.x.ai/build"
                    .into(),
            )
        })?,
        "kimi" => find_kimi().ok_or_else(|| {
            TerminalError::CliNotFound(
                "`kimi` not found on PATH. Install: curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"
                    .into(),
            )
        })?,
        _ => find_claude().ok_or_else(|| {
            TerminalError::CliNotFound(
                "`claude` not found on PATH. Install: npm i -g @anthropic-ai/claude-code"
                    .into(),
            )
        })?,
    };

    // Use the stable key as the session id (so reconnect finds it); fall back
    // to a random id when no key was given.
    let id = key.unwrap_or_else(gen_id);

    // Resolve a Claude base-model provider up front (Claude CLI only). We need it
    // before writing the persona file so the model's true identity can be folded
    // into the system prompt; the `ANTHROPIC_*` env is injected from the same
    // value once the command is built. No preset / unresolved token → `None` →
    // claude falls back to subscription OAuth, exactly as before.
    let claude_provider = if cli_name == "claude" {
        match crate::persona::base_model_for(profile_id.as_deref()) {
            Some(preset_id) => match crate::providers::resolve(&preset_id) {
                Ok(Some(p)) => {
                    tracing::info!(
                        "terminal: persona base-model '{preset_id}' → {} ({})",
                        p.base_url,
                        p.model
                    );
                    Some((preset_id, p))
                }
                Ok(None) => {
                    tracing::warn!(
                        "terminal: base-model preset '{preset_id}' is unconfigured \
                         (missing or no token); using subscription Claude"
                    );
                    None
                }
                Err(e) => {
                    tracing::warn!(
                        "terminal: base-model resolve '{preset_id}' failed: {e}; \
                         using subscription Claude"
                    );
                    None
                }
            },
            None => None,
        }
    } else {
        None
    };

    // Persona injection is Claude Code-specific (--append-system-prompt-file).
    // For other CLIs we skip it entirely. When a third-party base model is
    // active, a truthful identity note is appended so it doesn't claim to be
    // Claude.
    let persona_file = if cli_name == "claude" {
        let ctx = crate::persona::load_persona_context(profile_id.clone()).await;
        let identity = claude_provider
            .as_ref()
            .map(|(_, p)| claude_identity_note(&p.model, &p.name));
        write_persona_file(&id, &ctx, identity.as_deref())
    } else {
        None
    };
    // Whether the SOUL replaces Claude Code's default system prompt
    // (`--system-prompt-file`) or appends to it (`--append-system-prompt-file`,
    // the default). Replace lets the persona fully dominate on third-party
    // models that otherwise ignore an appended persona.
    let replace_prompt =
        cli_name == "claude" && crate::persona::wants_replace_prompt(profile_id.as_deref());

    let size = PtySize {
        cols: cols.unwrap_or(80).max(2),
        rows: rows.unwrap_or(24).max(2),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = native_pty_system()
        .openpty(size)
        .map_err(TerminalError::internal)?;

    // On Windows, CreateProcessW cannot directly execute .cmd batch scripts —
    // they require cmd.exe /D /C as a launcher. Detect and wrap here so the
    // rest of the arg-building code is unchanged.
    #[cfg(windows)]
    let is_cmd_script = binary
        .extension()
        .map_or(false, |e| e.eq_ignore_ascii_case("cmd"));
    #[cfg(not(windows))]
    let is_cmd_script = false;

    let mut cmd = if is_cmd_script {
        let mut c = CommandBuilder::new("cmd.exe");
        c.arg("/D");
        c.arg("/C");
        c.arg(binary.as_os_str());
        c
    } else {
        CommandBuilder::new(binary.as_os_str())
    };

    if cli_name == "claude" {
        if let Some(file) = persona_file.as_ref() {
            cmd.arg(if replace_prompt {
                "--system-prompt-file"
            } else {
                "--append-system-prompt-file"
            });
            cmd.arg(file.as_os_str());
        }
        // Bind to a conversation UUID so the sidebar manages independent,
        // resumable Claude Code sessions. A brand-new conversation is created
        // with `--session-id <uuid>`; an existing one (being restored after a
        // restart) is reopened with `--resume <uuid>` — reusing `--session-id`
        // on an existing id errors with "already in use".
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
        // Attach a Notification hook so a tool-approval prompt pings CoCodes's
        // loopback listener and raises a tray notification jumping back to this pane.
        // MCP servers are NOT injected here — they are written to
        // ~/.claude/settings.json by mcp_save() so Claude Code picks them up from
        // the file, which avoids double-starting the same MCP process.
        if let Some(settings) = crate::notify_hooks::claude_settings_arg(&id) {
            cmd.arg("--settings");
            cmd.arg(settings);
        }
    }

    // Resolve working directory for all CLIs.
    let work_dir: Option<PathBuf> = cwd
        .as_deref()
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(dirs::home_dir);
    if let Some(dir) = &work_dir {
        if cli_name == "claude" {
            ensure_claude_trusts(dir);
        }
        cmd.cwd(dir);
    }

    // Force a real terminal type so every CLI's TUI renders correctly in xterm.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // GUI apps launched from Finder/Dock inherit a minimal PATH. Give the CLI a
    // PATH that includes the common node/npx dirs so it can launch npx-based MCP
    // servers (otherwise `/mcp` reports them "failed" with os error 2).
    cmd.env("PATH", cli_path_env(&binary));

    // Background-luminance hint for TUI theme detection. `COLORFGBG="fg;bg"`
    // is the long-standing convention (rxvt/iTerm/Konsole): a high bg index
    // means a light terminal. Many CLIs (and the libraries they use — e.g.
    // termenv/chroma) read this to pick a light vs dark palette. Without it
    // they assume dark and hard-paint a dark background that our xterm light
    // theme can't override. "0;15" = black-on-white → light; "15;0" → dark.
    cmd.env(
        "COLORFGBG",
        if light.unwrap_or(false) { "0;15" } else { "15;0" },
    );

    // Per-persona base-model substitution (Claude CLI only — `ANTHROPIC_*` is
    // Claude Code-specific). Point the `claude` process at the resolved
    // third-party Anthropic-compatible endpoint. This touches only the spawned
    // process's env — never a global file — so other personas and the system
    // Claude install are unaffected. (Resolution + the truthful-identity prompt
    // happened earlier, before the persona file was written.)
    if let Some((preset_id, p)) = claude_provider.as_ref() {
        // Most models connect direct. But a model that mandates `thinking=enabled`
        // (Moonshot `*-code`) would 400 — Claude Code doesn't send thinking on a
        // normal turn. Route those through the loopback proxy, which rewrites each
        // request's thinking and injects the real key.
        let base_url = if crate::codex_proxy::model_requires_thinking(&p.model) {
            match crate::codex_proxy::ensure_started(&app) {
                Ok(port) => {
                    let url = crate::codex_proxy::anthropic_base_url_for(port, preset_id);
                    // The proxy authenticates upstream; give Claude a placeholder.
                    cmd.env("ANTHROPIC_AUTH_TOKEN", "cocodes-proxy");
                    tracing::info!(
                        "terminal: claude base-model '{preset_id}' via proxy {url} \
                         → {} ({}) [thinking-injected]",
                        p.base_url,
                        p.model
                    );
                    url
                }
                Err(e) => {
                    tracing::warn!("terminal: claude proxy failed to start: {e}; direct");
                    cmd.env("ANTHROPIC_AUTH_TOKEN", &p.auth_token);
                    p.base_url.clone()
                }
            }
        } else {
            cmd.env("ANTHROPIC_AUTH_TOKEN", &p.auth_token);
            p.base_url.clone()
        };
        cmd.env("ANTHROPIC_BASE_URL", &base_url);
        cmd.env("ANTHROPIC_MODEL", &p.model);
        if let Some(small) = p.small_fast_model.as_deref() {
            cmd.env("ANTHROPIC_SMALL_FAST_MODEL", small);
        }
        // Keep AUTH_TOKEN the sole Bearer source: a stale ANTHROPIC_API_KEY
        // inherited from the parent shell would otherwise compete with the token.
        cmd.env_remove("ANTHROPIC_API_KEY");
        // Pulse the cockpit's live indicator at launch.
        crate::codex_proxy::emit_activity("claude", &p.name, &p.model);
    }

    // Per-persona base-model substitution for Codex. Modern Codex speaks only
    // the Responses API, but most third-party / local models speak only Chat
    // Completions — so we can't point Codex straight at them (it would 404).
    // Instead we route through CoCodes's loopback translator proxy
    // (`crate::codex_proxy`): Codex is configured with `wire_api = "responses"`
    // and a `base_url` on the local proxy, which converts to/from Chat
    // Completions and injects the provider's API key (kept out of Codex's config
    // entirely). All of this is per-invocation `-c` overrides — the global
    // `~/.codex/config.toml` is never touched. The provider id is namespaced
    // (`cocodes_*`) to avoid Codex's reserved ids (`openai`/`ollama`/`lmstudio`).
    if cli_name == "codex" {
        // Attach a PermissionRequest hook so Codex's command-approval prompt
        // pings CoCodes's loopback listener (tray notification → jump to pane).
        // Codex's `hooks` config is an inline TOML table (HooksToml) — NOT a file
        // path — so we pass it as a `-c hooks.PermissionRequest=…` override with
        // the pane key baked into the hook URL. `--dangerously-bypass-hook-trust`
        // is safe here: the hook command is one we generated ourselves.
        if let Some(hooks_arg) = crate::notify_hooks::codex_hooks_config_arg(&id) {
            cmd.arg("-c");
            cmd.arg(hooks_arg);
            cmd.arg("--dangerously-bypass-hook-trust");
        }
        if let Some(preset_id) = crate::persona::base_model_for(profile_id.as_deref()) {
            match crate::providers::resolve_codex(&preset_id) {
                Ok(Some(p)) => match crate::codex_proxy::ensure_started(&app) {
                    Ok(port) => {
                        let prov = format!("cocodes_{}", preset_id.replace('-', "_"));
                        let base_url = crate::codex_proxy::base_url_for(port, &preset_id);
                        cmd.arg("--model");
                        cmd.arg(&p.model);
                        cmd.arg("-c");
                        cmd.arg(format!("model_provider={}", toml_str(&prov)));
                        cmd.arg("-c");
                        cmd.arg(format!("model_providers.{prov}.name={}", toml_str(&p.name)));
                        cmd.arg("-c");
                        cmd.arg(format!("model_providers.{prov}.base_url={}", toml_str(&base_url)));
                        cmd.arg("-c");
                        cmd.arg(format!("model_providers.{prov}.wire_api={}", toml_str("responses")));
                        // The proxy authenticates upstream; Codex itself needs no
                        // key and must not prompt for ChatGPT sign-in.
                        cmd.arg("-c");
                        cmd.arg(format!("model_providers.{prov}.requires_openai_auth=false"));
                        // Model metadata for custom slugs: without these Codex
                        // warns "Model metadata for <model> not found" and falls
                        // back to conservative defaults (wrong compaction/limits).
                        // Top-level keys (Codex ignores per-profile ones here).
                        if let Some(ctx) = p.context_window {
                            cmd.arg("-c");
                            cmd.arg(format!("model_context_window={ctx}"));
                        }
                        if let Some(max_out) = p.max_output_tokens {
                            cmd.arg("-c");
                            cmd.arg(format!("model_max_output_tokens={max_out}"));
                        }
                        tracing::info!(
                            "terminal: persona base-model '{preset_id}' → codex via proxy {base_url} \
                             → {} ({})",
                            p.base_url,
                            p.model
                        );
                    }
                    Err(e) => tracing::warn!(
                        "terminal: codex proxy failed to start: {e}; \
                         using default codex provider"
                    ),
                },
                Ok(None) => tracing::warn!(
                    "terminal: base-model preset '{preset_id}' is unconfigured \
                     (missing); using default codex provider"
                ),
                Err(e) => tracing::warn!(
                    "terminal: base-model resolve '{preset_id}' failed: {e}; \
                     using default codex provider"
                ),
            }
        }
    }

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

    let buffer: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    let detected_model: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    reg.sessions.lock().unwrap().insert(
        id.clone(),
        TerminalSession {
            writer,
            master: pair.master,
            child,
            persona_file,
            buffer: buffer.clone(),
            detected_model: detected_model.clone(),
        },
    );

    // Pump PTY output → frontend, also appending to the replay buffer so a
    // reconnecting view can catch up. Runs until EOF (claude exited) or error.
    let app_for_thread = app.clone();
    let id_for_thread = id.clone();
    let model_for_thread = detected_model.clone();
    // Belt-and-suspenders: if ensure_claude_trusts() failed to pre-trust the
    // directory (e.g. path-separator mismatch), detect the dialog in the PTY
    // stream and answer "1\r" automatically so the user never sees it.
    let is_claude_cli = cli_name == "claude";
    std::thread::spawn(move || {
        let trust_sig: &[u8] = b"Yes, I trust this folder";
        let sig_len = trust_sig.len();
        let mut trust_tail: Vec<u8> = Vec::with_capacity(sig_len);
        let mut trust_sent = false;

        // Accumulate the early output (the welcome banner) until we can read off
        // the model the CLI is actually running, then stop scanning.
        let mut banner_buf: Vec<u8> = Vec::new();
        let mut model_done = false;
        const BANNER_SCAN_MAX: usize = 32 * 1024;

        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = &buf[..n];

                    if !trust_sent && is_claude_cli {
                        // Combine the tail of the previous chunk with the
                        // current one so we catch signatures that span reads.
                        let window: Vec<u8> =
                            trust_tail.iter().chain(chunk.iter()).copied().collect();
                        if window.windows(sig_len).any(|w| w == trust_sig) {
                            trust_sent = true;
                            let reg = app_for_thread.state::<TerminalRegistry>();
                            let mut sessions = reg.sessions.lock().unwrap();
                            if let Some(s) = sessions.get_mut(&id_for_thread) {
                                let _ = s.writer.write_all(b"1\r");
                                let _ = s.writer.flush();
                            }
                        }
                        // Keep the tail for the next iteration.
                        let tail_start = chunk.len().saturating_sub(sig_len);
                        trust_tail.clear();
                        trust_tail.extend_from_slice(&chunk[tail_start..]);
                    }

                    {
                        let mut b = buffer.lock().unwrap();
                        b.extend_from_slice(chunk);
                        if b.len() > REPLAY_BUFFER_MAX {
                            let excess = b.len() - REPLAY_BUFFER_MAX;
                            b.drain(0..excess);
                        }
                    }
                    let payload = DataEvent {
                        id: id_for_thread.clone(),
                        data: STANDARD.encode(chunk),
                    };
                    let _ = app_for_thread.emit("terminal://data", payload);

                    // Read the real model off the startup banner (zero extra cost
                    // — it's already in the stream). Scan the early output until
                    // found or the window is exhausted.
                    if !model_done {
                        banner_buf.extend_from_slice(chunk);
                        if let Some(model) = extract_model_from_banner(&banner_buf) {
                            model_done = true;
                            banner_buf = Vec::new();
                            *model_for_thread.lock().unwrap() = Some(model.clone());
                            let _ = app_for_thread.emit(
                                "terminal://model",
                                ModelEvent {
                                    id: id_for_thread.clone(),
                                    model,
                                },
                            );
                        } else if banner_buf.len() > BANNER_SCAN_MAX {
                            model_done = true; // give up; keep buffer memory bounded
                            banner_buf = Vec::new();
                        }
                    }
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

    Ok(OpenResult { id, replay: None, model: None })
}

/// Strip ANSI/VT escape sequences from PTY text so banner parsing sees plain
/// characters (the TUI repaints with colour + cursor moves).
fn strip_ansi(s: &str) -> String {
    // Char-based (not byte-based) so multi-byte UTF-8 — the `·` separator and the
    // box-drawing chars in TUI banners — survives intact.
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.peek() {
            Some('[') => {
                // CSI: params/intermediates until a final byte 0x40..=0x7e.
                chars.next();
                while let Some(&n) = chars.peek() {
                    chars.next();
                    if ('\u{40}'..='\u{7e}').contains(&n) {
                        break;
                    }
                }
            }
            Some(']') => {
                // OSC: until BEL or ESC (ST).
                chars.next();
                while let Some(&n) = chars.peek() {
                    if n == '\u{07}' || n == '\u{1b}' {
                        chars.next();
                        break;
                    }
                    chars.next();
                }
            }
            _ => {
                chars.next(); // ESC + single char
            }
        }
    }
    out
}

/// Pull the model name off a CLI's welcome banner. Both Claude Code and Codex
/// print an identity line with a middle dot, e.g. `Opus 4.8 (1M context) · Claude
/// Max` or `kimi-k2.7-code · API Usage Billing` — we take the text before the
/// `·`, drop a trailing `(… context)`, and trim box-drawing/padding. Best-effort:
/// returns `None` if no plausible model line is present yet.
fn extract_model_from_banner(buf: &[u8]) -> Option<String> {
    let text = strip_ansi(&String::from_utf8_lossy(buf));
    for line in text.lines() {
        let Some(idx) = line.find('\u{00b7}') else { continue };
        let mut left = &line[..idx];
        // Drop a trailing "(1M context)" / "(200k context)" annotation.
        if let Some(paren) = left.find('(') {
            left = &left[..paren];
        }
        // Trim surrounding box-drawing chars, spaces and punctuation.
        let candidate = left.trim_matches(|c: char| !c.is_alphanumeric());
        if candidate.is_empty() || candidate.len() > 40 {
            continue;
        }
        if candidate.chars().any(|c| c.is_alphanumeric()) {
            return Some(candidate.to_string());
        }
    }
    None
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

    // Claude Code uses forward slashes in ~/.claude.json project keys on
    // Windows (its Node.js path is normalised via path.posix), so we must
    // match that format exactly.  PathBuf on Windows preserves backslashes,
    // so we replace them here before writing or looking up the entry.
    #[cfg(windows)]
    let key = dir.to_string_lossy().replace('\\', "/");
    #[cfg(not(windows))]
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
    fn extract_model_from_banner_handles_real_banners() {
        // Claude Code identity line (with a "(1M context)" annotation).
        let claude = "Claude Code v2.1.195\n  Opus 4.8 (1M context) \u{00b7} Claude Max\n";
        assert_eq!(extract_model_from_banner(claude.as_bytes()).as_deref(), Some("Opus 4.8"));
        // Third-party / billing line.
        let kimi = "\u{1b}[2m│\u{1b}[0m kimi-k2.7-code \u{00b7} API Usage Billing │\n";
        assert_eq!(extract_model_from_banner(kimi.as_bytes()).as_deref(), Some("kimi-k2.7-code"));
        // No identity line yet → None.
        assert_eq!(extract_model_from_banner(b"booting up...\n"), None);
    }

    #[test]
    fn strip_ansi_removes_csi_sequences() {
        assert_eq!(strip_ansi("\u{1b}[31mred\u{1b}[0m"), "red");
    }

    #[test]
    fn persona_file_renders_named_sections() {
        let ctx = PersonaContext {
            soul: "You speak tersely.".into(),
            memory: "The project is CoCodes.".into(),
            user_profile: "Prefers Rust.".into(),
            name: "Atlas".into(),
        };
        let path = write_persona_file("test-render", &ctx, None).expect("some file");
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
        assert!(write_persona_file("test-empty", &ctx, None).is_none());
    }

    #[test]
    fn identity_note_added_even_without_persona_sections() {
        let ctx = PersonaContext {
            soul: String::new(),
            memory: String::new(),
            user_profile: String::new(),
            name: String::new(),
        };
        let note = claude_identity_note("deepseek-chat", "DeepSeek");
        let path = write_persona_file("test-identity", &ctx, Some(&note)).expect("file written");
        let body = std::fs::read_to_string(&path).unwrap();
        let _ = std::fs::remove_file(&path);
        assert!(body.contains("deepseek-chat"));
        assert!(body.contains("DeepSeek"));
        assert!(body.contains("not Anthropic's Claude") || body.contains("NOT Anthropic's Claude"));
    }
}
