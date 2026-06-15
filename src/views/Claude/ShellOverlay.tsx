import { useState } from "react";
import { Terminal as TerminalIcon, Maximize2, Minimize2, RotateCw, X } from "lucide-react";
import ClaudeTerminal from "./ClaudeTerminal";
import { useDirectoryStore } from "../../state/directoryStore";

/** Stable key for the single global shell PTY. Kept constant so the backend
 *  reconnects to the still-running shell (replaying its buffer) across hide /
 *  show and view remounts — that's what preserves the session's history. */
const SHELL_TERMINAL_KEY = "shell-overlay-global";
/** Stable, persona-independent id for the global shell. The backend ignores it
 *  for cli === "shell", and keeping it constant means switching persona never
 *  remounts the terminal — so the live xterm and full scrollback survive. */
const SHELL_PROFILE_ID = "__shell__";

interface Props {
  /** Visible vs hidden. The component stays mounted while hidden so the shell
   *  process and scrollback persist — closing is really a minimize. */
  open: boolean;
  /** Maximized fills the panel; otherwise a small floating window. */
  maximized: boolean;
  onToggleMax: () => void;
  onClose: () => void;
}

/** A floating, themed shell window that hovers above the active panel without
 *  replacing the CLI terminal. Maximize / restore / close live in its title
 *  bar; the embedded PTY is kept alive so history survives close + reopen. */
export default function ShellOverlay({ open, maximized, onToggleMax, onClose }: Props) {
  const cwd = useDirectoryStore((s) => s.cwd);
  // Bumped to respawn a fresh shell after the previous one exits (`exit`/Ctrl-D).
  const [reloadKey, setReloadKey] = useState(0);
  const [exited, setExited] = useState(false);

  const restart = () => {
    setExited(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <div
      className={`shell-overlay${maximized ? " max" : ""}`}
      style={{ display: open ? "flex" : "none" }}
      role="dialog"
      aria-label="Shell"
    >
      <header className="shell-overlay-bar">
        <span className="shell-overlay-title">
          <TerminalIcon size={13} strokeWidth={1.9} />
          <span>Shell</span>
        </span>
        <div className="shell-overlay-actions">
          {exited && (
            <button
              type="button"
              className="shell-overlay-btn"
              onClick={restart}
              title="Restart shell"
              aria-label="Restart shell"
            >
              <RotateCw size={13} strokeWidth={1.9} />
            </button>
          )}
          <button
            type="button"
            className="shell-overlay-btn"
            onClick={onToggleMax}
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? <Minimize2 size={13} strokeWidth={1.9} /> : <Maximize2 size={13} strokeWidth={1.9} />}
          </button>
          <button
            type="button"
            className="shell-overlay-btn shell-overlay-close"
            onClick={onClose}
            title="Close"
            aria-label="Close shell"
          >
            <X size={14} strokeWidth={1.9} />
          </button>
        </div>
      </header>
      <div className="shell-overlay-body">
        <ClaudeTerminal
          key={reloadKey}
          profileId={SHELL_PROFILE_ID}
          cli="shell"
          terminalKey={SHELL_TERMINAL_KEY}
          cwd={cwd ?? null}
          onExit={() => setExited(true)}
        />
      </div>
    </div>
  );
}
