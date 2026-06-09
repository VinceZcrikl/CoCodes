import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./styles.css";

// Tag <html> with the window label so CSS can scope per-window overrides (e.g.
// the screenshot overlay must stay transparent, not use the cockpit canvas).
document.documentElement.classList.add(`window-${getCurrentWindow().label}`);

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
