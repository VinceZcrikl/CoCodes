import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Pin, Pencil, FolderInput } from "lucide-react";
import type { ClaudeSession } from "../../hooks/useClaudeSessions";
import { formatItemTime } from "./formatTime";

interface Props {
  session: ClaudeSession;
  active: boolean;
  busy?: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onMoveGroup: (id: string) => void;
}

const DELETE_CONFIRM_MS = 3000;

/** Session list row — inline rename, pin, move-to-group, delete-with-confirm.
 *  Ported from orb's SessionRow design, backed by Claude sessions. */
export default function SessionRow({
  session,
  active,
  busy,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  onMoveGroup,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmTimer = useRef<number | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraftTitle(session.title);
  }, [session.title, editing]);

  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    };
  }, []);

  const commitEdit = () => {
    const next = draftTitle.trim();
    setEditing(false);
    if (!next || next === session.title) return;
    onRename(session.id, next);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftTitle(session.title);
  };

  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const requestDelete = () => {
    if (confirmingDelete) {
      if (confirmTimer.current !== null) {
        window.clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
      }
      setConfirmingDelete(false);
      onDelete(session.id);
      return;
    }
    setConfirmingDelete(true);
    confirmTimer.current = window.setTimeout(() => {
      setConfirmingDelete(false);
      confirmTimer.current = null;
    }, DELETE_CONFIRM_MS);
  };

  return (
    <div
      className={`session-row${active ? " active" : ""}${busy ? " running" : ""}`}
      onClick={() => {
        if (active || editing) return;
        onSelect(session.id);
      }}
      role="button"
      tabIndex={0}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="session-row-input"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={onEditKey}
          onBlur={commitEdit}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="session-row-body">
          <span className="session-row-title" title={session.title}>
            {session.title}
          </span>
          {formatItemTime(session.updatedAt) && (
            <span className="session-row-time">
              {formatItemTime(session.updatedAt)}
            </span>
          )}
        </div>
      )}
      <div className="session-row-actions">
        {!editing && (
          <button
            type="button"
            aria-label={session.pinned ? "Unpin" : "Pin"}
            title={session.pinned ? "Unpin" : "Pin to top"}
            className={`session-row-action${session.pinned ? " pinned" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(session.id);
            }}
          >
            <Pin size={12} strokeWidth={2} fill={session.pinned ? "currentColor" : "none"} />
          </button>
        )}
        {!editing && (
          <button
            type="button"
            aria-label="Move to group"
            title="Move to group"
            className="session-row-action"
            onClick={(e) => {
              e.stopPropagation();
              onMoveGroup(session.id);
            }}
          >
            <FolderInput size={12} strokeWidth={2} />
          </button>
        )}
        {!editing && (
          <button
            type="button"
            aria-label="Rename"
            title="Rename"
            className="session-row-action"
            onClick={(e) => {
              e.stopPropagation();
              setDraftTitle(session.title);
              setEditing(true);
            }}
          >
            <Pencil size={12} strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          aria-label={confirmingDelete ? "Confirm delete" : "Delete"}
          className={`session-row-action danger${confirmingDelete ? " confirming" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            requestDelete();
          }}
        >
          {confirmingDelete ? "Sure?" : "×"}
        </button>
      </div>
    </div>
  );
}
