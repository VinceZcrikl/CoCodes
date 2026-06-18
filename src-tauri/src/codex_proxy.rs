//! Local Codex base-model proxy — a Responses ⇄ Chat Completions translator.
//!
//! Modern Codex (≥0.84, after openai/codex#10157) speaks **only** the OpenAI
//! Responses API (`wire_api = "responses"`); `wire_api = "chat"` was removed.
//! Most third-party / local models (DeepSeek, Qwen, Ollama, LM Studio) speak
//! **only** Chat Completions. The two protocols are not interoperable, so a
//! direct `model_providers` entry pointing Codex at such a model 404s.
//!
//! This module runs a tiny loopback HTTP server that bridges the gap, the same
//! trick CC Switch uses: Codex is pointed at
//! `http://127.0.0.1:<port>/p/<provider-id>/v1` with `wire_api = "responses"`;
//! we accept its `POST …/responses`, translate the request body into a Chat
//! Completions request, forward it to the provider (resolved from the Web-UI
//! provider registry, with the API key injected here so it never lands in
//! Codex's config), then translate the Chat response — streaming SSE included —
//! back into the Responses event stream Codex expects.
//!
//! The server is started lazily on the first Codex launch ([`ensure_started`])
//! and lives for the process. It is stateless beyond the bound port: every
//! request re-resolves its provider from disk, so newly added keys take effect
//! without a restart.

use std::collections::VecDeque;
use std::io::{self, BufRead, BufReader, Read};
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tiny_http::{Header, Response, Server, StatusCode};

use crate::providers;

/// The bound loopback port, set once the server thread is up.
static PORT: OnceLock<u16> = OnceLock::new();
/// Serializes the one-time bind so concurrent first launches don't race.
static START_LOCK: Mutex<()> = Mutex::new(());

/// Ensure the proxy is running and return its loopback port. Idempotent: the
/// first caller binds `127.0.0.1:0` and spawns the accept loop; later callers
/// get the cached port.
pub fn ensure_started() -> Result<u16, String> {
    if let Some(p) = PORT.get() {
        return Ok(*p);
    }
    let _guard = START_LOCK.lock().map_err(|e| e.to_string())?;
    // Re-check under the lock — another thread may have started it meanwhile.
    if let Some(p) = PORT.get() {
        return Ok(*p);
    }
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or_else(|| "codex proxy: no bound port".to_string())?;
    std::thread::Builder::new()
        .name("codex-proxy".into())
        .spawn(move || accept_loop(server))
        .map_err(|e| e.to_string())?;
    let _ = PORT.set(port);
    tracing::info!("codex proxy: listening on 127.0.0.1:{port}");
    Ok(port)
}

/// The loopback base URL Codex's `model_providers.<id>.base_url` should use for
/// provider `id`. The provider id is embedded in the path so the proxy can
/// re-resolve the upstream endpoint + key per request.
pub fn base_url_for(port: u16, provider_id: &str) -> String {
    format!("http://127.0.0.1:{port}/p/{provider_id}/v1")
}

fn accept_loop(server: Server) {
    for request in server.incoming_requests() {
        // One thread per request: upstream streaming is blocking, and Codex may
        // have more than one request in flight.
        std::thread::spawn(move || handle(request));
    }
}

fn handle(mut request: tiny_http::Request) {
    // Expect POST /p/<id>/v1/responses (the only endpoint Codex hits in
    // responses mode). Anything else is a 404.
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or(&url);
    let provider_id = match parse_provider_id(path) {
        Some(id) => id,
        None => {
            let _ = request.respond(Response::from_string("not found").with_status_code(404));
            return;
        }
    };

    let mut body = String::new();
    if let Err(e) = request.as_reader().read_to_string(&mut body) {
        respond_failed(request, &format!("read request body: {e}"));
        return;
    }
    let req_json: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            respond_failed(request, &format!("parse request body: {e}"));
            return;
        }
    };

    let resolved = match providers::resolve_codex(&provider_id) {
        Ok(Some(r)) => r,
        Ok(None) => {
            respond_failed(request, &format!("unknown provider '{provider_id}'"));
            return;
        }
        Err(e) => {
            respond_failed(request, &format!("resolve provider '{provider_id}': {e}"));
            return;
        }
    };

    let chat_body = responses_to_chat(&req_json);
    let upstream_url = chat_completions_url(&resolved.base_url);

    let client = match reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            respond_failed(request, &format!("build http client: {e}"));
            return;
        }
    };
    let mut req = client.post(&upstream_url).json(&chat_body);
    if let Some(token) = resolved.token.as_deref() {
        req = req.bearer_auth(token);
    }
    let resp = match req.send() {
        Ok(r) => r,
        Err(e) => {
            respond_failed(request, &format!("upstream request failed: {e}"));
            return;
        }
    };

    let status = resp.status();
    let is_sse = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|c| c.contains("text/event-stream"))
        .unwrap_or(false);

    if !status.is_success() {
        let detail = resp.text().unwrap_or_default();
        respond_failed(
            request,
            &format!("upstream {} — {}", status.as_u16(), truncate(&detail, 800)),
        );
        return;
    }

    let resp_id = rand_id("resp");
    let headers = vec![sse_header()];
    if is_sse {
        // Stream live: translate each upstream chunk to Responses events as it
        // arrives, so Codex shows tokens in real time.
        let reader = ResponsesTranslatingReader::new(BufReader::new(resp), resp_id);
        let response = Response::new(StatusCode(200), headers, reader, None, None);
        let _ = request.respond(response);
    } else {
        // Upstream ignored stream:true and sent one JSON blob — synthesize the
        // same event sequence from it in one shot.
        let body = resp.text().unwrap_or_default();
        let bytes = match serde_json::from_str::<Value>(&body) {
            Ok(chat) => chat_completion_to_sse(&chat, &resp_id),
            Err(e) => failed_event(&format!("parse upstream json: {e}")).into_bytes(),
        };
        let response = Response::new(StatusCode(200), headers, io::Cursor::new(bytes), None, None);
        let _ = request.respond(response);
    }
}

/// Extract `<id>` from `/p/<id>/v1/responses`. Returns `None` for any other path.
fn parse_provider_id(path: &str) -> Option<String> {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    match parts.as_slice() {
        ["p", id, "v1", "responses"] if !id.is_empty() => Some((*id).to_string()),
        _ => None,
    }
}

/// `<base>/chat/completions`, tolerating a trailing slash on the stored base URL.
fn chat_completions_url(base: &str) -> String {
    format!("{}/chat/completions", base.trim_end_matches('/'))
}

// ---- Request translation: Responses → Chat Completions ----

/// Translate a Codex Responses request body into a Chat Completions request.
/// Handles the input-item shapes Codex emits (messages, prior `function_call`
/// and `function_call_output` items), tool definitions, and sampling params.
pub fn responses_to_chat(req: &Value) -> Value {
    let mut messages: Vec<Value> = Vec::new();

    // `instructions` is the Responses system prompt — prepend it as `system`.
    if let Some(instr) = req.get("instructions").and_then(Value::as_str) {
        if !instr.is_empty() {
            messages.push(json!({ "role": "system", "content": instr }));
        }
    }

    match req.get("input") {
        Some(Value::String(s)) => messages.push(json!({ "role": "user", "content": s })),
        Some(Value::Array(items)) => {
            for item in items {
                push_input_item(&mut messages, item);
            }
        }
        _ => {}
    }

    let mut chat = json!({
        "model": req.get("model").cloned().unwrap_or(Value::Null),
        "messages": messages,
        "stream": true,
        "stream_options": { "include_usage": true },
    });
    let obj = chat.as_object_mut().unwrap();

    if let Some(tools) = req.get("tools").and_then(Value::as_array) {
        let mapped: Vec<Value> = tools.iter().filter_map(map_tool).collect();
        if !mapped.is_empty() {
            obj.insert("tools".into(), Value::Array(mapped));
        }
    }
    if let Some(tc) = req.get("tool_choice") {
        obj.insert("tool_choice".into(), map_tool_choice(tc));
    }
    for (src, dst) in [("temperature", "temperature"), ("top_p", "top_p")] {
        if let Some(v) = req.get(src) {
            if !v.is_null() {
                obj.insert(dst.into(), v.clone());
            }
        }
    }
    if let Some(v) = req.get("max_output_tokens") {
        if !v.is_null() {
            obj.insert("max_tokens".into(), v.clone());
        }
    }
    if let Some(v) = req.get("parallel_tool_calls") {
        if !v.is_null() {
            obj.insert("parallel_tool_calls".into(), v.clone());
        }
    }

    chat
}

/// Append the chat message(s) for one Responses `input` item.
fn push_input_item(messages: &mut Vec<Value>, item: &Value) {
    // A bare string element behaves like a user message.
    if let Some(s) = item.as_str() {
        messages.push(json!({ "role": "user", "content": s }));
        return;
    }
    match item.get("type").and_then(Value::as_str) {
        Some("message") | None => {
            let role = match item.get("role").and_then(Value::as_str) {
                // Chat Completions has no "developer" role — fold it into system.
                Some("developer") => "system",
                Some(r) => r,
                None => "user",
            };
            let content = flatten_content(item.get("content"));
            messages.push(json!({ "role": role, "content": content }));
        }
        Some("function_call") => {
            // A prior tool call Codex is replaying back to the model.
            let call_id = item
                .get("call_id")
                .and_then(Value::as_str)
                .or_else(|| item.get("id").and_then(Value::as_str))
                .unwrap_or("");
            messages.push(json!({
                "role": "assistant",
                "content": Value::Null,
                "tool_calls": [{
                    "id": call_id,
                    "type": "function",
                    "function": {
                        "name": item.get("name").and_then(Value::as_str).unwrap_or(""),
                        "arguments": item.get("arguments").and_then(Value::as_str).unwrap_or("{}"),
                    }
                }]
            }));
        }
        Some("function_call_output") => {
            let call_id = item.get("call_id").and_then(Value::as_str).unwrap_or("");
            messages.push(json!({
                "role": "tool",
                "tool_call_id": call_id,
                "content": output_to_string(item.get("output")),
            }));
        }
        // `reasoning` items and anything unknown carry no chat-side equivalent.
        _ => {}
    }
}

/// Collapse a Responses `content` array (parts of `input_text` / `output_text` /
/// `text`) into a single string. A plain string content passes through.
fn flatten_content(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(parts)) => {
            let mut out = String::new();
            for p in parts {
                if let Some(t) = p.get("text").and_then(Value::as_str) {
                    out.push_str(t);
                } else if let Some(s) = p.as_str() {
                    out.push_str(s);
                }
            }
            out
        }
        _ => String::new(),
    }
}

/// `function_call_output.output` may be a string or a structured value; the chat
/// `tool` role wants a string.
fn output_to_string(output: Option<&Value>) -> String {
    match output {
        Some(Value::String(s)) => s.clone(),
        Some(v) => v.to_string(),
        None => String::new(),
    }
}

/// Responses tool → Chat tool. Responses puts `name`/`description`/`parameters`
/// at the top level; Chat nests them under `function`.
fn map_tool(tool: &Value) -> Option<Value> {
    if tool.get("type").and_then(Value::as_str) != Some("function") {
        return None;
    }
    // Already in chat shape? (nested `function`) — pass through.
    if tool.get("function").is_some() {
        return Some(tool.clone());
    }
    let name = tool.get("name").and_then(Value::as_str)?;
    let mut func = json!({ "name": name });
    let f = func.as_object_mut().unwrap();
    if let Some(d) = tool.get("description") {
        f.insert("description".into(), d.clone());
    }
    if let Some(p) = tool.get("parameters") {
        f.insert("parameters".into(), p.clone());
    }
    Some(json!({ "type": "function", "function": func }))
}

fn map_tool_choice(tc: &Value) -> Value {
    match tc {
        // "auto" / "none" / "required" pass straight through.
        Value::String(_) => tc.clone(),
        // {type:"function", name} → {type:"function", function:{name}}
        Value::Object(o) if o.get("type").and_then(Value::as_str) == Some("function") => {
            json!({ "type": "function", "function": { "name": o.get("name").cloned().unwrap_or(Value::Null) } })
        }
        _ => tc.clone(),
    }
}

// ---- Response translation: Chat Completions → Responses SSE ----

/// One in-progress tool call accumulated across streaming deltas.
#[derive(Default, Clone)]
struct ToolAcc {
    id: String,
    name: String,
    args: String,
}

/// A `Read` adapter that pulls Chat Completions SSE from `upstream` and yields
/// the equivalent Responses SSE bytes. State machine: emit `response.created`,
/// then per upstream chunk emit `response.output_text.delta` (live display)
/// while accumulating the full message + tool calls, then on upstream EOF emit
/// the authoritative `response.output_item.done` items and `response.completed`.
struct ResponsesTranslatingReader<R: BufRead> {
    upstream: R,
    out: VecDeque<u8>,
    seq: i64,
    resp_id: String,
    msg_id: String,
    created_sent: bool,
    msg_item_added: bool,
    finished_upstream: bool,
    final_emitted: bool,
    text: String,
    tools: Vec<ToolAcc>,
    usage: Option<Value>,
    output_index: i64,
}

impl<R: BufRead> ResponsesTranslatingReader<R> {
    fn new(upstream: R, resp_id: String) -> Self {
        Self {
            upstream,
            out: VecDeque::new(),
            seq: 0,
            resp_id,
            msg_id: rand_id("msg"),
            created_sent: false,
            msg_item_added: false,
            finished_upstream: false,
            final_emitted: false,
            text: String::new(),
            tools: Vec::new(),
            usage: None,
            output_index: 0,
        }
    }

    /// Push one event (an object that already carries its `type`) as SSE bytes,
    /// stamping a monotonic `sequence_number`.
    fn push(&mut self, mut ev: Value) {
        if let Some(o) = ev.as_object_mut() {
            o.insert("sequence_number".into(), json!(self.seq));
        }
        self.seq += 1;
        self.out.extend(frame(&ev).into_bytes());
    }

    /// Advance the machine by one step, filling `self.out` (or marking the end).
    fn produce(&mut self) -> io::Result<()> {
        if !self.created_sent {
            let ev = json!({ "type": "response.created", "response": { "id": self.resp_id } });
            self.push(ev);
            self.created_sent = true;
            return Ok(());
        }
        if !self.finished_upstream {
            let mut line = String::new();
            let n = self.upstream.read_line(&mut line)?;
            if n == 0 {
                self.finished_upstream = true;
                return Ok(());
            }
            let line = line.trim_end();
            if line.is_empty() {
                return Ok(());
            }
            let Some(data) = line.strip_prefix("data:") else {
                return Ok(());
            };
            let data = data.trim();
            if data == "[DONE]" {
                self.finished_upstream = true;
                return Ok(());
            }
            if let Ok(chunk) = serde_json::from_str::<Value>(data) {
                self.process_chunk(&chunk);
            }
            return Ok(());
        }
        self.emit_finals();
        self.final_emitted = true;
        Ok(())
    }

    fn process_chunk(&mut self, chunk: &Value) {
        if let Some(u) = chunk.get("usage") {
            if u.is_object() {
                self.usage = Some(u.clone());
            }
        }
        let Some(choice) = chunk.get("choices").and_then(|c| c.get(0)) else {
            return;
        };
        let delta = choice.get("delta").cloned().unwrap_or(Value::Null);

        if let Some(c) = delta.get("content").and_then(Value::as_str) {
            if !c.is_empty() {
                if !self.msg_item_added {
                    let item = json!({
                        "type": "message", "id": self.msg_id, "role": "assistant",
                        "status": "in_progress", "content": []
                    });
                    let ev = json!({
                        "type": "response.output_item.added",
                        "output_index": self.output_index, "item": item
                    });
                    self.push(ev);
                    self.msg_item_added = true;
                }
                self.text.push_str(c);
                let ev = json!({
                    "type": "response.output_text.delta",
                    "item_id": self.msg_id, "output_index": self.output_index,
                    "content_index": 0, "delta": c
                });
                self.push(ev);
            }
        }

        // DeepSeek-style reasoning tokens → reasoning text deltas (live only).
        if let Some(r) = delta.get("reasoning_content").and_then(Value::as_str) {
            if !r.is_empty() {
                let ev = json!({
                    "type": "response.reasoning_text.delta",
                    "item_id": self.msg_id, "content_index": 0, "delta": r
                });
                self.push(ev);
            }
        }

        if let Some(tcs) = delta.get("tool_calls").and_then(Value::as_array) {
            for tc in tcs {
                let idx = tc.get("index").and_then(Value::as_i64).unwrap_or(0) as usize;
                while self.tools.len() <= idx {
                    self.tools.push(ToolAcc::default());
                }
                let acc = &mut self.tools[idx];
                if let Some(id) = tc.get("id").and_then(Value::as_str) {
                    if !id.is_empty() {
                        acc.id = id.to_string();
                    }
                }
                if let Some(f) = tc.get("function") {
                    if let Some(name) = f.get("name").and_then(Value::as_str) {
                        if !name.is_empty() {
                            acc.name = name.to_string();
                        }
                    }
                    if let Some(a) = f.get("arguments").and_then(Value::as_str) {
                        acc.args.push_str(a);
                    }
                }
            }
        }
    }

    /// Emit the authoritative items (what Codex actually acts on) plus the
    /// terminal `response.completed`.
    fn emit_finals(&mut self) {
        let mut output: Vec<Value> = Vec::new();

        if !self.text.is_empty() {
            let item = message_item(&self.msg_id, &self.text);
            output.push(item.clone());
            let idx = self.output_index;
            let ev = json!({ "type": "response.output_item.done", "output_index": idx, "item": item });
            self.push(ev);
            self.output_index += 1;
        }
        // Clone out of self.tools first to avoid borrowing self while pushing.
        let tools = self.tools.clone();
        for acc in &tools {
            if acc.name.is_empty() {
                continue;
            }
            let item = function_item(acc);
            output.push(item.clone());
            let idx = self.output_index;
            let ev = json!({ "type": "response.output_item.done", "output_index": idx, "item": item });
            self.push(ev);
            self.output_index += 1;
        }

        let mut response = json!({
            "id": self.resp_id,
            "status": "completed",
            "output": output,
            "end_turn": true,
        });
        if let Some(u) = &self.usage {
            response.as_object_mut().unwrap().insert("usage".into(), map_usage(u));
        }
        let ev = json!({ "type": "response.completed", "response": response });
        self.push(ev);
    }
}

impl<R: BufRead> Read for ResponsesTranslatingReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            if !self.out.is_empty() {
                let n = self.out.len().min(buf.len());
                for slot in buf.iter_mut().take(n) {
                    *slot = self.out.pop_front().unwrap();
                }
                return Ok(n);
            }
            if self.final_emitted {
                return Ok(0);
            }
            self.produce()?;
        }
    }
}

/// Build the full Responses SSE byte stream from a single (non-streaming) Chat
/// Completions JSON body — used when an upstream ignores `stream:true`.
fn chat_completion_to_sse(chat: &Value, resp_id: &str) -> Vec<u8> {
    let msg_id = rand_id("msg");
    let mut buf = String::new();
    let mut seq = 0i64;
    let mut push = |ev: Value| {
        let mut ev = ev;
        if let Some(o) = ev.as_object_mut() {
            o.insert("sequence_number".into(), json!(seq));
        }
        seq += 1;
        buf.push_str(&frame(&ev));
    };

    push(json!({ "type": "response.created", "response": { "id": resp_id } }));

    let message = chat
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"));
    let mut output: Vec<Value> = Vec::new();
    let mut output_index = 0i64;

    if let Some(text) = message.and_then(|m| m.get("content")).and_then(Value::as_str) {
        if !text.is_empty() {
            let item = message_item(&msg_id, text);
            output.push(item.clone());
            push(json!({ "type": "response.output_item.done", "output_index": output_index, "item": item }));
            output_index += 1;
        }
    }
    if let Some(tcs) = message.and_then(|m| m.get("tool_calls")).and_then(Value::as_array) {
        for tc in tcs {
            let acc = ToolAcc {
                id: tc.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
                name: tc
                    .get("function")
                    .and_then(|f| f.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                args: tc
                    .get("function")
                    .and_then(|f| f.get("arguments"))
                    .and_then(Value::as_str)
                    .unwrap_or("{}")
                    .to_string(),
            };
            if acc.name.is_empty() {
                continue;
            }
            let item = function_item(&acc);
            output.push(item.clone());
            push(json!({ "type": "response.output_item.done", "output_index": output_index, "item": item }));
            output_index += 1;
        }
    }

    let mut response = json!({
        "id": resp_id, "status": "completed", "output": output, "end_turn": true,
    });
    if let Some(u) = chat.get("usage") {
        if u.is_object() {
            response.as_object_mut().unwrap().insert("usage".into(), map_usage(u));
        }
    }
    push(json!({ "type": "response.completed", "response": response }));

    buf.into_bytes()
}

/// A completed Responses assistant-message output item.
fn message_item(id: &str, text: &str) -> Value {
    json!({
        "type": "message", "id": id, "role": "assistant", "status": "completed",
        "content": [{ "type": "output_text", "text": text, "annotations": [] }]
    })
}

/// A completed Responses `function_call` output item (what Codex executes).
fn function_item(acc: &ToolAcc) -> Value {
    let call_id = if acc.id.is_empty() { rand_id("call") } else { acc.id.clone() };
    let args = if acc.args.is_empty() { "{}".to_string() } else { acc.args.clone() };
    json!({
        "type": "function_call",
        "id": rand_id("fc"),
        "call_id": call_id,
        "name": acc.name,
        "arguments": args,
        "status": "completed",
    })
}

/// Chat `usage` → Responses `usage` (the fields Codex reads).
fn map_usage(u: &Value) -> Value {
    let input = u.get("prompt_tokens").and_then(Value::as_i64).unwrap_or(0);
    let output = u.get("completion_tokens").and_then(Value::as_i64).unwrap_or(0);
    let total = u
        .get("total_tokens")
        .and_then(Value::as_i64)
        .unwrap_or(input + output);
    json!({ "input_tokens": input, "output_tokens": output, "total_tokens": total })
}

// ---- small helpers ----

fn sse_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"text/event-stream"[..])
        .expect("static header is valid")
}

/// Frame an event object as an SSE `event:`/`data:` pair.
fn frame(ev: &Value) -> String {
    let t = ev.get("type").and_then(Value::as_str).unwrap_or("message");
    format!("event: {t}\ndata: {ev}\n\n")
}

/// A standalone `response.failed` SSE frame carrying an error message — Codex
/// treats it as fatal and surfaces the text.
fn failed_event(message: &str) -> String {
    frame(&json!({
        "type": "response.failed",
        "response": { "error": { "message": message } }
    }))
}

/// Respond to a request with a single fatal `response.failed` event.
fn respond_failed(request: tiny_http::Request, message: &str) {
    tracing::warn!("codex proxy: {message}");
    let body = failed_event(message);
    let response = Response::new(
        StatusCode(200),
        vec![sse_header()],
        io::Cursor::new(body.into_bytes()),
        None,
        None,
    );
    let _ = request.respond(response);
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

/// `<prefix>_<32 hex>` using crypto-grade randomness (same source as terminal
/// session ids). Used for the synthetic Responses object / item ids.
fn rand_id(prefix: &str) -> String {
    let mut bytes = [0u8; 16];
    if getrandom::getrandom(&mut bytes).is_err() {
        // Astronomically unlikely; a constant suffix is still a valid id.
        return format!("{prefix}_0000000000000000");
    }
    let mut hex = String::with_capacity(32);
    for b in bytes {
        hex.push_str(&format!("{b:02x}"));
    }
    format!("{prefix}_{hex}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_provider_id_only_matches_responses_path() {
        assert_eq!(parse_provider_id("/p/deepseek/v1/responses").as_deref(), Some("deepseek"));
        assert_eq!(parse_provider_id("p/kimi/v1/responses").as_deref(), Some("kimi"));
        assert_eq!(parse_provider_id("/p/deepseek/v1/chat/completions"), None);
        assert_eq!(parse_provider_id("/v1/responses"), None);
    }

    #[test]
    fn chat_completions_url_handles_trailing_slash() {
        assert_eq!(chat_completions_url("https://api.deepseek.com/v1"), "https://api.deepseek.com/v1/chat/completions");
        assert_eq!(chat_completions_url("http://localhost:11434/v1/"), "http://localhost:11434/v1/chat/completions");
    }

    #[test]
    fn responses_to_chat_maps_instructions_input_and_tools() {
        let req = json!({
            "model": "deepseek-chat",
            "instructions": "be terse",
            "input": [
                { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "hi" }] },
                { "type": "function_call", "call_id": "call_1", "name": "ls", "arguments": "{}" },
                { "type": "function_call_output", "call_id": "call_1", "output": "a\nb" }
            ],
            "tools": [
                { "type": "function", "name": "ls", "description": "list", "parameters": { "type": "object" } }
            ],
            "tool_choice": { "type": "function", "name": "ls" },
            "max_output_tokens": 256
        });
        let chat = responses_to_chat(&req);
        assert_eq!(chat["model"], "deepseek-chat");
        assert_eq!(chat["stream"], true);
        assert_eq!(chat["max_tokens"], 256);
        let msgs = chat["messages"].as_array().unwrap();
        // system(instructions) + user + assistant(tool_call) + tool(output)
        assert_eq!(msgs.len(), 4);
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(msgs[1]["content"], "hi");
        assert_eq!(msgs[2]["role"], "assistant");
        assert_eq!(msgs[2]["tool_calls"][0]["function"]["name"], "ls");
        assert_eq!(msgs[3]["role"], "tool");
        assert_eq!(msgs[3]["tool_call_id"], "call_1");
        assert_eq!(msgs[3]["content"], "a\nb");
        // tool nested under `function`
        assert_eq!(chat["tools"][0]["function"]["name"], "ls");
        assert_eq!(chat["tool_choice"]["function"]["name"], "ls");
    }

    #[test]
    fn developer_role_folds_into_system() {
        let req = json!({ "input": [{ "type": "message", "role": "developer", "content": "x" }] });
        let chat = responses_to_chat(&req);
        assert_eq!(chat["messages"][0]["role"], "system");
    }

    fn collect_events(sse: &[u8]) -> Vec<Value> {
        String::from_utf8_lossy(sse)
            .split("\n\n")
            .filter_map(|block| {
                block
                    .lines()
                    .find_map(|l| l.strip_prefix("data:"))
                    .and_then(|d| serde_json::from_str::<Value>(d.trim()).ok())
            })
            .collect()
    }

    #[test]
    fn streaming_text_translates_to_responses_events() {
        let upstream = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2,\"total_tokens\":5}}\n\n",
            "data: [DONE]\n\n",
        );
        let reader = ResponsesTranslatingReader::new(BufReader::new(upstream.as_bytes()), "resp_x".into());
        let mut out = Vec::new();
        let mut r = reader;
        r.read_to_end(&mut out).unwrap();
        let events = collect_events(&out);
        let kinds: Vec<&str> = events.iter().filter_map(|e| e["type"].as_str()).collect();
        assert_eq!(kinds.first(), Some(&"response.created"));
        assert!(kinds.contains(&"response.output_text.delta"));
        assert_eq!(kinds.last(), Some(&"response.completed"));

        let done = events.iter().find(|e| e["type"] == "response.output_item.done").unwrap();
        assert_eq!(done["item"]["content"][0]["text"], "Hello");
        let completed = events.iter().find(|e| e["type"] == "response.completed").unwrap();
        assert_eq!(completed["response"]["usage"]["input_tokens"], 3);
        assert_eq!(completed["response"]["usage"]["total_tokens"], 5);
        assert_eq!(completed["response"]["output"][0]["content"][0]["text"], "Hello");
    }

    #[test]
    fn streaming_tool_call_is_accumulated_into_function_item() {
        let upstream = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_9\",\"function\":{\"name\":\"grep\",\"arguments\":\"{\\\"q\\\":\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"x\\\"}\"}}]}}]}\n\n",
            "data: [DONE]\n\n",
        );
        let mut r = ResponsesTranslatingReader::new(BufReader::new(upstream.as_bytes()), "resp_y".into());
        let mut out = Vec::new();
        r.read_to_end(&mut out).unwrap();
        let events = collect_events(&out);
        let done = events
            .iter()
            .find(|e| e["type"] == "response.output_item.done" && e["item"]["type"] == "function_call")
            .expect("a function_call item");
        assert_eq!(done["item"]["name"], "grep");
        assert_eq!(done["item"]["call_id"], "call_9");
        assert_eq!(done["item"]["arguments"], "{\"q\":\"x\"}");
    }

    #[test]
    fn non_streaming_body_synthesizes_event_sequence() {
        let chat = json!({
            "choices": [{ "message": { "content": "hi there" } }],
            "usage": { "prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3 }
        });
        let sse = chat_completion_to_sse(&chat, "resp_z");
        let events = collect_events(&sse);
        assert_eq!(events.first().unwrap()["type"], "response.created");
        assert_eq!(events.last().unwrap()["type"], "response.completed");
        let done = events.iter().find(|e| e["type"] == "response.output_item.done").unwrap();
        assert_eq!(done["item"]["content"][0]["text"], "hi there");
    }
}
