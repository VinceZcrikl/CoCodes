import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Copy, Check, RefreshCw } from "lucide-react";
import Toolbar from "./Toolbar";
import ClaudeTerminal, { type ClaudeTerminalHandle } from "./ClaudeTerminal";
import type { ClaudeSession } from "../../hooks/useClaudeSessions";
import { useDirectoryStore } from "../../state/directoryStore";

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

/** Terminal pane: an embedded xterm running a CLI tool plus the toolbar.
 *  Works for Claude, Codex, and Grok by routing through the `cli` prop. */
export default function ClaudeTerminalView({
  profileId,
  activeId,
  active,
  cli = "claude",
  onOpened,
}: {
  profileId: string;
  activeId: string | null;
  active: ClaudeSession | null;
  cli?: string;
  onOpened: () => void;
}) {
  const termRef = useRef<ClaudeTerminalHandle | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { cwd } = useDirectoryStore();

  const onScreenshot = useCallback(() => {
    void invoke("screenshot_open");
  }, []);

  const onCwdChange = useCallback((newCwd: string | null) => {
    if (!newCwd) return;
    const safe = newCwd.replace(/\\/g, "/");
    termRef.current?.insert(`cd "${safe}"`);
  }, []);

  const onCommand = useCallback((cmd: string, submit: boolean) => {
    if (submit) {
      termRef.current?.writeLine(cmd);
    } else {
      termRef.current?.insert(cmd + " ");
    }
  }, []);

  useEffect(() => {
    const p = listen<string>("screenshot:captured", (e) => {
      const path = e.payload;
      if (path) termRef.current?.insert(`${path} `);
    });
    return () => { void p.then((fn) => fn()); };
  }, []);

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
        {activeId && (
          <ClaudeTerminal
            ref={termRef}
            key={`${cli}:${profileId}:${activeId}:${reloadKey}`}
            profileId={profileId}
            claudeSessionId={activeId}
            resume={active?.started ?? false}
            cwd={cwd}
            cli={cli}
            onMissingCli={setMissing}
            onOpened={onOpened}
          />
        )}
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
