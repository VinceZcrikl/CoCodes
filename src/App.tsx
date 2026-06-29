import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Cockpit from "./views/Cockpit/Cockpit";
import ScreenshotOverlay from "./views/Screenshot/ScreenshotOverlay";

/** Dismiss the inline splash screen from index.html after React's first paint. */
function useDismissSplash() {
  useEffect(() => {
    const el = document.getElementById("splash");
    if (!el) return;
    el.classList.add("out");
    const t = window.setTimeout(() => el.remove(), 350);
    return () => window.clearTimeout(t);
  }, []);
}

/**
 * Thin window-label router. Each Tauri window mounts the same bundle but renders
 * a different root: the main cockpit, or the transparent screenshot overlay.
 */
export default function App() {
  useDismissSplash();
  const label = getCurrentWindow().label;
  if (label === "screenshot-overlay") return <ScreenshotOverlay />;
  return <Cockpit />;
}
