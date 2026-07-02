import { create } from "zustand";

/** Whether the left session sidebar is collapsed. Shared between the toolbar
 *  toggle and the sidebar itself, and persisted so it reopens the same way. */
const KEY = "cocodes:sidebar-collapsed";
const WIDTH_KEY = "cocodes:sidebar-width";

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 244;

function loadInitial(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

function clampWidth(w: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(w)));
}

function loadWidth(): number {
  if (typeof localStorage === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const raw = Number(localStorage.getItem(WIDTH_KEY));
  return raw ? clampWidth(raw) : SIDEBAR_DEFAULT_WIDTH;
}

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
  width: number;
  setWidth: (w: number) => void;
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
  width: loadWidth(),
  setWidth: (w) => {
    const clamped = clampWidth(w);
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      /* private mode — ignore */
    }
    set({ width: clamped });
  },
}));
