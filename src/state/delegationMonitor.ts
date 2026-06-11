/** Structured task delegation between CLI panes.
 *
 * Claude (or any CLI) emits a delegation block to hand a task to another CLI:
 *
 *   [TASK→codex]
 *   task description here
 *   [/TASK]
 *
 * This module watches all `terminal://data` Tauri events, strips ANSI codes,
 * and fires `terminus:delegation` on `window` when a block is detected.
 *
 * `ClaudeTab` handles the event and dispatches `terminus:inject-to-pane` to
 * route the task text into the correct pane's PTY stdin. */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ─── Public event names & types ──────────────────────────────────────────────

/** Fired on `window` when a delegation block is detected in any PTY output. */
export const DELEGATION_EVENT = "terminus:delegation";

/** Fired on `window` to inject text into a specific pane by its pane ID. */
export const INJECT_PANE_EVENT = "terminus:inject-to-pane";

export interface DelegationDetail {
  /** CLI name from the `[TASK→<cli>]` marker (e.g. "codex", "grok"). */
  targetCli: string;
  /** Full task body (trimmed). */
  task: string;
}

export interface InjectPaneDetail {
  /** The `PaneNode.paneId` of the target pane. */
  paneId: string;
  /** Text to inject (submitted with CR by `writeLine`). */
  text: string;
}

// ─── Internal singleton state ─────────────────────────────────────────────────

interface DataEvent {
  id: string;
  data: string; // base64-encoded PTY bytes
}

// Per-PTY-session rolling text buffer (capped at 8 KB).
const buffers = new Map<string, string>();
let unlisten: UnlistenFn | null = null;
let refCount = 0;

const PATTERN = /\[TASK→(\w+)\]\n([\s\S]*?)\[\/TASK\]/g;
const CLEAR_PATTERN = /\[TASK→\w+\][\s\S]*?\[\/TASK\]/g;
const ANSI_RE =
  /\x1b\[[0-9;]*[mGKHFJA-Za-z]|\x1b\][^\x07]*\x07|\x1b[^[\]]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Start monitoring PTY output for delegation blocks.
 *  Reference-counted — safe to call from multiple components. */
export async function startDelegationMonitor(): Promise<void> {
  refCount++;
  if (unlisten) return;

  unlisten = await listen<DataEvent>("terminal://data", (ev) => {
    const { id, data } = ev.payload;
    const chunk = stripAnsi(atob(data));
    const prev = buffers.get(id) ?? "";
    const combined = (prev + chunk).slice(-8192);
    buffers.set(id, combined);

    PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PATTERN.exec(combined)) !== null) {
      const detail: DelegationDetail = {
        targetCli: match[1].toLowerCase(),
        task: match[2].trim(),
      };
      window.dispatchEvent(new CustomEvent(DELEGATION_EVENT, { detail }));
    }

    // Remove matched blocks so they don't re-fire on the next chunk.
    const cleared = combined.replace(CLEAR_PATTERN, "");
    if (cleared !== combined) buffers.set(id, cleared);
  });
}

/** Stop monitoring. Tears down the Tauri listener when all callers have stopped. */
export function stopDelegationMonitor(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && unlisten) {
    unlisten();
    unlisten = null;
    buffers.clear();
  }
}
