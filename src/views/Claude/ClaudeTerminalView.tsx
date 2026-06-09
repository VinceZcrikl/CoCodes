import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Copy, Check, RefreshCw } from "lucide-react";
import Toolbar from "./Toolbar";
import ClaudeTerminal, { type ClaudeTerminalHandle } from "./ClaudeTerminal";
import type { ClaudeSession } from "../../hooks/useClaudeSessions";

const INSTALL_CMD = "npm i -g @anthropic-ai/claude-code";

/** Claude pane: an embedded xterm running `claude` plus the composer. The
 *  composer injects each sent line into claude's stdin. Session state is owned
 *  by useClaudeSessions and passed in. */
export default function ClaudeTerminalView({
  profileId,
  activeId,
  active,
  onOpened,
}: {
  profileId: string;
  activeId: string | null;
  active: ClaudeSession | null;
  onOpened: () => void;
}) {
  const termRef = useRef<ClaudeTerminalHandle | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Bumped on "Recheck" to remount the terminal after the user installs claude.
  const [reloadKey, setReloadKey] = useState(0);

  // Open the region/window selection overlay. The grab completes async and
  // arrives via the `screenshot:captured` event below.
  const onScreenshot = useCallback(() => {
    void invoke("screenshot_open");
  }, []);

  // Captured PNG path → drop it into the terminal input (without submitting) so
  // the user can add a prompt before sending.
  useEffect(() => {
    const p = listen<string>("screenshot:captured", (e) => {
      const path = e.payload;
      if (path) termRef.current?.insert(`${path} `);
    });
    return () => {
      void p.then((fn) => fn());
    };
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const onRecheck = () => {
    setMissing(null);
    setReloadKey((k) => k + 1);
  };

  if (missing) {
    return (
      <div className="chat-view">
        <div className="dashboard-offline" role="alert">
          <div className="dashboard-offline-card">
            <h2 className="dashboard-offline-title">
              Claude Code isn't installed
            </h2>
            <p className="dashboard-offline-body">{missing}</p>
            <div className="dashboard-offline-cmd">
              <code>{INSTALL_CMD}</code>
              <button
                type="button"
                className="dashboard-offline-copy"
                onClick={() => void onCopy()}
                aria-label="Copy command"
                title={copied ? "Copied" : "Copy command"}
              >
                {copied ? (
                  <Check size={13} strokeWidth={2} />
                ) : (
                  <Copy size={13} strokeWidth={1.75} />
                )}
              </button>
            </div>
            <div className="dashboard-offline-actions">
              <button
                type="button"
                className="dashboard-offline-btn primary"
                onClick={onRecheck}
              >
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
            key={`${profileId}:${activeId}:${reloadKey}`}
            profileId={profileId}
            claudeSessionId={activeId}
            resume={active?.started ?? false}
            onMissingClaude={setMissing}
            onOpened={onOpened}
          />
        )}
      </section>
      <Toolbar onScreenshot={onScreenshot} />
    </div>
  );
}
