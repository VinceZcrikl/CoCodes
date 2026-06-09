import { Camera } from "lucide-react";

interface Props {
  onScreenshot: () => void;
  busy?: boolean;
}

/**
 * Thin one-row tool strip below the terminal. The terminal itself takes
 * keyboard input directly (terminal-native), so there's no composer here — just
 * a row reserved for tools. Screenshot sits bottom-left; more tools (voice,
 * MCP, skills) join it in later phases.
 */
export default function Toolbar({ onScreenshot, busy }: Props) {
  return (
    <div className="cli-toolbar">
      <div className="cli-toolbar-left">
        <button
          type="button"
          className="cli-tool-btn"
          onClick={onScreenshot}
          disabled={busy}
          title="Screenshot — drag a region or press space for a window"
          aria-label="Screenshot"
        >
          <Camera size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div className="cli-toolbar-right" />
    </div>
  );
}
