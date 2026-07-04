import { useState } from "react";
import { Check, FolderPlus } from "lucide-react";
import type { ClaudeGroup } from "../../hooks/useClaudeSessions";

interface Props {
  groups: ClaudeGroup[];
  currentGroupId: string | null;
  onPick: (groupId: string | null) => void;
  onCreate: (name: string) => string; // returns the new group id
  onClose: () => void;
}

/** Pick the group a session belongs to (or "No group"), or create a new group
 *  on the fly. Orb modal design. */
export default function GroupPickerModal({
  groups,
  currentGroupId,
  onPick,
  onCreate,
  onClose,
}: Props) {
  const [newName, setNewName] = useState("");

  const createAndPick = () => {
    const name = newName.trim();
    if (!name) return;
    const id = onCreate(name);
    onPick(id);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal group-picker"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Move to group"
      >
        <header className="modal-header">
          <h2>Move to group</h2>
        </header>
        <div className="modal-body">
          <div className="group-picker-list">
            <button
              type="button"
              className={`group-picker-item${currentGroupId === null ? " active" : ""}`}
              onClick={() => {
                onPick(null);
                onClose();
              }}
            >
              <span>No group</span>
              {currentGroupId === null && <Check size={14} strokeWidth={2.25} />}
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`group-picker-item${currentGroupId === g.id ? " active" : ""}`}
                onClick={() => {
                  onPick(g.id);
                  onClose();
                }}
              >
                <span>{g.name}</span>
                {currentGroupId === g.id && <Check size={14} strokeWidth={2.25} />}
              </button>
            ))}
          </div>

          <div className="group-picker-new">
            <input
              className="agent-editor-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) createAndPick();
              }}
              placeholder="New group name…"
            />
            <button
              type="button"
              className="modal-btn primary"
              onClick={createAndPick}
              disabled={!newName.trim()}
            >
              <FolderPlus size={14} strokeWidth={2} />
              <span>Create</span>
            </button>
          </div>
        </div>
        <footer className="modal-footer">
          <span className="modal-counter" />
          <div className="modal-actions">
            <button type="button" className="modal-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
