import { useEffect, useState } from "react";
import { BellRing, CornerDownLeft, X } from "lucide-react";
import { useAttentionStore } from "../../state/attentionStore";
import { navigateToTerminal } from "../../state/attentionNav";

/** Window CustomEvent that opens the inbox from elsewhere (the deck's
 *  "waiting" badge). */
export const ATTENTION_INBOX_EVENT = "cocodes:attention-inbox";

/** Attention inbox — every pane waiting on the user's confirmation, worked
 *  through from the keyboard: ⌘⇧A opens it, j/k (or arrows) move, Enter (or a
 *  digit) jumps to that terminal, x dismisses, Esc closes. Complements the
 *  toast banner: the banner interrupts one prompt at a time, the inbox is for
 *  triaging a pileup. Mounted once by the cockpit. */
export default function AttentionInbox() {
  const queue = useAttentionStore((s) => s.queue);
  const resolve = useAttentionStore((s) => s.resolve);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);

  // ⌘⇧A toggles; the deck's waiting badge opens via the custom event. Capture
  // phase so a focused terminal never swallows the chord.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(ATTENTION_INBOX_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(ATTENTION_INBOX_EVENT, onOpen);
    };
  }, []);

  // Keep the selection on a real row as prompts resolve; an emptied queue
  // closes the inbox (nothing left to triage).
  useEffect(() => {
    if (queue.length === 0) setOpen(false);
    setSel((s) => Math.min(s, Math.max(0, queue.length - 1)));
  }, [queue.length]);

  // The inbox owns the keyboard while open (capture phase, so navigation keys
  // don't type into the focused terminal underneath).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const isDigit = /^[1-9]$/.test(k);
      const handled = ["Escape", "Enter", "ArrowDown", "ArrowUp", "j", "k", "x", "Backspace"];
      if (!handled.includes(k) && !isDigit) return;
      e.preventDefault();
      e.stopPropagation();
      const q = useAttentionStore.getState().queue;
      if (k === "Escape") setOpen(false);
      else if (k === "Enter" || isDigit) {
        const item = isDigit ? q[Number(k) - 1] : q[sel];
        if (item) {
          setOpen(false);
          void navigateToTerminal(item.id);
        }
      } else if (k === "ArrowDown" || k === "j") {
        setSel((s) => (q.length ? (s + 1) % q.length : 0));
      } else if (k === "ArrowUp" || k === "k") {
        setSel((s) => (q.length ? (s - 1 + q.length) % q.length : 0));
      } else if (k === "x" || k === "Backspace") {
        const item = q[sel];
        if (item) resolve(item.id);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, sel, resolve]);

  if (!open) return null;

  return (
    <div
      className="attention-inbox-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="attention-inbox" role="dialog" aria-label="Attention inbox">
        <header className="attention-inbox-head">
          <BellRing size={14} className="attention-inbox-bell" />
          <span className="attention-inbox-title">Waiting for you</span>
          {queue.length > 0 && <span className="attention-inbox-count">{queue.length}</span>}
          <button
            type="button"
            className="attention-inbox-close"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </header>
        {queue.length === 0 ? (
          <div className="attention-inbox-empty">All clear — nothing needs your confirmation.</div>
        ) : (
          <div className="attention-inbox-list">
            {queue.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`attention-inbox-item${i === sel ? " sel" : ""}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => {
                  setOpen(false);
                  void navigateToTerminal(item.id);
                }}
              >
                <span className="attention-inbox-n">{i + 1}</span>
                <span className="attention-inbox-label">{item.label}</span>
                <span className="attention-inbox-msg">{item.message}</span>
                <span className="attention-inbox-age">{age(item.ts)}</span>
                <CornerDownLeft size={12} className="attention-inbox-go" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <footer className="attention-inbox-hints">
          ↑↓ / j k move · Enter / 1–9 jump · x dismiss · Esc close
        </footer>
      </div>
    </div>
  );
}

function age(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}
