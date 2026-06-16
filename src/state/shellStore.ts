import { create } from "zustand";

/** State for the floating shell window. The window is opened from the toolbar's
 *  `>_` button and floats over the active panel without replacing the CLI
 *  terminal. `everOpened` gates first mount (so no shell PTY spawns until the
 *  user asks for one); after that the window is kept mounted and only hidden, so
 *  its scrollback and live shell process — the history — survive close/reopen.
 *  Not persisted: a shell process can't outlive the app, so reopening after a
 *  relaunch starts fresh. */
interface ShellState {
  /** Whether the floating shell window is currently visible. */
  open: boolean;
  /** Maximized (fills the panel) vs the default small floating size. */
  maximized: boolean;
  /** True once the window has been opened at least once this session. */
  everOpened: boolean;
  /** A shell command to run automatically on next open (consumed once). */
  pendingCmd: string | null;
  toggle: () => void;
  close: () => void;
  toggleMax: () => void;
  /** Open the shell overlay and queue a command to run when the shell is ready. */
  openWithCmd: (cmd: string) => void;
  clearPendingCmd: () => void;
}

export const useShellStore = create<ShellState>((set) => ({
  open: false,
  maximized: false,
  everOpened: false,
  pendingCmd: null,
  toggle: () =>
    set((s) => ({ open: !s.open, everOpened: s.everOpened || !s.open })),
  close: () => set({ open: false }),
  toggleMax: () => set((s) => ({ maximized: !s.maximized })),
  openWithCmd: (cmd) => set({ open: true, everOpened: true, pendingCmd: cmd }),
  clearPendingCmd: () => set({ pendingCmd: null }),
}));
