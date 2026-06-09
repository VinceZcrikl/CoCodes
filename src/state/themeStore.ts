import { create } from "zustand";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ORB_THEMES,
  ORB_THEME_ORDER,
  type OrbThemeName,
} from "./orbThemes";

const STORAGE_KEY = "openterminus:theme";
const THEME_EVENT = "theme:changed";
const DEFAULT_THEME: OrbThemeName = "black-gold";

function loadInitial(): OrbThemeName {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  const saved = localStorage.getItem(STORAGE_KEY) as OrbThemeName | null;
  return saved && saved in ORB_THEMES ? saved : DEFAULT_THEME;
}

interface ThemeState {
  name: OrbThemeName;
  /** Set the theme. `broadcast=true` (default) also emits a Tauri event so
   *  other windows (orb / chat) re-theme in sync. Set false inside the
   *  listener to avoid an infinite re-broadcast loop. */
  setTheme: (name: OrbThemeName, broadcast?: boolean) => void;
  cycleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  name: loadInitial(),
  setTheme: (name, broadcast = true) => {
    if (get().name === name) return;
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // localStorage might be unavailable (private mode); ignore.
    }
    set({ name });
    if (broadcast) {
      void emit(THEME_EVENT, name);
    }
  },
  cycleTheme: () => {
    const current = get().name;
    const idx = ORB_THEME_ORDER.indexOf(current);
    const next =
      ORB_THEME_ORDER[(idx + 1) % ORB_THEME_ORDER.length] ?? DEFAULT_THEME;
    get().setTheme(next, true);
  },
}));

/**
 * Subscribe this window to cross-window theme changes. Call once per
 * mounted React tree (orb window, chat window). Returns an async cleanup
 * function safe to call in a `useEffect` return.
 */
export function installThemeSync(): () => void {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  void listen<OrbThemeName>(THEME_EVENT, (event) => {
    if (cancelled) return;
    const payload = event.payload;
    if (payload && payload in ORB_THEMES) {
      // broadcast=false so the listener doesn't echo back into a loop.
      useThemeStore.getState().setTheme(payload, false);
    }
  }).then((fn) => {
    if (cancelled) {
      void fn();
    } else {
      unlisten = fn;
    }
  });
  return () => {
    cancelled = true;
    if (unlisten) {
      const fn = unlisten;
      unlisten = null;
      void fn();
    }
  };
}
