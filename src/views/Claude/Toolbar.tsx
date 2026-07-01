import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  Camera,
  FolderOpen,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Terminal,
  GitBranch,
} from "lucide-react";
import { useShellStore } from "../../state/shellStore";
import { useGitStore } from "../../state/gitStore";
import { useMcpStore } from "../../state/mcpStore";
import { useDirectoryStore, dirBasename } from "../../state/directoryStore";
import { useSidebarStore } from "../../state/sidebarStore";
import { useBranch } from "../../hooks/useBranch";
import Tooltip from "../../components/Tooltip";
import CommandPalette from "./CommandPalette";
import FileFinder from "./FileFinder";

interface Props {
  onScreenshot: () => void;
  onCwdChange?: (cwd: string | null) => void;
  onCommand?: (cmd: string, submit: boolean) => void;
  busy?: boolean;
  /** "claude" | "codex" | "grok" — hides Claude-specific controls for other CLIs. */
  cli?: string;
  /** Kept for call-site compatibility; the status strip now shows the app
   *  version instead of the model. */
  modelLabel?: string;
}

export default function Toolbar({ onScreenshot, onCommand, busy, cli = "claude" }: Props) {
  const { cwd, setCwd } = useDirectoryStore();
  const shellOpen = useShellStore((s) => s.open);
  const toggleShell = useShellStore((s) => s.toggle);
  const gitOpen = useGitStore((s) => s.open);
  const toggleGit = useGitStore((s) => s.toggle);
  const mcpOpen = useMcpStore((s) => s.open);
  const toggleMcp = useMcpStore((s) => s.toggle);
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const branch = useBranch();
  const [version, setVersion] = useState<string | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // App version (from tauri.conf.json) — shown in the right status strip.
  useEffect(() => {
    void getVersion().then(setVersion).catch(() => {});
  }, []);

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
        {/* ── Group 1: context anchor (R6) — working directory + sidebar ── */}
        <div className="cli-tool-group">
          {/* Directory picker — the global context every command runs against,
              so it leads the toolbar as the context anchor. */}
          <div className="dir-picker" ref={dropRef}>
            <button
              type="button"
              className="dir-picker-btn"
              onClick={() => setDropOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={dropOpen}
              aria-label="Working directory — browse files"
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

          <Tooltip label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}>
            <button
              type="button"
              className="cli-tool-btn"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
              aria-pressed={sidebarCollapsed}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={15} strokeWidth={1.75} />
              ) : (
                <PanelLeftClose size={15} strokeWidth={1.75} />
              )}
            </button>
          </Tooltip>
        </div>

        <span className="cli-tool-sep" aria-hidden="true" />

        {/* ── Group 2: terminal input — slash commands (Claude only) ── */}
        {cli === "claude" && (
          <div className="cli-tool-group">
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
          </div>
        )}

        {cli === "claude" && <span className="cli-tool-sep" aria-hidden="true" />}

        {/* ── Group 3: panels (R3 labelled) — shell · git ── */}
        <div className="cli-tool-group">
          <Tooltip label={shellOpen ? "Hide shell" : "Open a shell over this panel"}>
            <button
              type="button"
              data-panel-toggle="shell"
              className={`cli-tool-btn labelled${shellOpen ? " active" : ""}`}
              onClick={toggleShell}
              aria-label={shellOpen ? "Hide shell" : "Open shell"}
              aria-pressed={shellOpen}
            >
              <Terminal size={15} strokeWidth={1.75} />
              <span className="cli-tool-label">Shell</span>
            </button>
          </Tooltip>

          <Tooltip label={gitOpen ? "Hide Git panel" : "Open the Git panel"}>
            <button
              type="button"
              data-panel-toggle="git"
              className={`cli-tool-btn labelled${gitOpen ? " active" : ""}`}
              onClick={toggleGit}
              aria-label={gitOpen ? "Hide Git panel" : "Git panel"}
              aria-pressed={gitOpen}
            >
              <GitBranch size={15} strokeWidth={1.75} />
              <span className="cli-tool-label">Git</span>
            </button>
          </Tooltip>

          <Tooltip label={mcpOpen ? "Hide MCP panel" : "Manage MCP servers"}>
            <button
              type="button"
              data-panel-toggle="mcp"
              className={`cli-tool-btn labelled${mcpOpen ? " active" : ""}`}
              onClick={toggleMcp}
              aria-label={mcpOpen ? "Hide MCP panel" : "MCP servers"}
              aria-pressed={mcpOpen}
            >
              <Plug size={15} strokeWidth={1.75} />
              <span className="cli-tool-label">MCP</span>
            </button>
          </Tooltip>
        </div>

        <span className="cli-tool-sep" aria-hidden="true" />

        {/* ── Group 4: one-shot action — screenshot ── */}
        <div className="cli-tool-group">
          <Tooltip label="Screenshot — drag a region or press Space for a window">
            <button
              type="button"
              className="cli-tool-btn"
              onClick={onScreenshot}
              disabled={busy}
              aria-label="Screenshot"
            >
              <Camera size={15} strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Right: read-only global status (R2) — branch + app version ── */}
      <div className="cli-toolbar-right">
        {branch && (
          <Tooltip
            label={
              branch.dirty
                ? `On ${branch.branch} · uncommitted changes`
                : `On ${branch.branch}`
            }
          >
            <button
              type="button"
              className="cli-status-chip"
              onClick={() => !gitOpen && toggleGit()}
              aria-label={`Branch ${branch.branch}${branch.dirty ? ", uncommitted changes" : ""}`}
            >
              <GitBranch size={12} strokeWidth={1.75} />
              <span className="cli-status-branch">{branch.branch}</span>
              {branch.dirty && <span className="cli-status-dirty" aria-hidden="true" />}
              {branch.ahead > 0 && <span className="cli-status-count">↑{branch.ahead}</span>}
              {branch.behind > 0 && <span className="cli-status-count">↓{branch.behind}</span>}
            </button>
          </Tooltip>
        )}
        {version && (
          <span className="cli-status-model" title={`CoCodes v${version}`}>
            CoCodes v{version}
          </span>
        )}
      </div>
    </div>
  );
}
