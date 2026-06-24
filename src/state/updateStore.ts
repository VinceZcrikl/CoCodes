import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "uptodate"
  | "available"
  | "downloading"
  | "ready"
  | "error";

interface UpdateState {
  phase: UpdatePhase;
  version: string | null;
  notes: string | null;
  /** Download progress 0–1. */
  progress: number;
  error: string | null;
  setAvailable: (version: string, notes: string | null) => void;
  setProgress: (p: number) => void;
  setPhase: (p: UpdatePhase) => void;
  setError: (msg: string) => void;
  reset: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  phase: "idle",
  version: null,
  notes: null,
  progress: 0,
  error: null,
  setAvailable: (version, notes) => set({ phase: "available", version, notes }),
  setProgress: (progress) => set({ progress }),
  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ phase: "error", error }),
  reset: () => set({ phase: "idle", version: null, notes: null, progress: 0, error: null }),
}));

// Module-level ref to the Update object returned by check().
// Not stored in Zustand (non-serialisable class instance).
let _pendingUpdate: Update | null = null;
export function setPendingUpdate(u: Update | null) { _pendingUpdate = u; }
export function getPendingUpdate() { return _pendingUpdate; }
