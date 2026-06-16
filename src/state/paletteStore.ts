import { create } from "zustand";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  PANEL_PALETTES,
  PANEL_ACCENTS,
  DEFAULT_PANEL_PALETTE,
  DEFAULT_ACCENT,
  type PanelPaletteName,
  type AccentName,
} from "./panelPalettes";

const STORAGE_KEY = "theoi:palette";
const PALETTE_EVENT = "palette:changed";
/** One-shot flag: the namesake Theoi · Olympus theme is force-activated once so
 *  existing installs adopt the new default (later picks then stick normally). */
const DEFAULT_THEME_KEY = "theoi:default-olympus";

interface Persisted {
  name: PanelPaletteName;
  accent: AccentName;
}

/** Parse whatever is persisted (or the default) — no seasonal logic. */
function readPersisted(): Persisted {
  const fallback: Persisted = { name: DEFAULT_PANEL_PALETTE, accent: DEFAULT_ACCENT };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    // Back-compat: the original schema stored just the palette name string.
    if (raw[0] !== "{") {
      return raw in PANEL_PALETTES
        ? { name: raw as PanelPaletteName, accent: DEFAULT_ACCENT }
        : fallback;
    }
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      name: p.name && p.name in PANEL_PALETTES ? p.name : DEFAULT_PANEL_PALETTE,
      accent: p.accent && p.accent in PANEL_ACCENTS ? p.accent : DEFAULT_ACCENT,
    };
  } catch {
    return fallback;
  }
}

function loadInitial(): Persisted {
  const persisted = readPersisted();
  if (typeof localStorage === "undefined") return persisted;
  // One-time default activation: switch existing users onto the namesake
  // Theoi · Olympus theme once, on the first launch after this update. Their
  // accent is preserved and the new choice is persisted, so every later palette
  // they pick sticks normally — this never runs again.
  try {
    if (!localStorage.getItem(DEFAULT_THEME_KEY)) {
      localStorage.setItem(DEFAULT_THEME_KEY, "1");
      const initial: Persisted = { name: "theoi", accent: persisted.accent };
      persist(initial.name, initial.accent);
      return initial;
    }
  } catch {
    // localStorage may be unavailable (private mode); fall through.
  }
  return persisted;
}

function persist(name: PanelPaletteName, accent: AccentName) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, accent }));
  } catch {
    // localStorage might be unavailable (private mode); ignore.
  }
}

interface PaletteState {
  /** Base palette (surfaces + neutral text). */
  name: PanelPaletteName;
  /** Accent ("点缀") — "auto" follows the base palette's own accent. */
  accent: AccentName;
  /** `broadcast=true` (default) emits a Tauri event so other windows re-skin in
   *  sync; set false inside the listener to avoid a re-broadcast loop. */
  setPalette: (name: PanelPaletteName, broadcast?: boolean) => void;
  setAccent: (accent: AccentName, broadcast?: boolean) => void;
}

export const usePaletteStore = create<PaletteState>((set, get) => {
  const init = loadInitial();
  return {
    name: init.name,
    accent: init.accent,
    setPalette: (name, broadcast = true) => {
      if (get().name === name) return;
      set({ name });
      persist(name, get().accent);
      if (broadcast) void emit(PALETTE_EVENT, { name, accent: get().accent });
    },
    setAccent: (accent, broadcast = true) => {
      if (get().accent === accent) return;
      set({ accent });
      persist(get().name, accent);
      if (broadcast) void emit(PALETTE_EVENT, { name: get().name, accent });
    },
  };
});

/**
 * Subscribe this window to cross-window palette changes. Call once per mounted
 * React tree. Returns an async cleanup function safe to call in a `useEffect`
 * return.
 */
export function installPaletteSync(): () => void {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  void listen<Persisted>(PALETTE_EVENT, (event) => {
    if (cancelled) return;
    const { name, accent } = event.payload ?? {};
    const st = usePaletteStore.getState();
    // broadcast=false so the listener doesn't echo back into a loop.
    if (name && name in PANEL_PALETTES && name !== st.name) st.setPalette(name, false);
    if (accent && accent in PANEL_ACCENTS && accent !== st.accent) st.setAccent(accent, false);
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
