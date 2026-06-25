import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  FolderOpen,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  GitBranch,
} from "lucide-react";
import { useShellStore } from "../../state/shellStore";
import { useGitStore } from "../../state/gitStore";
import { useDirectoryStore, dirBasename } from "../../state/directoryStore";
import { useSidebarStore } from "../../state/sidebarStore";
import CommandPalette from "./CommandPalette";
import FileFinder from "./FileFinder";

interface Props {
  onScreenshot: () => void;
  onCwdChange?: (cwd: string | null) => void;
  onCommand?: (cmd: string, submit: boolean) => void;
  busy?: boolean;
  /** "claude" | "codex" | "grok" — hides Claude-specific controls for other CLIs. */
  cli?: string;
}

export default function Toolbar({ onScreenshot, onCommand, busy, cli = "claude" }: Props) {
  const { cwd, setCwd } = useDirectoryStore();
  const shellOpen = useShellStore((s) => s.open);
  const toggleShell = useShellStore((s) => s.toggle);
  const gitOpen = useGitStore((s) => s.open);
  const toggleGit = useGitStore((s) => s.toggle);
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const [dropOpen, setDropOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // Close the file finder on outside click.
  useEffect(() => {
    if (!dropOpen) return;
    const close = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [dropOpen]);

  // Paste a chosen file's path into the terminal (quote if it has spaces).
  const insertPath = useCallback(
    (abs: string) => {
      const p = abs.replace(/\\/g, "/");
      onCommand?.(/\s/.test(p) ? `"${p}"` : p, false);
      setDropOpen(false);
    },
    [onCommand],
  );

  const handleCommand = useCallback(
    (cmd: string, submit: boolean) => onCommand?.(cmd, submit),
    [onCommand],
  );

  const label = cwd ? dirBasename(cwd) : "Home";

  return (
    <div className="cli-toolbar">
      {/* Command palette panel — absolutely positioned above the toolbar */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onCommand={handleCommand}
      />

      <div className="cli-toolbar-left">
        {/* ── Sidebar toggle ── */}
        <button
          type="button"
          className="cli-tool-btn"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          aria-pressed={sidebarCollapsed}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={15} strokeWidth={1.75} />
          ) : (
            <PanelLeftClose size={15} strokeWidth={1.75} />
          )}
        </button>

        {/* ── Directory picker ── */}
        <div className="dir-picker" ref={dropRef}>
          <button
            type="button"
            className="dir-picker-btn"
            title={cwd ?? "Home directory — click to browse files"}
            onClick={() => setDropOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={dropOpen}
          >
            <FolderOpen size={12} strokeWidth={1.75} />
            <span className="dir-picker-label">{label}</span>
            <ChevronDown
              size={10}
              strokeWidth={2.2}
              className={`dir-picker-chevron${dropOpen ? " open" : ""}`}
            />
          </button>

          {dropOpen && (
            <FileFinder
              cwd={cwd}
              onInsertPath={insertPath}
              onSetCwd={(dir) => setCwd(dir)}
              onClose={() => setDropOpen(false)}
            />
          )}
        </div>

        {/* ── Slash command palette trigger (Claude only) ── */}
        {cli === "claude" && (
          <button
            type="button"
            data-panel-toggle="commands"
            className={`cmd-trigger${paletteOpen ? " open" : ""}`}
            onClick={() => setPaletteOpen((v) => !v)}
            aria-label="Open command palette"
            aria-expanded={paletteOpen}
            title="Slash commands"
          >
            <span className="cmd-trigger-slash">/</span>
            <span className="cmd-trigger-label">Commands</span>
            <ChevronDown
              size={10}
              strokeWidth={2.2}
              className={`cmd-trigger-chevron${paletteOpen ? " open" : ""}`}
            />
          </button>
        )}

        {/* ── Screenshot ── */}
        <button
          type="button"
          className="cli-tool-btn"
          onClick={onScreenshot}
          disabled={busy}
          title="Screenshot — drag a region or press Space for a window"
          aria-label="Screenshot"
        >
          <Camera size={15} strokeWidth={1.75} />
        </button>

        {/* ── Shell toggle ── opens a floating shell window over the panel
            (does not replace the CLI terminal); active while it's showing. */}
        <button
          type="button"
          data-panel-toggle="shell"
          className={`cli-tool-btn${shellOpen ? " active" : ""}`}
          onClick={toggleShell}
          title={shellOpen ? "Hide shell" : "Open shell"}
          aria-label={shellOpen ? "Hide shell" : "Open shell"}
          aria-pressed={shellOpen}
        >
          <Terminal size={15} strokeWidth={1.75} />
        </button>

        {/* ── Git panel toggle ── floating read-only source-control window. */}
        <button
          type="button"
          data-panel-toggle="git"
          className={`cli-tool-btn${gitOpen ? " active" : ""}`}
          onClick={toggleGit}
          title={gitOpen ? "Hide Git panel" : "Git panel"}
          aria-label={gitOpen ? "Hide Git panel" : "Git panel"}
          aria-pressed={gitOpen}
        >
          <GitBranch size={15} strokeWidth={1.75} />
        </button>
      </div>

      <div className="cli-toolbar-right" />
    </div>
  );
}
