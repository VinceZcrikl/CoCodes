import { create } from "zustand";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

/** Full vs. mini panel geometry. Mini is a compact, always-on-top floating
 *  panel (orb-style); full is the normal cockpit. */
const FULL = { width: 1180, height: 760 };
const MINI = { width: 460, height: 380 };

const MINI_KEY = "cocodes:mini";

function readMini(): boolean {
  try { return localStorage.getItem(MINI_KEY) === "1"; } catch { return false; }
}

function persistMini(v: boolean) {
  try { localStorage.setItem(MINI_KEY, v ? "1" : "0"); } catch {}
}

interface WindowState {
  mini: boolean;
  setMini: (v: boolean) => void;
  toggleMini: () => void;
}

async function applyGeometry(mini: boolean) {
  // Block terminal resizes that fire from CSS layout changes (sidebar hide/show)
  // before the window has actually reached its new size. Without this, the
  // 140ms settle fires against the intermediate layout and sends the PTY a wrong
  // cols/rows, garbling the TUI. The matching 'terminus:refit' in the finally
  // block lets terminals measure once the Tauri resize is confirmed.
  window.dispatchEvent(new Event("terminus:geometry-start"));
  try {
    const w = getCurrentWindow();
    const size = mini ? MINI : FULL;
    await w.setSize(new LogicalSize(size.width, size.height));
    await w.setAlwaysOnTop(mini);
  } catch (e) {
    console.error("window geometry change failed", e);
  } finally {
    window.dispatchEvent(new Event("terminus:refit"));
  }
}

const initialMini = readMini();

export const useWindowStore = create<WindowState>((set, get) => ({
  mini: initialMini,
  setMini: (v) => {
    set({ mini: v });
    persistMini(v);
    void applyGeometry(v);
  },
  toggleMini: () => get().setMini(!get().mini),
}));

// tauri-plugin-window-state restores position and size, but not alwaysOnTop.
// If the user last closed in mini mode, reapply the geometry so alwaysOnTop
// is reinstated and the size is confirmed.
if (initialMini) {
  void applyGeometry(true);
}
