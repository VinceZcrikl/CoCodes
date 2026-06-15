/** Terminal-activity monitor that drives the toolbar samurai's mood.
 *
 *  Mirrors `delegationMonitor.ts`: a reference-counted singleton that listens
 *  to the `terminal://data` Tauri event (and `terminal://exit`, plus the
 *  existing `terminus:*` window events). It measures output throughput over a
 *  sliding window and pushes a `{ mood, intensity, cue }` snapshot to
 *  subscribers, so the warrior fights when Claude streams output, meditates
 *  when the terminal is quiet, draws on <Enter>, bows/falls on exit, and
 *  dashes when a task is delegated.
 *
 *  Non-Tauri (plain `npm run dev`) is tolerated — the `listen` calls are
 *  guarded, so the warrior still plays its random loop without a backend. */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type WarriorMood = "zen" | "idle" | "alert" | "combat" | "finish";
export type WarriorCue = "draw" | "bow" | "fall" | "deliver";

export interface WarriorState {
  mood: WarriorMood;
  /** Output throughput, 0..1. */
  intensity: number;
  /** Latest one-shot cue (null until the first cue fires). */
  cue: WarriorCue | null;
  /** Monotonic id — bumps on each new cue so subscribers can detect it. */
  cueId: number;
}

type Sub = (s: WarriorState) => void;

// ─── Tuning ─────────────────────────────────────────────────────────────────
const WINDOW_MS = 1000; // throughput sliding window
const IDLE_MS = 1200; // silence → sheathe / idle
const ZEN_MS = 6500; // longer silence → meditate
const SATURATION = 2200; // bytes/sec mapped to intensity = 1
const EMIT_THROTTLE_MS = 90; // cap subscriber churn during heavy streaming

interface DataEvent {
  id: string;
  data: string; // base64-encoded PTY bytes
}
interface ExitEvent {
  id: string;
  code: number | null;
}

// ─── Singleton state ──────────────────────────────────────────────────────────
const subs = new Set<Sub>();
let started = false;
const unlisteners: UnlistenFn[] = [];
const winCleanups: Array<() => void> = [];

let mood: WarriorMood = "idle";
let intensity = 0;
let cue: WarriorCue | null = null;
let cueId = 0;

let samples: Array<{ t: number; n: number }> = [];
let idleTimer: number | undefined;
let zenTimer: number | undefined;
let lastEmit = 0;
let emitTimer: number | undefined;

function snapshot(): WarriorState {
  return { mood, intensity, cue, cueId };
}

function emit(force = false): void {
  const now = Date.now();
  if (!force && now - lastEmit < EMIT_THROTTLE_MS) {
    if (emitTimer == null) {
      emitTimer = window.setTimeout(() => {
        emitTimer = undefined;
        emit(true);
      }, EMIT_THROTTLE_MS);
    }
    return;
  }
  lastEmit = now;
  const s = snapshot();
  subs.forEach((cb) => {
    try {
      cb(s);
    } catch {
      /* a broken subscriber must not break the others */
    }
  });
}

/** Estimate decoded byte count of a base64 chunk without paying for atob(). */
function approxBytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

function recomputeIntensity(): void {
  const now = Date.now();
  samples = samples.filter((s) => now - s.t <= WINDOW_MS);
  const bytes = samples.reduce((a, s) => a + s.n, 0);
  const bps = bytes * (1000 / WINDOW_MS);
  intensity = Math.max(0, Math.min(1, bps / SATURATION));
}

function scheduleIdle(): void {
  if (idleTimer) window.clearTimeout(idleTimer);
  if (zenTimer) window.clearTimeout(zenTimer);
  idleTimer = window.setTimeout(() => {
    intensity = 0;
    mood = "idle";
    emit(true);
  }, IDLE_MS);
  zenTimer = window.setTimeout(() => {
    intensity = 0;
    mood = "zen";
    emit(true);
  }, ZEN_MS);
}

function fireCue(c: WarriorCue): void {
  cue = c;
  cueId += 1;
  if (c === "bow" || c === "fall") mood = "finish";
  else if (mood === "zen" || mood === "idle") mood = "alert";
  emit(true);
}

function onData(bytes: number): void {
  samples.push({ t: Date.now(), n: bytes });
  recomputeIntensity();
  mood = intensity > 0.4 ? "combat" : "alert";
  scheduleIdle();
  emit();
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────
function ensureStarted(): void {
  if (started) return;
  started = true;

  listen<DataEvent>("terminal://data", (ev) => {
    onData(approxBytes(ev.payload.data));
  })
    .then((un) => (started ? unlisteners.push(un) : un()))
    .catch(() => {
      /* not running under Tauri — warrior falls back to its random loop */
    });

  listen<ExitEvent>("terminal://exit", (ev) => {
    const code = ev.payload.code;
    fireCue(code && code !== 0 ? "fall" : "bow");
    scheduleIdle();
  })
    .then((un) => (started ? unlisteners.push(un) : un()))
    .catch(() => {});

  const onInput = (e: Event) => {
    const data = (e as CustomEvent<{ data?: string }>).detail?.data;
    // Only the Enter / submit keystroke triggers a draw, to avoid firing on
    // every character the user types.
    if (typeof data === "string" && /[\r\n]/.test(data)) {
      fireCue("draw");
      scheduleIdle();
    }
  };
  const onDelegate = () => {
    fireCue("deliver");
    scheduleIdle();
  };
  window.addEventListener("terminus:input", onInput);
  window.addEventListener("terminus:delegation", onDelegate);
  window.addEventListener("terminus:delegation-result", onDelegate);
  winCleanups.push(
    () => window.removeEventListener("terminus:input", onInput),
    () => window.removeEventListener("terminus:delegation", onDelegate),
    () => window.removeEventListener("terminus:delegation-result", onDelegate),
  );
}

function maybeStop(): void {
  if (subs.size > 0) return;
  started = false;
  unlisteners.splice(0).forEach((un) => {
    try {
      un();
    } catch {
      /* already gone */
    }
  });
  winCleanups.splice(0).forEach((fn) => fn());
  if (idleTimer) window.clearTimeout(idleTimer);
  if (zenTimer) window.clearTimeout(zenTimer);
  if (emitTimer) window.clearTimeout(emitTimer);
  emitTimer = undefined;
  samples = [];
}

/** Subscribe to mood/intensity/cue updates. Reference-counted: the underlying
 *  Tauri listeners are torn down when the last subscriber unsubscribes. */
export function subscribeWarrior(cb: Sub): () => void {
  subs.add(cb);
  ensureStarted();
  try {
    cb(snapshot());
  } catch {
    /* ignore */
  }
  return () => {
    subs.delete(cb);
    maybeStop();
  };
}

export function getWarriorState(): WarriorState {
  return snapshot();
}
