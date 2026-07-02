import { create } from "zustand";

/** Which section the left sidebar shows: the session list, the file explorer,
 *  or the Git panel. Persisted so the sidebar reopens on the same tab, and
 *  shared across every (persona, CLI) tab so the choice is global. */
export type SidebarTab = "session" | "explore" | "git";

const KEY = "cocodes:sidebar-tab";

function loadInitial(): SidebarTab {
  if (typeof localStorage === "undefined") return "session";
  const v = localStorage.getItem(KEY);
  return v === "explore" || v === "git" ? v : "session";
}

interface SidebarTabState {
  tab: SidebarTab;
  setTab: (t: SidebarTab) => void;
}

export const useSidebarTabStore = create<SidebarTabState>((set) => ({
  tab: loadInitial(),
  setTab: (t) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode — ignore */
    }
    set({ tab: t });
  },
}));
