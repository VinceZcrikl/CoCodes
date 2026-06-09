import { create } from "zustand";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

/** Full vs. mini panel geometry. Mini is a compact, always-on-top floating
 *  panel (orb-style); full is the normal cockpit. */
const FULL = { width: 1180, height: 760 };
const MINI = { width: 460, height: 380 };

interface WindowState {
  mini: boolean;
  setMini: (v: boolean) => void;
  toggleMini: () => void;
}

async function applyGeometry(mini: boolean) {
  try {
    const w = getCurrentWindow();
    const size = mini ? MINI : FULL;
    await w.setResizable(!mini);
    await w.setSize(new LogicalSize(size.width, size.height));
    await w.setAlwaysOnTop(mini);
  } catch (e) {
    console.error("window geometry change failed", e);
  }
}

export const useWindowStore = create<WindowState>((set, get) => ({
  mini: false,
  setMini: (v) => {
    set({ mini: v });
    void applyGeometry(v);
  },
  toggleMini: () => get().setMini(!get().mini),
}));
