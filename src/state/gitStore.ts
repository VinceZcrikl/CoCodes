import { create } from "zustand";

/** State for the floating Git window — a read-only source-control inspector
 *  that floats over the active panel (same pattern as the shell window). Not
 *  persisted: it's a transient glance surface, reopened fresh each session. */
interface GitState {
  open: boolean;
  maximized: boolean;
  everOpened: boolean;
  toggle: () => void;
  close: () => void;
  toggleMax: () => void;
}

export const useGitStore = create<GitState>((set) => ({
  open: false,
  maximized: false,
  everOpened: false,
  toggle: () =>
    set((s) => ({ open: !s.open, everOpened: s.everOpened || !s.open })),
  close: () => set({ open: false }),
  toggleMax: () => set((s) => ({ maximized: !s.maximized })),
}));
