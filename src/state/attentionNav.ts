import { getCurrentWindow } from "@tauri-apps/api/window";
import { lookupTerminal } from "./terminalRegistry";
import { useProfileStore } from "./profileStore";
import { useAttentionStore } from "./attentionStore";

/** Cockpit listens for this to switch the persona + CLI tab. */
export const NAV_CLI_EVENT = "cocodes:nav-cli";
/** The matching ClaudeTab listens for this to select the waiting session. */
export const NAV_SELECT_EVENT = "cocodes:nav-select";

export interface NavCliDetail {
  profileId: string;
  cli: string;
}
export interface NavSelectDetail {
  profileId: string;
  cli: string;
  sessionId: string;
}

/** Bring the window forward and navigate so the pane behind terminal `key` is
 *  the active, focused one. Resolves that prompt from the attention queue. */
export async function navigateToTerminal(key: string): Promise<void> {
  const t = lookupTerminal(key);
  useAttentionStore.getState().resolve(key);
  if (!t) return;

  try {
    const w = getCurrentWindow();
    await w.show();
    await w.setFocus();
  } catch {
    /* window API unavailable — ignore */
  }

  // Persona (global store) → CLI tab (Cockpit) → session select (ClaudeTab).
  useProfileStore.getState().setActiveProfile(t.profileId);
  window.dispatchEvent(
    new CustomEvent<NavCliDetail>(NAV_CLI_EVENT, {
      detail: { profileId: t.profileId, cli: t.cli },
    }),
  );
  window.dispatchEvent(
    new CustomEvent<NavSelectDetail>(NAV_SELECT_EVENT, {
      detail: { profileId: t.profileId, cli: t.cli, sessionId: t.sessionId },
    }),
  );

  // The target pane may need to mount (lazy keep-alive) before it can focus;
  // re-resolve the registry entry after the switch settles.
  window.setTimeout(() => lookupTerminal(key)?.focus(), 360);
}

/** Navigate to the oldest pending prompt — used by the OS notification click,
 *  which can't carry which specific notification was tapped on every platform. */
export async function navigateToFirstPending(): Promise<void> {
  const first = useAttentionStore.getState().queue[0];
  if (first) await navigateToTerminal(first.id);
  else {
    try {
      const w = getCurrentWindow();
      await w.show();
      await w.setFocus();
    } catch {
      /* ignore */
    }
  }
}
