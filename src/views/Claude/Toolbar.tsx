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
  LayoutGrid,
} from "lucide-react";
import { useShellStore } from "../../state/shellStore";
import { useDeckStore } from "../../state/deckStore";
import { useGitStore } from "../../state/gitStore";
import { useMcpStore } from "../../state/mcpStore";
import { useDirectoryStore, dirBasename } from "../../state/directoryStore";
import { useSidebarStore } from "../../state/sidebarStore";
import { useActiveTerminalStore } from "../../state/activeTerminalStore";
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
  const { cwd } = useDirectoryStore();
  const shellOpen = useShellStore((s) => s.open);
  const toggleShell = useShellStore((s) => s.toggle);
  const mcpOpen = useMcpStore((s) => s.open);
  const toggleMcp = useMcpStore((s) => s.toggle);
  const deckOpen = useDeckStore((s) => s.open);
  const toggleDeck = useDeckStore((s) => s.toggle);
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const gitOpen = useGitStore((s) => s.open);
  const toggleGit = useGitStore((s) => s.toggle);
  const closeGit = useGitStore((s) => s.close);
  const changeDir = useActiveTerminalStore((s) => s.changeDir);
  const insertPath = useActiveTerminalStore((s) => s.insertPath);
  const branch = useBranch();

  // Showing the sidebar moves Git into its tab, so close the floating panel to
  // avoid two Git surfaces at once.
  const handleToggleSidebar = useCallback(() => {
    if (sidebarCollapsed) closeGit();
    toggleSidebar();
  }, [sidebarCollapsed, closeGit, toggleSidebar]);
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

  const handleCommand = useCallback(
    (cmd: string, submit: boolean) => onCommand?.(cmd, submit),
    [onCommand],
  );

  // Dropdown (collapsed-sidebar file finder) handlers: delegate to the shared
  // active-terminal store, then close the dropdown. `changeDir`/`insertPath`
  // themselves (store) handle cwd + `/cd` sync and path insertion.
  const pickPath = useCallback(
    (abs: string) => { insertPath(abs); setDropOpen(false); },
    [insertPath],
  );
  const pickDir = useCallback(
    (dir: string) => { changeDir(dir); setDropOpen(false); },
    [changeDir],
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
        {/* ── Group 1: context anchor (R6) — working directory + sidebar ──
            The dir picker + Git chip only appear when the sidebar is COLLAPSED;
            when it's open, both live in the sidebar's Explore / Git tabs, so
            showing them here too would duplicate the entry point. Clicking
            either while collapsed expands the sidebar onto its tab. */}
        <div className="cli-tool-group">
          {sidebarCollapsed && (
            <>
              {/* Directory picker — quick browse dropdown; the chevron opens an
                  inline finder without expanding the sidebar. */}
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
                    onInsertPath={pickPath}
                    onSetCwd={pickDir}
                    onClose={() => setDropOpen(false)}
                  />
                )}
              </div>

              {/* Git branch chip — toggles the floating Git panel (the sidebar
                  is collapsed here, so Git has nowhere else to live). Rendered
                  ALWAYS: in a repo it shows branch + dirty/ahead/behind; outside
                  one it degrades to a plain "Git" chip (opens the panel to init). */}
              <Tooltip
                label={
                  gitOpen
                    ? "Hide Git panel"
                    : branch
                      ? branch.dirty
                        ? `On ${branch.branch} · uncommitted changes — open Git`
                        : `On ${branch.branch} — open Git`
                      : "Open the Git panel"
                }
              >
                <button
                  type="button"
                  data-panel-toggle="git"
                  className={`cli-status-chip${gitOpen ? " active" : ""}`}
                  onClick={toggleGit}
                  aria-pressed={gitOpen}
                  aria-label={
                    branch
                      ? `${gitOpen ? "Hide" : "Open"} Git panel — branch ${branch.branch}${branch.dirty ? ", uncommitted changes" : ""}`
                      : `${gitOpen ? "Hide" : "Open"} Git panel`
                  }
                >
                  <GitBranch size={12} strokeWidth={1.75} />
                  {branch ? (
                    <>
                      <span className="cli-status-branch">{branch.branch}</span>
                      {branch.dirty && <span className="cli-status-dirty" aria-hidden="true" />}
                      {branch.ahead > 0 && <span className="cli-status-count">↑{branch.ahead}</span>}
                      {branch.behind > 0 && <span className="cli-status-count">↓{branch.behind}</span>}
                    </>
                  ) : (
                    <span className="cli-status-branch">Git</span>
                  )}
                </button>
              </Tooltip>
            </>
          )}

          <Tooltip label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}>
            <button
              type="button"
              className="cli-tool-btn"
              onClick={handleToggleSidebar}
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

        {/* ── Group 3: panels (R3 labelled) — shell · mcp ──
            Git has no button here: the right-side branch chip is the single
            Git entry point (it toggles the panel), so a second GitBranch
            button would be redundant. */}
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

      {/* ── Right: session deck + app version (Git status lives beside the dir picker) ── */}
      <div className="cli-toolbar-right">
        <Tooltip label={deckOpen ? "Hide session deck" : "Session deck — all terminals at a glance"}>
          <button
            type="button"
            data-panel-toggle="deck"
            className={`cli-tool-btn labelled${deckOpen ? " active" : ""}`}
            onClick={toggleDeck}
            aria-label={deckOpen ? "Hide session deck" : "Session deck"}
            aria-pressed={deckOpen}
          >
            <LayoutGrid size={15} strokeWidth={1.75} />
            <span className="cli-tool-label">Deck</span>
          </button>
        </Tooltip>
        {version && (
          <span className="cli-status-model" title={`CoCodes v${version}`}>
            CoCodes v{version}
          </span>
        )}
      </div>
    </div>
  );
}
