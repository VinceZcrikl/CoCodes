import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { Bell, X } from "lucide-react";
import { useAttentionStore } from "../../state/attentionStore";
import { lookupTerminal, getLastFocusedKey } from "../../state/terminalRegistry";
import { navigateToTerminal } from "../../state/attentionNav";
import { usePersonas } from "../../hooks/usePersonas";

interface NeedsAttention {
  id: string;
  cli: string;
  message: string;
}

const CLI_LABEL: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
  kimi: "Kimi Code",
};

/** Listens for backend `cocodes://needs-attention` events (a CLI session blocked
 *  on the user's authorization), pops a tray notification when the user isn't
 *  already looking at that pane, and shows an in-app banner queue. Clicking a
 *  banner item (or the notification) jumps to the waiting session. Mounted once
 *  by the cockpit. */
export default function AttentionCenter() {
  const queue = useAttentionStore((s) => s.queue);
  const push = useAttentionStore((s) => s.push);
  const resolve = useAttentionStore((s) => s.resolve);
  const { personas } = usePersonas();

  // Keep a live persona-name resolver without re-subscribing the Tauri listener.
  const personasRef = useRef(personas);
  personasRef.current = personas;
  const labelFor = (profileId: string | undefined, cli: string): string => {
    const name = profileId
      ? personasRef.current.find((p) => p.id === profileId)?.name
      : undefined;
    return name ?? CLI_LABEL[cli] ?? cli;
  };

  // Backend event → queue + (conditional) OS notification.
  useEffect(() => {
    let granted = false;
    void (async () => {
      try {
        granted = await isPermissionGranted();
        if (!granted) granted = (await requestPermission()) === "granted";
      } catch {
        /* notifications unavailable — banner still works */
      }
    })();

    const unlistenData = listen<NeedsAttention>("cocodes://needs-attention", (ev) => {
      const { id, cli, message } = ev.payload;
      const t = lookupTerminal(id);
      const label = labelFor(t?.profileId, cli);

      // Skip entirely if the user is already looking at this exact pane.
      const looking = document.hasFocus() && getLastFocusedKey() === id;
      if (looking) return;

      push({ id, cli, label, message, ts: Date.now() });

      if (granted) {
        try {
          sendNotification({
            title: `${label} needs your authorization`,
            body: message,
          });
        } catch {
          /* ignore */
        }
      }
      // Bounce the dock / flash the taskbar when the window isn't focused.
      if (!document.hasFocus()) {
        try {
          void getCurrentWindow().requestUserAttention(UserAttentionType.Informational);
        } catch {
          /* permission not granted — ignore */
        }
      }
    });

    // Note: the desktop notification plugin has no action-listener, so clicking
    // the OS notification just focuses the app (macOS) — the in-app banner below
    // is the reliable jump-to-session control.

    return () => {
      void unlistenData.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dock badge — how many prompts are still waiting (macOS dock / Linux
  // taskbar; a no-op elsewhere). Cleared when the queue empties.
  useEffect(() => {
    getCurrentWindow()
      .setBadgeCount(queue.length > 0 ? queue.length : undefined)
      .catch(() => {
        /* unsupported platform / missing permission — the banner still works */
      });
  }, [queue.length]);

  if (queue.length === 0) return null;

  return (
    <div className="attention-banner" role="alert" aria-live="polite">
      {queue.map((item) => (
        <div key={item.id} className="attention-item">
          <button
            type="button"
            className="attention-item-main"
            onClick={() => void navigateToTerminal(item.id)}
            title="Jump to the session waiting for you"
          >
            <Bell size={14} strokeWidth={2} className="attention-bell" />
            <span className="attention-label">{item.label}</span>
            <span className="attention-msg">{item.message}</span>
          </button>
          <button
            type="button"
            className="attention-dismiss"
            onClick={() => resolve(item.id)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
