/** Live "agent pulse" — a cheap activity signal distilled from terminal output,
 *  for the persona status orb to react to.
 *
 *  Watches every `terminal://data` (base64 PTY bytes) and `terminal://exit`
 *  Tauri event and reduces them to a few frequently-sampled numbers:
 *
 *    - `lastDataMs` — timestamp of the most recent output chunk; the orb loop
 *      derives "is output flowing right now" from how stale this is.
 *    - `intensity`  — 0..1 estimate of how hard output is streaming, bumped by
 *      chunk size and decayed at sample time.
 *    - `errorMs`    — timestamp of the last chunk containing a red SGR code.
 *    - `exit`       — { code, at } from the most recent PTY exit.
 *
 *  Mirrors the ref-counted singleton-listener pattern in `delegationMonitor.ts`
 *  so only one Tauri listener runs regardless of how many callers subscribe.
 *  Read through `getPulse()` (a plain getter) so the orb's rAF loop can sample
 *  it without triggering React re-renders. */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface DataEvent {
  id: string;
  data: string; // base64-encoded PTY bytes
}

interface ExitEvent {
  id: string;
  code: number | null;
}

export interface ExitInfo {
  code: number | null;
  at: number; // performance.now() when the exit arrived
}

export interface Pulse {
  lastDataMs: number;
  intensity: number; // 0..1, decayed to "now"
  errorMs: number;
  exit: ExitInfo | null;
}

// Red foreground SGR sequences: 31 (red), 91 (bright red), optional leading
// attributes like 1; (bold). Matched against the raw, un-stripped chunk.
const RED_SGR_RE = /\x1b\[(?:[0-9;]*;)?(?:31|91)m/;

const BURST_BYTES = 4096; // chunk size that counts as a full output "burst"
const DECAY_MS = 700; // time constant for intensity decay

const state: Pulse = {
  lastDataMs: 0,
  intensity: 0,
  errorMs: 0,
  exit: null,
};

let unlistenData: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;
let refCount = 0;

function bump(bytes: number, atMs: number): void {
  const dt = state.lastDataMs ? atMs - state.lastDataMs : DECAY_MS;
  const decayed = state.intensity * Math.exp(-Math.max(0, dt) / DECAY_MS);
  const add = Math.min(1, bytes / BURST_BYTES);
  state.intensity = Math.min(1, decayed + add);
  state.lastDataMs = atMs;
}

/** Snapshot with `intensity` decayed to the current instant. */
export function getPulse(): Pulse {
  const now = performance.now();
  const dt = state.lastDataMs ? now - state.lastDataMs : DECAY_MS * 4;
  const intensity = state.intensity * Math.exp(-Math.max(0, dt) / DECAY_MS);
  return {
    lastDataMs: state.lastDataMs,
    intensity,
    errorMs: state.errorMs,
    exit: state.exit,
  };
}

/** Start monitoring PTY output. Reference-counted — safe to call repeatedly. */
export async function startAgentPulse(): Promise<void> {
  refCount++;
  if (unlistenData) return;

  unlistenData = await listen<DataEvent>("terminal://data", (ev) => {
    const now = performance.now();
    let raw: string;
    try {
      raw = atob(ev.payload.data);
    } catch {
      return;
    }
    bump(raw.length, now);
    if (RED_SGR_RE.test(raw)) state.errorMs = now;
  });

  unlistenExit = await listen<ExitEvent>("terminal://exit", (ev) => {
    state.exit = { code: ev.payload.code, at: performance.now() };
  });
}

/** Stop monitoring. Tears down listeners when the last caller stops. */
export function stopAgentPulse(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  unlistenData?.();
  unlistenExit?.();
  unlistenData = null;
  unlistenExit = null;
  state.lastDataMs = 0;
  state.intensity = 0;
  state.errorMs = 0;
  state.exit = null;
}
