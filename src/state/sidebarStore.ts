import { create } from "zustand";

/** Whether the left session sidebar is collapsed. Shared between the toolbar
 *  toggle and the sidebar itself, and persisted so it reopens the same way. */
const KEY = "theoi:sidebar-collapsed";

function loadInitial(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  collapsed: loadInitial(),
  setCollapsed: (v) => {
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* private mode — ignore */
    }
    set({ collapsed: v });
  },
  toggle: () => get().setCollapsed(!get().collapsed),
}));
