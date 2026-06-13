/** Structured chat view — renders headless `claude` responses (via
 *  `useClaudeChat`) as a message list with markdown, tool chips and a cost
 *  footer, plus a composer. An alternative to the raw xterm terminal for the
 *  same persona; toggled from the toolbar. */
import { useEffect, useRef, useState } from "react";
import { Send, Square, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useClaudeChat, type ChatMessage } from "../../state/useClaudeChat";

function ToolChip({ tool }: { tool: ChatMessage["tools"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`chat-tool${open ? " open" : ""}`}>
      <button type="button" className="chat-tool-head" onClick={() => setOpen((v) => !v)}>
        <Wrench size={12} strokeWidth={1.75} />
        <span className="chat-tool-name">{tool.name}</span>
      </button>
      {open && (
        <div className="chat-tool-body">
          {tool.input && (
            <>
              <div className="chat-tool-label">input</div>
              <pre className="chat-tool-pre">{tool.input}</pre>
            </>
          )}
          {tool.result && (
            <>
              <div className="chat-tool-label">result</div>
              <pre className="chat-tool-pre">{tool.result}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: ChatMessage }) {
  return (
    <div className={`chat-msg chat-msg-${m.role}`}>
      <div className="chat-msg-role">{m.role === "user" ? "You" : "Claude"}</div>
      <div className="chat-msg-body">
        {m.role === "assistant" ? (
          <div className="chat-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text || ""}</ReactMarkdown>
            {m.streaming && !m.text && <span className="chat-cursor">▍</span>}
          </div>
        ) : (
          <div className="chat-user-text">{m.text}</div>
        )}
        {m.tools.map((t) => (
          <ToolChip key={t.id} tool={t} />
        ))}
        {m.error && <div className="chat-msg-error">{m.error}</div>}
        {(m.costUsd != null || (m.streaming && m.role === "assistant")) && (
          <div className="chat-msg-meta">
            {m.streaming ? "…" : m.costUsd != null ? `$${m.costUsd.toFixed(4)}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatView({
  profileId,
  cwd,
  model,
}: {
  profileId: string;
  cwd?: string | null;
  model?: string | null;
}) {
  const { messages, busy, send, cancel } = useClaudeChat({ profileId, cwd, model });
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep pinned to the bottom as content streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    void send(text);
    setDraft("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat-headless">
      <div className="chat-headless-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-headless-empty">
            Ask Claude — responses render here, streamed from the CLI on your
            subscription login.
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} m={m} />)
        )}
      </div>
      <div className="chat-composer">
        <textarea
          ref={taRef}
          className="chat-composer-input"
          placeholder="Message Claude…  (Enter to send, Shift+Enter for newline)"
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button type="button" className="chat-composer-btn stop" onClick={cancel} title="Stop">
            <Square size={15} strokeWidth={2} />
          </button>
        ) : (
          <button
            type="button"
            className="chat-composer-btn"
            onClick={submit}
            disabled={!draft.trim()}
            title="Send"
          >
            <Send size={15} strokeWidth={1.9} />
          </button>
        )}
      </div>
    </div>
  );
}
