//! Global MCP (Model Context Protocol) server registry.
//!
//! Stores the user's MCP server list at `~/.cocodes/mcp.json`.  Each server
//! carries its standard `mcpServers` JSON entry plus an `enabled` flag that
//! controls whether CoCodes injects it when spawning CLI sessions.
//!
//! `mcp_apply_to_clients` merges a server into external tool config files
//! (Claude Code, Claude Desktop, Cursor, VS Code) so users don't have to copy
//! JSON by hand.

use std::path::PathBuf;
use tauri::Emitter;

use serde::{Deserialize, Serialize};

use crate::persona::app_home;

// ── Data model ────────────────────────────────────────────────────────────────

/// One MCP server entry stored in `~/.cocodes/mcp.json`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpServer {
    /// Stable unique id (UUID v4 hex, generated on first save).
    pub id: String,
    /// Display name shown in the MCP panel.
    pub name: String,
    /// Raw `mcpServers` entry — the JSON object a client would put under one
    /// key in its config file (e.g. `{ "command": "npx", "args": [...] }`).
    pub config: serde_json::Value,
    /// Links this entry back to a built-in preset key (e.g. `"x-api"`).
    /// Lets the UI distinguish preset servers from hand-crafted custom ones.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset_key: Option<String>,
    /// Whether CoCodes should pass this server to CLI sessions on launch.
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct McpStore {
    #[serde(default)]
    servers: Vec<McpServer>,
}

// ── File paths ────────────────────────────────────────────────────────────────

fn store_path() -> PathBuf {
    app_home().join("mcp.json")
}

/// Platform-specific path for a named client's MCP config file.
/// Returns `None` when the client is unknown or the path can't be resolved.
fn client_config_path(client_id: &str, cwd: Option<&str>) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    match client_id {
        "claude_code" => Some(home.join(".claude").join("settings.json")),
        "claude_desktop" => {
            #[cfg(target_os = "windows")]
            {
                dirs::data_dir().map(|d| d.join("Claude").join("claude_desktop_config.json"))
            }
            #[cfg(target_os = "macos")]
            {
                dirs::config_dir()
                    .map(|d| d.join("Claude").join("claude_desktop_config.json"))
            }
            #[cfg(not(any(target_os = "windows", target_os = "macos")))]
            {
                dirs::config_dir()
                    .map(|d| d.join("Claude").join("claude_desktop_config.json"))
            }
        }
        "cursor" => Some(home.join(".cursor").join("mcp.json")),
        "vscode" => cwd.map(|d| PathBuf::from(d).join(".vscode").join("mcp.json")),
        _ => None,
    }
}

// ── I/O helpers ───────────────────────────────────────────────────────────────

fn load_store() -> McpStore {
    std::fs::read_to_string(store_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_store(store: &McpStore) -> Result<(), String> {
    let path = store_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Generate a UUID v4 string from crypto-grade random bytes.
fn new_id() -> String {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).unwrap_or(());
    // Set version (4) and variant bits per RFC 4122.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2],  bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
    )
}

/// Slugify a display name to use as an `mcpServers` key in client configs.
fn slugify(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    // Collapse runs of dashes and trim edges.
    let mut prev_dash = true;
    let mut out = String::new();
    for c in s.chars() {
        if c == '-' {
            if !prev_dash { out.push('-'); }
            prev_dash = true;
        } else {
            out.push(c);
            prev_dash = false;
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() { "mcp-server".to_string() } else { out }
}

/// Read the JSON at `path` as an Object, or start fresh.
fn read_json_object(path: &std::path::Path) -> serde_json::Map<String, serde_json::Value> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| if let serde_json::Value::Object(m) = v { Some(m) } else { None })
        .unwrap_or_default()
}

/// Merge `server` into the `mcpServers` map inside `path` atomically.
fn merge_into_client_config(path: &std::path::Path, server: &McpServer) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut root = read_json_object(path);
    let mcp_key = "mcpServers";
    let servers_map = root
        .entry(mcp_key)
        .or_insert_with(|| serde_json::Value::Object(Default::default()));
    if let serde_json::Value::Object(ref mut m) = servers_map {
        m.insert(slugify(&server.name), server.config.clone());
    }
    let json = serde_json::to_string_pretty(&serde_json::Value::Object(root))
        .map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Auto-sync to Claude Code ──────────────────────────────────────────────────

/// Sync enabled MCP servers into `~/.claude.json` — the file that
/// `claude mcp add/list` reads from (NOT `~/.claude/settings.json`).
/// Updates only the `mcpServers` key; all other keys in the file are preserved.
/// Called automatically after every `mcp_save` so the toggle is the source of
/// truth — the user never has to manually export to Claude Code.
fn sync_to_claude_settings(servers: &[McpServer]) {
    let Some(home) = dirs::home_dir() else { return };
    let path = home.join(".claude.json"); // Claude Code MCP registry

    let mut root = if path.exists() {
        read_json_object(&path)
    } else {
        serde_json::Map::new()
    };

    let mut mcp_map = serde_json::Map::new();
    for s in servers.iter().filter(|s| s.enabled) {
        mcp_map.insert(slugify(&s.name), s.config.clone());
    }

    if mcp_map.is_empty() {
        root.remove("mcpServers");
    } else {
        root.insert(
            "mcpServers".into(),
            serde_json::Value::Object(mcp_map),
        );
    }

    let json = match serde_json::to_string_pretty(&serde_json::Value::Object(root)) {
        Ok(j) => j,
        Err(e) => {
            tracing::warn!("mcp: sync to claude settings serialise failed: {e}");
            return;
        }
    };
    // Also scrub mcpServers from ~/.claude/settings.json if we put them there
    // earlier by mistake (old code wrote to the wrong file).
    if let Some(stale_path) = dirs::home_dir()
        .map(|h| h.join(".claude").join("settings.json"))
        .filter(|p| p.exists())
    {
        let mut stale = read_json_object(&stale_path);
        if stale.remove("mcpServers").is_some() {
            if let Ok(j) = serde_json::to_string_pretty(&serde_json::Value::Object(stale)) {
                let tmp2 = stale_path.with_extension("json.tmp");
                if std::fs::write(&tmp2, &j).is_ok() {
                    let _ = std::fs::rename(&tmp2, &stale_path);
                }
            }
        }
    }

    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, &json).is_ok() {
        if let Err(e) = std::fs::rename(&tmp, &path) {
            tracing::warn!("mcp: sync to claude settings rename failed: {e}");
        } else {
            tracing::info!(
                "mcp: synced {} enabled server(s) → ~/.claude/settings.json",
                servers.iter().filter(|s| s.enabled).count()
            );
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Return all configured MCP servers.
#[tauri::command]
pub fn mcp_list() -> Vec<McpServer> {
    load_store().servers
}

/// Persist the full server list (add / edit / delete / reorder all go here).
/// Assigns a fresh UUID to any server whose id is empty.
#[tauri::command]
pub fn mcp_save(mut servers: Vec<McpServer>) -> Result<(), String> {
    for s in &mut servers {
        if s.id.trim().is_empty() {
            s.id = new_id();
        }
    }
    write_store(&McpStore { servers: servers.clone() })?;
    // Auto-sync: keep ~/.claude/settings.json in step so Claude Code picks up
    // every enable/disable/add/delete without any extra user action.
    sync_to_claude_settings(&servers);
    Ok(())
}

/// Write `server` into the config files of the requested external clients.
/// Returns the list of file paths that were successfully written.
#[tauri::command]
pub fn mcp_apply_to_clients(
    server: McpServer,
    client_ids: Vec<String>,
    cwd: Option<String>,
) -> Result<Vec<String>, String> {
    let mut written: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for client_id in &client_ids {
        let path = match client_config_path(client_id, cwd.as_deref()) {
            Some(p) => p,
            None => {
                errors.push(format!("unknown client: {client_id}"));
                continue;
            }
        };
        match merge_into_client_config(&path, &server) {
            Ok(()) => written.push(path.to_string_lossy().into_owned()),
            Err(e) => errors.push(format!("{client_id}: {e}")),
        }
    }

    if !errors.is_empty() {
        return Err(errors.join("; "));
    }
    Ok(written)
}

/// Run the one-time OAuth auth command for an MCP preset (e.g. xurl) as a
/// hidden background process.  Returns immediately; emits one of:
///   `mcp:auth-complete`  — token cached, all done
///   `mcp:auth-error`     — something went wrong (payload = error string)
/// The spawned process is killed as soon as "bridging" appears in its output,
/// so the user never sees a stray terminal window.
#[tauri::command]
pub fn mcp_run_auth(
    command: String,
    args: Vec<String>,
    env: std::collections::HashMap<String, String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // On Windows, `npx` is a .cmd file that cannot be spawned directly by
    // CreateProcess.  We wrap it with `cmd /C` which also re-reads the user
    // PATH from the registry, so Node.js is found even when the Tauri GUI
    // process inherited a stripped PATH.
    let mut child = {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let full = std::iter::once(command.as_str())
                .chain(args.iter().map(String::as_str))
                .collect::<Vec<_>>()
                .join(" ");
            let mut c = std::process::Command::new("cmd");
            c.args(["/C", &full])
                .envs(&env)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::piped())
                .creation_flags(CREATE_NO_WINDOW);
            c.spawn().map_err(|e| e.to_string())?
        }
        #[cfg(not(windows))]
        {
            // GUI apps on macOS/Linux launch from Finder/Dock with a minimal
            // PATH that omits ~/.local/bin, Homebrew, and node-version-manager
            // dirs, so spawning `npx` directly fails with "No such file or
            // directory (os error 2)". Resolve it against the common node bin
            // dirs, and give the child a PATH that includes them so the
            // `#!/usr/bin/env node` shebang can also find `node` beside `npx`.
            let resolved = crate::terminal::find_in_path(&command, &crate::terminal::node_bin_dirs())
                .unwrap_or_else(|| PathBuf::from(&command));
            let new_path = crate::terminal::cli_path_env(&resolved);

            let mut c = std::process::Command::new(&resolved);
            c.args(&args)
                .envs(&env)
                .env("PATH", &new_path)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::piped());
            c.spawn().map_err(|e| e.to_string())?
        }
    };
    let stderr = child.stderr.take().expect("stderr is piped");

    std::thread::spawn(move || {
        use std::io::BufRead;
        let mut complete = false;
        for line in std::io::BufReader::new(stderr).lines().flatten() {
            tracing::debug!("xurl auth: {line}");
            // xurl prints "bridging" once the OAuth token is cached and the
            // MCP bridge is active — that's our signal that auth succeeded.
            if line.contains("bridging") || line.contains("authentication complete") {
                complete = true;
                break;
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        if complete {
            let _ = app.emit("mcp:auth-complete", ());
        } else {
            let _ = app.emit("mcp:auth-error", "Authorization did not complete.");
        }
    });

    Ok(())
}
