import { create } from "zustand";

/** A session waiting on the user's authorization (a CLI permission prompt). The
 *  cockpit surfaces these as a tray notification + an in-app banner; clicking
 *  one jumps to the waiting pane. Multiple pending prompts are kept in arrival
 *  order so the user can work through them one by one. */
export interface AttentionItem {
  /** Backend terminal key (`"<paneId>:<convId>"`) — resolves the pane via the
   *  terminal registry. */
  id: string;
  cli: string;
  /** Persona name for display (resolved when enqueued; falls back to cli). */
  label: string;
  message: string;
  ts: number;
}

interface AttentionState {
  queue: AttentionItem[];
  /** Enqueue (or refresh) a pending prompt; dedupes by id, keeping arrival
   *  order. */
  push: (item: AttentionItem) => void;
  /** Remove a resolved/visited prompt. */
  resolve: (id: string) => void;
  clear: () => void;
}

export const useAttentionStore = create<AttentionState>((set) => ({
  queue: [],
  push: (item) =>
    set((s) => {
      const rest = s.queue.filter((q) => q.id !== item.id);
      return { queue: [...rest, item] };
    }),
  resolve: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
  clear: () => set({ queue: [] }),
}));
