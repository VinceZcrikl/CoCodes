import { getCurrentWindow } from "@tauri-apps/api/window";
import Cockpit from "./views/Cockpit/Cockpit";
import ScreenshotOverlay from "./views/Screenshot/ScreenshotOverlay";

/**
 * Thin window-label router. Each Tauri window mounts the same bundle but renders
 * a different root: the main cockpit, or the transparent screenshot overlay.
 */
export default function App() {
  const label = getCurrentWindow().label;
  if (label === "screenshot-overlay") return <ScreenshotOverlay />;
  return <Cockpit />;
}
