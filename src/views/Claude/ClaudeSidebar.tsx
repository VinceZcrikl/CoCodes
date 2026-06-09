import { useMemo, useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Pin, Plus, Trash2 } from "lucide-react";
import type { ClaudeGroup, ClaudeSession } from "../../hooks/useClaudeSessions";
import SessionRow from "./SessionRow";
import GroupPickerModal from "./GroupPickerModal";

interface Props {
  sessions: ClaudeSession[];
  groups: ClaudeGroup[];
  activeId: string | null;
  onNew: (groupId?: string | null) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onSetGroup: (id: string, groupId: string | null) => void;
  onNewGroup: (name: string) => string;
  onRenameGroup: (id: string, name: string) => void;
  onRemoveGroup: (id: string) => void;
}

function byRecent(a: ClaudeSession, b: ClaudeSession) {
  return b.updatedAt - a.updatedAt;
}

/** Claude session rail — orb-style, with a pinned section, collapsible groups
 *  (rename / delete), an ungrouped section, and bottom FABs for new session /
 *  new group. */
export default function ClaudeSidebar({
  sessions,
  groups,
  activeId,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  onSetGroup,
  onNewGroup,
  onRenameGroup,
  onRemoveGroup,
}: Props) {
  const [movingId, setMovingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingGroup) {
      groupInputRef.current?.focus();
      groupInputRef.current?.select();
    }
  }, [editingGroup]);

  const pinned = useMemo(
    () => sessions.filter((s) => s.pinned).sort(byRecent),
    [sessions],
  );
  const ungrouped = useMemo(
    () => sessions.filter((s) => !s.pinned && !s.groupId).sort(byRecent),
    [sessions],
  );
  const byGroup = useMemo(() => {
    const m = new Map<string, ClaudeSession[]>();
    for (const g of groups) m.set(g.id, []);
    for (const s of sessions) {
      if (s.pinned || !s.groupId) continue;
      const arr = m.get(s.groupId);
      if (arr) arr.push(s);
    }
    for (const arr of m.values()) arr.sort(byRecent);
    return m;
  }, [sessions, groups]);

  const moving = movingId ? sessions.find((s) => s.id === movingId) ?? null : null;

  const renderRow = (s: ClaudeSession) => (
    <SessionRow
      key={s.id}
      session={s}
      active={s.id === activeId}
      onSelect={onSelect}
      onRename={onRename}
      onDelete={onDelete}
      onTogglePin={onTogglePin}
      onMoveGroup={setMovingId}
    />
  );

  const commitGroupRename = (id: string) => {
    const next = groupDraft.trim();
    setEditingGroup(null);
    if (next) onRenameGroup(id, next);
  };

  const onGroupKey = (id: string) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitGroupRename(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingGroup(null);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-header-title">Sessions</span>
      </div>

      <div className="session-list">
        {sessions.length === 0 && groups.length === 0 && (
          <div className="session-empty">No sessions yet.</div>
        )}

        {pinned.length > 0 && (
          <div className="session-group">
            <div className="session-group-head static">
              <Pin size={11} strokeWidth={2} aria-hidden="true" />
              <span className="session-group-name">Pinned</span>
            </div>
            <div className="session-group-body">{pinned.map(renderRow)}</div>
          </div>
        )}

        {groups.map((g) => {
          const items = byGroup.get(g.id) ?? [];
          const isCollapsed = collapsed[g.id];
          return (
            <div className="session-group" key={g.id}>
              <div className="session-group-head">
                <button
                  type="button"
                  className="session-group-toggle"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))
                  }
                  aria-label={isCollapsed ? "Expand group" : "Collapse group"}
                >
                  {isCollapsed ? (
                    <ChevronRight size={13} strokeWidth={2} />
                  ) : (
                    <ChevronDown size={13} strokeWidth={2} />
                  )}
                </button>
                {editingGroup === g.id ? (
                  <input
                    ref={groupInputRef}
                    className="session-group-input"
                    value={groupDraft}
                    onChange={(e) => setGroupDraft(e.target.value)}
                    onKeyDown={onGroupKey(g.id)}
                    onBlur={() => commitGroupRename(g.id)}
                  />
                ) : (
                  <span
                    className="session-group-name"
                    onDoubleClick={() => {
                      setGroupDraft(g.name);
                      setEditingGroup(g.id);
                    }}
                    title="Double-click to rename"
                  >
                    {g.name}
                  </span>
                )}
                <span className="session-group-count">{items.length}</span>
                <div className="session-group-actions">
                  <button
                    type="button"
                    className="session-row-action"
                    title="New session in group"
                    aria-label="New session in group"
                    onClick={() => onNew(g.id)}
                  >
                    <Plus size={12} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="session-row-action danger"
                    title="Delete group (keeps its sessions)"
                    aria-label="Delete group"
                    onClick={() => onRemoveGroup(g.id)}
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <div className="session-group-body">
                  {items.length === 0 ? (
                    <div className="session-empty subtle">Empty group</div>
                  ) : (
                    items.map(renderRow)
                  )}
                </div>
              )}
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div className="session-group">
            {(pinned.length > 0 || groups.length > 0) && (
              <div className="session-group-head static">
                <span className="session-group-name muted">Recent</span>
              </div>
            )}
            <div className="session-group-body">{ungrouped.map(renderRow)}</div>
          </div>
        )}
      </div>

      {/* Floating "New session" pill, orb-style — overlaps the list bottom. */}
      <button
        type="button"
        className="sidebar-fab"
        onClick={() => onNew(null)}
        aria-label="New session"
      >
        <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
        <span>New session</span>
      </button>

      {moving && (
        <GroupPickerModal
          groups={groups}
          currentGroupId={moving.groupId}
          onPick={(gid) => onSetGroup(moving.id, gid)}
          onCreate={onNewGroup}
          onClose={() => setMovingId(null)}
        />
      )}
    </aside>
  );
}
