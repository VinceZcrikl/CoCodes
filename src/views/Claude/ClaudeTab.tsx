import { useEffect } from "react";
import { useClaudeSessions } from "../../hooks/useClaudeSessions";
import { useProfileStore } from "../../state/profileStore";
import ClaudeSidebar from "./ClaudeSidebar";
import ClaudeTerminalView from "./ClaudeTerminalView";

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
    markStarted,
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
          cli={cli}
          onOpened={() => activeId && markStarted(activeId)}
        />
      </div>
    </div>
  );
}
