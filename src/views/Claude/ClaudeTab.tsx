import { useEffect } from "react";
import { useClaudeSessions, forEachPane } from "../../hooks/useClaudeSessions";
import { useProfileStore } from "../../state/profileStore";
import ClaudeSidebar from "./ClaudeSidebar";
import ClaudeTerminalView from "./ClaudeTerminalView";
import { PERSONA_DROP_EVENT, type PersonaDropDetail } from "../../state/dragState";

interface Props {
  /** "claude" | "codex" | "grok" — determines which binary to spawn and which
   *  localStorage namespace to use for sessions. */
  cli: string;
}

/** A full CLI tab: session rail + the live embedded terminal. The active
 *  persona (from the cockpit header) is the terminal's profileId. */
export default function ClaudeTab({ cli }: Props) {
  const profileId = useProfileStore((s) => s.activeProfileId);

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

  return (
    <div className="cli-tab">
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
        />
      </div>
    </div>
  );
}
