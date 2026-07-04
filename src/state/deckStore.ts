import { create } from "zustand";

const HEIGHT_KEY = "cocodes:deck-docked-height";

export const DECK_MIN_HEIGHT = 160;
export const DECK_MAX_HEIGHT = 640;
const DECK_DEFAULT_HEIGHT = 300;

function clampHeight(h: number): number {
  return Math.min(DECK_MAX_HEIGHT, Math.max(DECK_MIN_HEIGHT, Math.round(h)));
}

function loadHeight(): number {
  if (typeof localStorage === "undefined") return DECK_DEFAULT_HEIGHT;
  const raw = Number(localStorage.getItem(HEIGHT_KEY));
  return raw ? clampHeight(raw) : DECK_DEFAULT_HEIGHT;
}

/** Session Deck — a task-card overview of the current session's panes, opened
 *  from the toolbar. Besides open/close it carries the pane the deck is
 *  currently hovering, so the matching pane border can spotlight (mirrors how
 *  `runningPaneIds` toggles the `.running` class). */
interface DeckState {
  open: boolean;
  everOpened: boolean;
  /** Docked: tiled as a full-width band below the terminals (spanning all panes,
   *  not the sidebar), reserving its own row. False = the mini floating panel. */
  docked: boolean;
  /** Height (px) of the docked band; drag its top border to resize. Persisted. */
  dockedHeight: number;
  /** paneId currently hovered in the deck → that pane spotlights. null = none. */
  hoveredPaneId: string | null;
  toggle: () => void;
  close: () => void;
  toggleDocked: () => void;
  setDockedHeight: (h: number) => void;
  setHovered: (paneId: string | null) => void;
}

export const useDeckStore = create<DeckState>((set) => ({
  open: false,
  everOpened: false,
  docked: false,
  dockedHeight: loadHeight(),
  hoveredPaneId: null,
  toggle: () => set((s) => ({ open: !s.open, everOpened: s.everOpened || !s.open })),
  close: () => set({ open: false, hoveredPaneId: null }),
  toggleDocked: () => set((s) => ({ docked: !s.docked })),
  setDockedHeight: (h) => {
    const clamped = clampHeight(h);
    try {
      localStorage.setItem(HEIGHT_KEY, String(clamped));
    } catch {
      /* private mode — ignore */
    }
    set({ dockedHeight: clamped });
  },
  setHovered: (paneId) => set({ hoveredPaneId: paneId }),
}));
