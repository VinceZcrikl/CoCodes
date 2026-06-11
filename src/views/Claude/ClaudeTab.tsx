import { useEffect, useState } from "react";
import { useClaudeSessions, forEachPane } from "../../hooks/useClaudeSessions";
import { useProfileStore } from "../../state/profileStore";
import ClaudeSidebar from "./ClaudeSidebar";
import ClaudeTerminalView from "./ClaudeTerminalView";
import { PERSONA_DROP_EVENT, type PersonaDropDetail } from "../../state/dragState";
import {
  startDelegationMonitor,
  stopDelegationMonitor,
  DELEGATION_EVENT,
  INJECT_PANE_EVENT,
  type DelegationDetail,
  type InjectPaneDetail,
} from "../../state/delegationMonitor";

interface Props {
  /** "claude" | "codex" | "grok" — determines which binary to spawn and which
   *  localStorage namespace to use for sessions. */
  cli: string;
}

/** A full CLI tab: session rail + the live embedded terminal. The active
 *  persona (from the cockpit header) is the terminal's profileId. */
export default function ClaudeTab({ cli }: Props) {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const [delegationToast, setDelegationToast] = useState<string | null>(null);

  const {
    sessions,
    groups,
    activeId,
    active,
    newSession,
    select,
    remove,
    rename,
    resolveLayout,
    splitPane,
    closePane,
    setSplitRatio,
    markPaneStarted,
    assignPaneProfile,
    respawnPane,
    togglePin,
    setGroup,
    newGroup,
    renameGroup,
    removeGroup,
  } = useClaudeSessions(profileId, cli);

  // Always have at least one session so the terminal has something to bind to.
  useEffect(() => {
    if (sessions.length === 0) newSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length, profileId]);

  // Handle persona-drop events: find which session owns the pane and reassign.
  useEffect(() => {
    const handler = (e: Event) => {
      const { paneId, profileId: dropProfileId, cli: dropCli } =
        (e as CustomEvent<PersonaDropDetail>).detail;
      const owningSession = sessions.find((s) => {
        if (!s.layout) return s.id === paneId;
        let found = false;
        forEachPane(s.layout, (p) => { if (p.paneId === paneId) found = true; });
        return found;
      });
      if (owningSession) {
        assignPaneProfile(owningSession.id, paneId, dropProfileId, dropCli);
      }
    };
    window.addEventListener(PERSONA_DROP_EVENT, handler);
    return () => window.removeEventListener(PERSONA_DROP_EVENT, handler);
  }, [sessions, assignPaneProfile]);

  // Start the PTY output monitor that watches for [TASK→<cli>] delegation
  // blocks. Reference-counted so multiple tabs share one Tauri listener.
  useEffect(() => {
    void startDelegationMonitor();
    return () => stopDelegationMonitor();
  }, []);

  // Route delegation events to a pane in this tab that runs the target CLI.
  useEffect(() => {
    const handler = (e: Event) => {
      const { targetCli, task } = (e as CustomEvent<DelegationDetail>).detail;
      let targetPaneId: string | null = null;
      for (const s of sessions) {
        forEachPane(resolveLayout(s), (p) => {
          if (!targetPaneId && p.cli === targetCli) targetPaneId = p.paneId;
        });
        if (targetPaneId) break;
      }
      if (!targetPaneId) return;
      const detail: InjectPaneDetail = { paneId: targetPaneId, text: task };
      window.dispatchEvent(new CustomEvent(INJECT_PANE_EVENT, { detail }));
      setDelegationToast(`→ ${targetCli}`);
      window.setTimeout(() => setDelegationToast(null), 2800);
    };
    window.addEventListener(DELEGATION_EVENT, handler);
    return () => window.removeEventListener(DELEGATION_EVENT, handler);
  }, [sessions, resolveLayout]);

  return (
    <div className="cli-tab">
      {delegationToast && (
        <div className="delegation-toast" aria-live="polite">
          Task routed {delegationToast}
        </div>
      )}
      <ClaudeSidebar
        sessions={sessions}
        groups={groups}
        activeId={activeId}
        onNew={newSession}
        onSelect={select}
        onRename={rename}
        onDelete={remove}
        onTogglePin={togglePin}
        onSetGroup={setGroup}
        onNewGroup={newGroup}
        onRenameGroup={renameGroup}
        onRemoveGroup={removeGroup}
      />
      <div className="cli-main">
        <ClaudeTerminalView
          profileId={profileId}
          activeId={activeId}
          active={active}
          layout={active ? resolveLayout(active) : null}
          cli={cli}
          onSplitPane={splitPane}
          onClosePane={closePane}
          onSetSplitRatio={setSplitRatio}
          onPaneStarted={markPaneStarted}
          onAssignPaneProfile={assignPaneProfile}
          onRespawnPane={respawnPane}
        />
      </div>
    </div>
  );
}
