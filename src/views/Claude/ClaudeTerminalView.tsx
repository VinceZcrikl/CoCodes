import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Copy, Check, RefreshCw } from "lucide-react";
import Toolbar from "./Toolbar";
import { type ClaudeTerminalHandle } from "./ClaudeTerminal";
import PaneLayout from "./PaneLayout";
import type { ClaudeSession, LayoutNode } from "../../hooks/useClaudeSessions";
import { useDirectoryStore } from "../../state/directoryStore";
import { useWindowStore } from "../../state/windowStore";

const CLI_META: Record<string, { title: string; installCmd: string | null; installHint: string }> = {
  claude: {
    title: "Claude Code isn't installed",
    installCmd: "npm i -g @anthropic-ai/claude-code",
    installHint: "Install Claude Code then click Recheck.",
  },
  codex: {
    title: "Codex CLI isn't installed",
    installCmd: "npm install -g @openai/codex",
    installHint: "Install Codex CLI then click Recheck.",
  },
  grok: {
    title: "Grok CLI isn't installed",
    installCmd: null,
    installHint: "Install via: https://docs.x.ai/build — see the Grok Build quickstart.",
  },
};

/** Terminal pane host. Every session in the current persona is rendered and
 *  kept mounted; only the active session is visible. Hidden sessions keep their
 *  PTYs (and scrollback/history) alive, so switching session is instant and
 *  lossless — the persistence minimize already gives, now for every session. */
export default function ClaudeTerminalView({
  profileId,
  activeId,
  sessions,
  resolveLayout,
  cli = "claude",
  panelVisible = true,
  onSplitPane,
  onClosePane,
  onSetSplitRatio,
  onPaneStarted,
  onAssignPaneProfile,
  onRespawnPane,
}: {
  profileId: string;
  activeId: string | null;
  /** Every session in the active persona/CLI store — all kept alive. */
  sessions: ClaudeSession[];
  /** Resolve a session's split layout (default single pane). */
  resolveLayout: (session: ClaudeSession) => LayoutNode;
  cli?: string;
  /** False when this whole panel (persona+cli) is hidden but kept alive — so
   *  its panes don't react to window-level events (OS file drag). */
  panelVisible?: boolean;
  onSplitPane: (sessionId: string, paneId: string, dir: "row" | "col", forkConvId?: string) => void;
  onClosePane: (sessionId: string, paneId: string) => void;
  onSetSplitRatio: (sessionId: string, splitId: string, ratio: number) => void;
  onPaneStarted: (sessionId: string, paneId: string) => void;
  onAssignPaneProfile: (sessionId: string, paneId: string, profileId: string, cli: string) => void;
  onRespawnPane: (sessionId: string, paneId: string) => void;
}) {
  // One PaneLayout handle per session; the toolbar drives the active one.
  const paneRefs = useRef<Map<string, ClaudeTerminalHandle>>(new Map());
  const refSetters = useRef(new Map<string, (h: ClaudeTerminalHandle | null) => void>());
  const setterFor = (id: string) => {
    let fn = refSetters.current.get(id);
    if (!fn) {
      fn = (h) => {
        if (h) paneRefs.current.set(id, h);
        else paneRefs.current.delete(id);
      };
      refSetters.current.set(id, fn);
    }
    return fn;
  };
  const activeHandle = useCallback(
    () => (activeId ? paneRefs.current.get(activeId) ?? null : null),
    [activeId],
  );

  const [missing, setMissing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Lazy keep-alive: a session's terminal mounts on first activation and then
  // stays alive (hidden) on switch — so we don't spawn every saved session's
  // CLI on launch, only the ones you actually open.
  const [mounted, setMounted] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!activeId) return;
    setMounted((prev) => (prev.has(activeId) ? prev : new Set(prev).add(activeId)));
  }, [activeId]);
  // Reset the kept-alive set when the persona/CLI changes (those terminals
  // unmount anyway — switching persona/tab respawns + resumes by design).
  useEffect(() => { setMounted(new Set()); }, [profileId, cli]);

  const { cwd } = useDirectoryStore();
  const mini = useWindowStore((s) => s.mini);

  const onScreenshot = useCallback(() => {
    void invoke("screenshot_open");
  }, []);

  const onCwdChange = useCallback(
    (newCwd: string | null) => {
      if (!newCwd) return;
      const safe = newCwd.replace(/\\/g, "/");
      activeHandle()?.insert(`${safe} `);
    },
    [activeHandle],
  );

  const onCommand = useCallback(
    (cmd: string, submit: boolean) => {
      if (submit) activeHandle()?.writeLine(cmd);
      else activeHandle()?.insert(cmd + " ");
    },
    [activeHandle],
  );

  useEffect(() => {
    const p = listen<string>("screenshot:captured", (e) => {
      const path = e.payload;
      if (path) activeHandle()?.insert(`${path} `);
    });
    return () => { void p.then((fn) => fn()); };
  }, [activeHandle]);

  // Focus the active session's terminal whenever the active session changes.
  useEffect(() => {
    activeHandle()?.focus();
  }, [activeId, activeHandle]);

  // Clear "missing" error when CLI tab changes so we try again.
  useEffect(() => { setMissing(null); setReloadKey((k) => k + 1); }, [cli]);

  const meta = CLI_META[cli] ?? CLI_META.claude;

  const onCopy = async () => {
    if (!meta.installCmd) return;
    try {
      await navigator.clipboard.writeText(meta.installCmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };

  const onRecheck = () => { setMissing(null); setReloadKey((k) => k + 1); };

  if (missing) {
    return (
      <div className="chat-view">
        <div className="dashboard-offline" role="alert">
          <div className="dashboard-offline-card">
            <h2 className="dashboard-offline-title">{meta.title}</h2>
            <p className="dashboard-offline-body">{missing}</p>
            {meta.installCmd ? (
              <div className="dashboard-offline-cmd">
                <code>{meta.installCmd}</code>
                <button
                  type="button"
                  className="dashboard-offline-copy"
                  onClick={() => void onCopy()}
                  aria-label="Copy command"
                  title={copied ? "Copied" : "Copy command"}
                >
                  {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
                </button>
              </div>
            ) : (
              <p className="dashboard-offline-body" style={{ opacity: 0.7 }}>{meta.installHint}</p>
            )}
            <div className="dashboard-offline-actions">
              <button type="button" className="dashboard-offline-btn primary" onClick={onRecheck}>
                <RefreshCw size={13} strokeWidth={1.75} />
                <span>Recheck</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <section className="chat-transcript-wrap claude-transcript-wrap">
        {sessions
          .filter((s) => mounted.has(s.id) || s.id === activeId)
          .map((s) => {
          const isActive = s.id === activeId;
          return (
            <div
              key={s.id}
              className={`session-pane-slot${isActive ? " active" : ""}`}
              aria-hidden={!isActive}
            >
              <PaneLayout
                ref={setterFor(s.id)}
                sessionId={s.id}
                layout={resolveLayout(s)}
                profileId={profileId}
                defaultCwd={cwd}
                reloadKey={reloadKey}
                mini={mini}
                active={panelVisible && isActive}
                onSplit={(paneId, dir, forkConvId) => onSplitPane(s.id, paneId, dir, forkConvId)}
                onClose={(paneId) => onClosePane(s.id, paneId)}
                onSetRatio={(splitId, ratio) => onSetSplitRatio(s.id, splitId, ratio)}
                onPaneStarted={(paneId) => onPaneStarted(s.id, paneId)}
                onAssignPaneProfile={(paneId, profileId, cli) =>
                  onAssignPaneProfile(s.id, paneId, profileId, cli)
                }
                onRespawn={(paneId) => onRespawnPane(s.id, paneId)}
                onMissingCli={setMissing}
              />
            </div>
          );
        })}
      </section>
      <Toolbar
        onScreenshot={onScreenshot}
        onCwdChange={onCwdChange}
        onCommand={onCommand}
        cli={cli}
      />
    </div>
  );
}
