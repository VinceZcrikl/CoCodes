import { create } from "zustand";

interface McpState {
  open: boolean;
  everOpened: boolean;
  toggle: () => void;
  close: () => void;
}

export const useMcpStore = create<McpState>((set) => ({
  open: false,
  everOpened: false,
  toggle: () => set((s) => ({ open: !s.open, everOpened: s.everOpened || !s.open })),
  close: () => set({ open: false }),
}));
