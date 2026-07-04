/** Per-terminal activity tracker — records when each terminal last emitted output
 *  so consumers can derive which sessions / panes have a running agent.
 *
 *  Mirrors the ref-counted singleton pattern in `agentPulse.ts`. Only one pair
 *  of Tauri listeners is registered regardless of how many callers subscribe. */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { lookupTerminal } from "./terminalRegistry";

interface ActivityEntry {
  lastMs: number;
  sessionId: string;
  paneId: string;
}

interface DataEvent { id: string; data: string; }
interface ExitEvent { id: string; code: number | null; }

/** How long after the last output chunk a terminal is considered idle. */
const IDLE_MS = 4000;

const activity = new Map<string, ActivityEntry>();
let unlistenData: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;
let refCount = 0;

/** Completed-run ledger. A "run" spans a pane's first output chunk to the
 *  moment its stream goes quiet (leaves the busy set — so `runMs` includes the
 *  trailing IDLE_MS). Recorded here, independent of any component, so a late
 *  observer — a deck card mounted after the fact — can still react to "that
 *  run just finished". Only the most recent run per pane is kept. */
export interface RunRecord {
  endedAt: number;
  runMs: number;
}

const runStarts = new Map<string, number>();
const lastRuns = new Map<string, RunRecord>();
let edgeTimer: number | null = null;

function pollRunEdges(): void {
  const busy = getBusyPaneIds();
  const now = performance.now();
  for (const paneId of busy) {
    if (!runStarts.has(paneId)) runStarts.set(paneId, now);
  }
  for (const [paneId, start] of runStarts) {
    if (busy.has(paneId)) continue;
    runStarts.delete(paneId);
    lastRuns.set(paneId, { endedAt: now, runMs: now - start });
  }
}

export function getLastRun(paneId: string): RunRecord | null {
  return lastRuns.get(paneId) ?? null;
}

export async function startTracking(): Promise<void> {
  refCount++;
  if (unlistenData) return;

  edgeTimer ??= window.setInterval(pollRunEdges, 300);

  unlistenData = await listen<DataEvent>("terminal://data", (ev) => {
    const reg = lookupTerminal(ev.payload.id);
    if (reg) {
      activity.set(ev.payload.id, {
        lastMs: performance.now(),
        sessionId: reg.sessionId,
        paneId: reg.paneId,
      });
    }
  });

  unlistenExit = await listen<ExitEvent>("terminal://exit", (ev) => {
    activity.delete(ev.payload.id);
  });
}

export function stopTracking(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  unlistenData?.();
  unlistenExit?.();
  unlistenData = null;
  unlistenExit = null;
  activity.clear();
  if (edgeTimer !== null) {
    window.clearInterval(edgeTimer);
    edgeTimer = null;
  }
  runStarts.clear();
  lastRuns.clear();
}

export function getBusyPaneIds(): Set<string> {
  const now = performance.now();
  const result = new Set<string>();
  for (const e of activity.values()) {
    if (now - e.lastMs < IDLE_MS) result.add(e.paneId);
  }
  return result;
}

export function getBusySessionIds(): Set<string> {
  const now = performance.now();
  const result = new Set<string>();
  for (const e of activity.values()) {
    if (now - e.lastMs < IDLE_MS) result.add(e.sessionId);
  }
  return result;
}
