import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minimize2, Maximize2, Minus, X } from "lucide-react";
import { useWindowStore } from "../../state/windowStore";

/** Frameless-window controls: collapse to a mini panel (or expand back),
 *  minimize the OS window, and close. Mirrors orb's top-right window buttons. */
export default function WindowControls() {
  const mini = useWindowStore((s) => s.mini);
  const setMini = useWindowStore((s) => s.setMini);

  const onMinimize = () => {
    void getCurrentWindow().minimize();
  };

  const onClose = () => {
    void getCurrentWindow().close();
  };

  return (
    <div className="win-ctl-group">
      <button
        type="button"
        className="win-ctl"
        onClick={() => setMini(!mini)}
        title={mini ? "Expand" : "Collapse to mini panel"}
        aria-label={mini ? "Expand window" : "Collapse to mini panel"}
      >
        {mini ? (
          <Maximize2 size={13} strokeWidth={2} />
        ) : (
          <Minimize2 size={13} strokeWidth={2} />
        )}
      </button>
      <button
        type="button"
        className="win-ctl"
        onClick={onMinimize}
        title="Minimize"
        aria-label="Minimize window"
      >
        <Minus size={15} strokeWidth={2.25} />
      </button>
      <button
        type="button"
        className="win-ctl close"
        onClick={onClose}
        title="Close"
        aria-label="Close window"
      >
        <X size={15} strokeWidth={2.25} />
      </button>
    </div>
  );
}
