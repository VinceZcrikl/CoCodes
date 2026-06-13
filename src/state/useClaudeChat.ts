/** Headless `claude` chat — drives the backend `claude_run` command and parses
 *  its `stream-json` event stream into a renderable message list.
 *
 *  One hook instance owns one conversation: the first turn lets `claude` assign
 *  a session id (captured from the `system/init` event); every later turn passes
 *  it back with `resume: true`, so the conversation is multi-turn. This runs
 *  independently of the pane's live PTY session to avoid `--resume` conflicts.
 *
 *  Auth is entirely backend-side: `claude_run` reuses the terminal's env, so the
 *  CLI uses the Claude Code subscription login — no API key. */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface ToolCall {
  id: string;
  name: string;
  input?: string;
  result?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolCall[];
  streaming: boolean;
  costUsd?: number;
  error?: string;
}

interface RunLine {
  runId: string;
  line: string;
}
interface RunDone {
  runId: string;
  code: number | null;
}

function uuid(): string {
  return crypto.randomUUID();
}

export function useClaudeChat(opts: {
  profileId: string;
  cwd?: string | null;
  model?: string | null;
}) {
  const { profileId, cwd, model } = opts;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const runIdRef = useRef<string | null>(null);
  const asstIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn[]>([]);

  const cleanup = useCallback(() => {
    unlistenRef.current.forEach((u) => u());
    unlistenRef.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /** Mutate the in-flight assistant message. */
  const patchAsst = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
    const id = asstIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const finish = useCallback(() => {
    patchAsst((m) => ({ ...m, streaming: false }));
    setBusy(false);
    runIdRef.current = null;
    asstIdRef.current = null;
    cleanup();
  }, [patchAsst, cleanup]);

  const handleLine = useCallback(
    (raw: string) => {
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(raw);
      } catch {
        return;
      }
      const type = ev.type as string;

      if (type === "system" && ev.subtype === "init") {
        if (typeof ev.session_id === "string") sessionIdRef.current = ev.session_id;
        return;
      }

      if (type === "stream_event") {
        const inner = ev.event as Record<string, unknown> | undefined;
        if (inner?.type === "content_block_delta") {
          const delta = inner.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            const t = delta.text;
            patchAsst((m) => ({ ...m, text: m.text + t }));
          }
        }
        return;
      }

      if (type === "assistant") {
        const msg = ev.message as { content?: Array<Record<string, unknown>> } | undefined;
        const blocks = msg?.content ?? [];
        const textParts: string[] = [];
        const tools: ToolCall[] = [];
        for (const b of blocks) {
          if (b.type === "text" && typeof b.text === "string") textParts.push(b.text);
          else if (b.type === "tool_use") {
            tools.push({
              id: String(b.id ?? uuid()),
              name: String(b.name ?? "tool"),
              input: b.input ? JSON.stringify(b.input, null, 2) : undefined,
            });
          }
        }
        patchAsst((m) => ({
          ...m,
          // Prefer the authoritative joined text when present (covers
          // non-streamed turns); otherwise keep the streamed deltas.
          text: textParts.length ? textParts.join("") : m.text,
          tools: tools.length ? [...m.tools, ...tools] : m.tools,
        }));
        return;
      }

      if (type === "user") {
        // Tool results returned to the model.
        const msg = ev.message as { content?: Array<Record<string, unknown>> } | undefined;
        for (const b of msg?.content ?? []) {
          if (b.type === "tool_result") {
            const tid = String(b.tool_use_id ?? "");
            const content = b.content;
            const text =
              typeof content === "string"
                ? content
                : Array.isArray(content)
                  ? content
                      .map((c: Record<string, unknown>) => (typeof c.text === "string" ? c.text : ""))
                      .join("")
                  : "";
            patchAsst((m) => ({
              ...m,
              tools: m.tools.map((t) => (t.id === tid ? { ...t, result: text } : t)),
            }));
          }
        }
        return;
      }

      if (type === "result") {
        if (typeof ev.session_id === "string") sessionIdRef.current = ev.session_id;
        startedRef.current = true;
        const cost = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : undefined;
        const finalText = typeof ev.result === "string" ? ev.result : undefined;
        const isErr = ev.is_error === true;
        patchAsst((m) => ({
          ...m,
          text: m.text || finalText || "",
          streaming: false,
          costUsd: cost,
          error: isErr ? finalText || "run failed" : m.error,
        }));
      }
    },
    [patchAsst],
  );

  const send = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text || busy) return;
      const runId = uuid();
      runIdRef.current = runId;
      const asstId = uuid();
      asstIdRef.current = asstId;
      setBusy(true);

      setMessages((prev) => [
        ...prev,
        { id: uuid(), role: "user", text, tools: [], streaming: false },
        { id: asstId, role: "assistant", text: "", tools: [], streaming: true },
      ]);

      // Subscribe BEFORE invoking so no early events are missed.
      const offEvent = await listen<RunLine>("claude-run://event", (e) => {
        if (e.payload.runId === runId) handleLine(e.payload.line);
      });
      const offErr = await listen<RunLine>("claude-run://stderr", (e) => {
        if (e.payload.runId !== runId) return;
        patchAsst((m) => ({ ...m, error: (m.error ?? "") + e.payload.line + "\n" }));
      });
      const offDone = await listen<RunDone>("claude-run://done", (e) => {
        if (e.payload.runId !== runId) return;
        finish();
      });
      unlistenRef.current.push(offEvent, offErr, offDone);

      try {
        await invoke("claude_run", {
          runId,
          prompt: text,
          profileId,
          sessionId: sessionIdRef.current,
          resume: startedRef.current,
          cwd: cwd ?? null,
          model: model ?? null,
        });
      } catch (err) {
        patchAsst((m) => ({ ...m, error: String(err), streaming: false }));
        finish();
      }
    },
    [busy, profileId, cwd, model, handleLine, patchAsst, finish],
  );

  const cancel = useCallback(() => {
    const runId = runIdRef.current;
    if (runId) void invoke("claude_run_cancel", { runId });
    finish();
  }, [finish]);

  const reset = useCallback(() => {
    cancel();
    sessionIdRef.current = null;
    startedRef.current = false;
    setMessages([]);
  }, [cancel]);

  return { messages, busy, send, cancel, reset };
}
