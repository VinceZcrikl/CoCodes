import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  FolderOpen,
  ChevronDown,
  Home,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  GitBranch,
} from "lucide-react";
import { useShellStore } from "../../state/shellStore";
import { useGitStore } from "../../state/gitStore";
import { invoke } from "@tauri-apps/api/core";
import { useDirectoryStore, dirBasename } from "../../state/directoryStore";
import { useSidebarStore } from "../../state/sidebarStore";
import CommandPalette from "./CommandPalette";

interface Props {
  onScreenshot: () => void;
  onCwdChange?: (cwd: string | null) => void;
  onCommand?: (cmd: string, submit: boolean) => void;
  busy?: boolean;
  /** "claude" | "codex" | "grok" — hides Claude-specific controls for other CLIs. */
  cli?: string;
}

export default function Toolbar({ onScreenshot, onCwdChange, onCommand, busy, cli = "claude" }: Props) {
  const { cwd, recent, setCwd } = useDirectoryStore();
  const shellOpen = useShellStore((s) => s.open);
  const toggleShell = useShellStore((s) => s.toggle);
  const gitOpen = useGitStore((s) => s.open);
  const toggleGit = useGitStore((s) => s.toggle);
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const [dropOpen, setDropOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // Close directory dropdown on outside click.
  useEffect(() => {
    if (!dropOpen) return;
    const close = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [dropOpen]);

  const openPicker = useCallback(async () => {
    setDropOpen(false);
    setPicking(true);
    try {
      const dir = await invoke<string | null>("pick_directory");
      if (dir) {
        setCwd(dir);
        onCwdChange?.(dir);
      }
    } finally {
      setPicking(false);
    }
  }, [setCwd, onCwdChange]);

  const selectRecent = useCallback(
    (path: string | null) => {
      setCwd(path);
      onCwdChange?.(path);
      setDropOpen(false);
    },
    [setCwd, onCwdChange],
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
            title={cwd ?? "Home directory (click to change)"}
            onClick={() => setDropOpen((v) => !v)}
            disabled={picking}
            aria-haspopup="listbox"
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
            <div className="dir-picker-drop" role="listbox">
              <button
                type="button"
                className="dir-picker-item dir-picker-browse"
                onClick={() => void openPicker()}
              >
                <FolderOpen size={12} strokeWidth={1.75} />
                <span>Browse…</span>
              </button>

              {recent.length > 0 && (
                <>
                  <div className="dir-picker-sep" />
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="option"
                      aria-selected={r === cwd}
                      className={`dir-picker-item${r === cwd ? " active" : ""}`}
                      title={r}
                      onClick={() => selectRecent(r)}
                    >
                      <Clock size={11} strokeWidth={1.75} />
                      <span className="dir-picker-item-label">{dirBasename(r)}</span>
                    </button>
                  ))}
                  <div className="dir-picker-sep" />
                </>
              )}

              <button
                type="button"
                role="option"
                aria-selected={cwd === null}
                className={`dir-picker-item${cwd === null ? " active" : ""}`}
                onClick={() => selectRecent(null)}
              >
                <Home size={12} strokeWidth={1.75} />
                <span>Home directory</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Slash command palette trigger (Claude only) ── */}
        {cli === "claude" && (
          <button
            type="button"
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
