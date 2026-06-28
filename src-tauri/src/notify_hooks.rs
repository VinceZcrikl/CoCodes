//! Loopback listener for CLI "needs authorization" notifications.
//!
//! Coding CLIs that block waiting for the user's permission (e.g. Claude Code's
//! tool-approval prompt, Codex's command-approval prompt) can be configured to
//! fire a *hook* when that happens. We spawn each CoCodes-owned CLI with a hook
//! that POSTs to this tiny loopback server; the server filters to genuine
//! permission prompts and re-emits a `cocodes://needs-attention` Tauri event the
//! cockpit turns into a tray notification that jumps to the waiting session.
//!
//! Correlation is by CoCodes's own terminal key (`<paneId>:<convId>`), baked
//! into the hook URL at spawn time — so it never depends on a CLI's internal
//! session id. Claude's hook payload (stdin JSON) additionally carries a
//! `notification_type`, which we use to skip idle-waiting notifications and only
//! surface real permission prompts.

use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tiny_http::{Response, Server};

/// The bound loopback port, set once the server thread is up.
static PORT: OnceLock<u16> = OnceLock::new();
/// Serializes the one-time bind so concurrent first launches don't race.
static START_LOCK: Mutex<()> = Mutex::new(());
/// App handle for emitting `needs-attention` events to the cockpit.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Ensure the hook listener is running and return its loopback port. Idempotent:
/// the first caller binds `127.0.0.1:0` and spawns the accept loop; later callers
/// get the cached port.
pub fn ensure_started(app: &AppHandle) -> Result<u16, String> {
    let _ = APP.set(app.clone());
    if let Some(p) = PORT.get() {
        return Ok(*p);
    }
    let _guard = START_LOCK.lock().map_err(|e| e.to_string())?;
    if let Some(p) = PORT.get() {
        return Ok(*p);
    }
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or_else(|| "notify-hooks: no bound port".to_string())?;
    std::thread::Builder::new()
        .name("notify-hooks".into())
        .spawn(move || accept_loop(server))
        .map_err(|e| e.to_string())?;
    let _ = PORT.set(port);
    tracing::info!("notify-hooks: listening on 127.0.0.1:{port}");
    Ok(port)
}

/// The `--settings` JSON string for a Claude spawn: a Notification hook that
/// POSTs its payload (with `notification_type`) to this server, tagged with the
/// terminal `key` so the cockpit can resolve the waiting pane. Returns `None`
/// when the server isn't up (then no hook is attached — claude runs normally).
pub fn claude_settings_arg(key: &str) -> Option<String> {
    let port = PORT.get()?;
    let url = format!("http://127.0.0.1:{port}/notify?cli=claude&id={}", encode(key));
    // The hook receives the notification JSON on stdin; forward it so the server
    // can read `notification_type`. `-s`/`-m` keep it quiet and bounded.
    let command = format!("curl -s -m 5 -X POST --data-binary @- '{url}'");
    Some(
        json!({
            "hooks": { "Notification": [ { "hooks": [ { "type": "command", "command": command } ] } ] }
        })
        .to_string(),
    )
}

/// The `-c hooks.PermissionRequest=…` override for a Codex spawn. Codex's `hooks`
/// config is an inline `HooksToml` table (NOT a file path — passing a path makes
/// Codex fail config parsing with "expected struct HooksToml"). So we emit the
/// `PermissionRequest` matcher group inline, with a `command` that POSTs the
/// approval event to this server tagged with the terminal `key`. The command's
/// URL uses single quotes only, so it stays a clean TOML basic string. Returns
/// `None` when the server isn't up (then no hook is attached — codex runs as is).
pub fn codex_hooks_config_arg(key: &str) -> Option<String> {
    let port = PORT.get()?;
    let url = format!(
        "http://127.0.0.1:{port}/notify?cli=codex&kind=permission&id={}",
        encode(key)
    );
    let command = format!("curl -s -m 5 -X POST --data-binary @- '{url}'");
    Some(format!(
        "hooks.PermissionRequest=[{{ hooks = [{{ type = \"command\", command = \"{command}\" }}] }}]"
    ))
}

/// Minimal percent-encoding for the bits of a terminal key that aren't query-safe
/// (`:` and `&` mostly). Keeps alnum / `-` / `_` / `.` verbatim.
fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn accept_loop(server: Server) {
    for request in server.incoming_requests() {
        std::thread::spawn(move || handle(request));
    }
}

fn handle(mut request: tiny_http::Request) {
    let url = request.url().to_string();
    let query = url.split('?').nth(1).unwrap_or("");
    let mut id: Option<String> = None;
    let mut cli = String::from("claude");
    let mut kind: Option<String> = None;
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        match (it.next(), it.next()) {
            (Some("id"), Some(v)) => id = Some(decode(v)),
            (Some("cli"), Some(v)) => cli = decode(v),
            (Some("kind"), Some(v)) => kind = Some(decode(v)),
            _ => {}
        }
    }

    let mut body = String::new();
    let _ = request.as_reader().read_to_string(&mut body);
    let payload: Value = serde_json::from_str(&body).unwrap_or(Value::Null);

    // Decide whether this is a genuine "needs authorization" event:
    //  - Claude: stdin JSON `notification_type == "permission_prompt"`.
    //  - Codex: the URL `kind=permission` tag (its PermissionRequest hook).
    let notif_type = payload
        .get("notification_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let is_permission = kind.as_deref() == Some("permission")
        || notif_type == "permission_prompt"
        || notif_type.contains("permission");

    if is_permission {
        if let (Some(app), Some(id)) = (APP.get(), id.as_ref()) {
            let message = payload
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("needs your permission")
                .to_string();
            let _ = app.emit(
                "cocodes://needs-attention",
                json!({ "id": id, "cli": cli, "message": message }),
            );
            tracing::debug!("notify-hooks: permission prompt for {id} ({cli})");
        }
    }

    let _ = request.respond(Response::from_string("ok"));
}

/// Reverse of [`encode`] for the small subset we emit.
fn decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
