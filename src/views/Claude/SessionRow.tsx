import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Pin, Pencil, FolderInput } from "lucide-react";
import type { ClaudeSession, LayoutNode } from "../../hooks/useClaudeSessions";
import { formatItemTime } from "./formatTime";
import {
  setDraggingSession,
  SESSION_DROP_EVENT,
  type SessionDropDetail,
} from "../../state/dragState";

interface Props {
  session: ClaudeSession;
  active: boolean;
  busy?: boolean;
  /** CLI this session's default pane runs — handed to the drop so the target
   *  pane resumes the right binary. */
  cli: string;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onMoveGroup: (id: string) => void;
}

const DELETE_CONFIRM_MS = 3000;

/** First pane label in a session's layout — its manual title, else its AI task
 *  label. Used as a sidebar subtitle when the session title is still the
 *  default, so an unnamed session still says what it's working on. */
function firstPaneLabel(layout?: LayoutNode): string | null {
  const walk = (n: LayoutNode): string | null => {
    if (n.type === "pane") return n.title ?? n.autoLabel ?? null;
    return walk(n.children[0]) ?? walk(n.children[1]);
  };
  return layout ? walk(layout) : null;
}

/** Session list row — inline rename, pin, move-to-group, delete-with-confirm.
 *  Ported from orb's SessionRow design, backed by Claude sessions. */
export default function SessionRow({
  session,
  active,
  busy,
  cli,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  onMoveGroup,
}: Props) {
  const subtitle = firstPaneLabel(session.layout);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmTimer = useRef<number | null>(null);

  // Pointer-drag (not HTML5 DnD, to dodge Tauri's window-drag region) of this
  // session onto a pane — drops the conversation in for the pane to --resume.
  // Mirrors ProfileConstellation's persona drag. `didDrag` suppresses the click
  // that pointerup would otherwise fire (select on a mere click).
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (!didDragRef.current && dist > 5) {
        didDragRef.current = true;
        setDraggingSession({
          convId: session.id,
          cwd: session.cwd ?? null,
          cli,
          title: session.title,
        });
      }
      if (didDragRef.current) setGhost({ x: e.clientX, y: e.clientY });
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!didDragRef.current || !d) {
        setGhost(null);
        setDraggingSession(null);
        return;
      }
      setGhost(null);
      setDraggingSession(null);
      // Defer clearing didDrag so the row's onClick (fired right after pointerup)
      // sees it set and skips selecting.
      window.setTimeout(() => { didDragRef.current = false; }, 0);

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const paneEl = el?.closest("[data-pane-id]") as HTMLElement | null;
      if (paneEl?.dataset.paneId) {
        const detail: SessionDropDetail = {
          paneId: paneEl.dataset.paneId,
          convId: session.id,
          cwd: session.cwd ?? null,
          cli,
        };
        window.dispatchEvent(new CustomEvent(SESSION_DROP_EVENT, { detail }));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [session.id, session.cwd, session.title, cli]);

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
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
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
        // A drag just ended on this row — swallow the synthetic click.
        if (didDragRef.current) return;
        if (active || editing) return;
        onSelect(session.id);
      }}
      onPointerDown={(e) => {
        // Left-button only, and never start a drag from the action buttons or
        // the rename input (they stopPropagation already, but be defensive).
        if (e.button !== 0 || editing) return;
        if ((e.target as HTMLElement).closest(".session-row-actions")) return;
        dragRef.current = { startX: e.clientX, startY: e.clientY };
        didDragRef.current = false;
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
          <div className="session-row-line">
            <span className="session-row-title" title={session.title}>
              {session.title}
            </span>
            {formatItemTime(session.updatedAt) && (
              <span className="session-row-time">
                {formatItemTime(session.updatedAt)}
              </span>
            )}
          </div>
          {session.title === "New session" && subtitle && (
            <span className="session-row-subtitle" title={subtitle}>
              {subtitle}
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

      {/* Floating drag ghost — pointer-events:none so it doesn't block the drop. */}
      {ghost &&
        createPortal(
          <div
            className="session-drag-ghost"
            style={{ left: ghost.x, top: ghost.y }}
            aria-hidden="true"
          >
            {session.title}
          </div>,
          document.body,
        )}
    </div>
  );
}
