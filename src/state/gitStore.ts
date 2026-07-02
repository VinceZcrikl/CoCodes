import { create } from "zustand";

/** Floating Git panel state — used ONLY when the sidebar is collapsed (with the
 *  sidebar open, Git lives in its sidebar tab instead). The toolbar's git chip
 *  toggles this overlay; not persisted (a transient glance surface). */
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
