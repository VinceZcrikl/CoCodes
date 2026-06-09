import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { PersonaDoc } from "../../hooks/usePersonas";
import PersonaAvatar from "./PersonaAvatar";

const EMOJI_PRESETS = ["🤖", "🦊", "🧠", "✨", "🐙", "📝", "🎨", "🚀", "🦉", "👾"];

interface Props {
  /** Existing persona id to edit, or null to create a new one. */
  editId: string | null;
  load: (id: string) => Promise<PersonaDoc>;
  save: (doc: PersonaDoc) => Promise<string>;
  onClose: () => void;
  onSaved: (id: string) => void;
}

/** Create / edit a persona: name + SOUL (system prompt) + MEMORY + USER. SOUL,
 *  MEMORY and USER are injected into the embedded terminal via
 *  `--append-system-prompt-file`. Ported from orb's AgentEditor design. */
export default function PersonaEditor({
  editId,
  load,
  save,
  onClose,
  onSaved,
}: Props) {
  const isEdit = editId !== null && editId !== "";
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [soul, setSoul] = useState("");
  const [memory, setMemory] = useState("");
  const [user, setUser] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEdit || editId === null) return;
    let cancelled = false;
    void load(editId).then((doc) => {
      if (cancelled) return;
      setName(doc.name);
      setAvatar(doc.avatar);
      setSoul(doc.soul);
      setMemory(doc.memory);
      setUser(doc.user);
    });
    return () => {
      cancelled = true;
    };
  }, [editId, isEdit, load]);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!soul.trim()) {
      setError("SOUL (system prompt) is required.");
      return;
    }
    setSubmitting(true);
    try {
      const id = await save({
        id: editId ?? "",
        name: name.trim(),
        avatar: avatar.trim(),
        soul: soul.trim(),
        memory: memory.trim(),
        user: user.trim(),
      });
      onSaved(id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const heading = isEdit ? `Edit ${name || "persona"}` : "New persona";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal agent-editor"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={heading}
      >
        <header className="modal-header">
          <h2>{heading}</h2>
          <p className="modal-subtitle">
            SOUL, memory and user notes are injected into the terminal as the
            CLI's system prompt.
          </p>
        </header>
        <div className="modal-body">
          <div className="agent-editor-label">
            <span>Avatar</span>
            <div className="avatar-picker">
              <div className="avatar-picker-preview">
                <PersonaAvatar
                  id={editId ?? "new"}
                  name={name || "persona"}
                  avatar={avatar}
                  className="avatar-picker-preview-img"
                />
              </div>
              <div className="avatar-picker-gallery">
                {EMOJI_PRESETS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`avatar-picker-cell${avatar === e ? " selected" : ""}`}
                    onClick={() => setAvatar(e)}
                    title={`Use ${e}`}
                  >
                    {e}
                  </button>
                ))}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={onUpload}
                />
                <button
                  type="button"
                  className="avatar-picker-cell avatar-picker-upload-cell"
                  onClick={() => fileRef.current?.click()}
                  title="Upload an image"
                  aria-label="Upload an image"
                >
                  <Upload size={15} strokeWidth={2} />
                </button>
                {avatar && (
                  <button
                    type="button"
                    className="avatar-picker-cell avatar-picker-clear"
                    onClick={() => setAvatar("")}
                    title="Reset to default"
                    aria-label="Reset avatar"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          <label className="agent-editor-label">
            <span>Name</span>
            <input
              type="text"
              className="agent-editor-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="dev-bot"
              disabled={isEdit}
            />
          </label>
          {isEdit && (
            <p className="agent-editor-hint">
              The name is tied to the persona's folder on disk and can't be
              changed here.
            </p>
          )}

          <label className="agent-editor-label">
            <span>SOUL — system prompt</span>
            <textarea
              className="agent-editor-input agent-editor-soul"
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              rows={7}
              placeholder="You are a terse, senior Rust engineer…"
            />
          </label>

          <label className="agent-editor-label">
            <span>MEMORY — what the CLI should remember (optional)</span>
            <textarea
              className="agent-editor-input agent-editor-soul"
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              rows={4}
              placeholder="The project is OpenTerminus, a Tauri cockpit…"
            />
          </label>

          <label className="agent-editor-label">
            <span>USER — about you (optional)</span>
            <textarea
              className="agent-editor-input agent-editor-soul"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              rows={3}
              placeholder="Prefers concise answers and minimal dependencies."
            />
          </label>

          {error && <div className="modal-status error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <span className="modal-counter">
            {isEdit ? "Applies to new sessions" : "Creates a new persona"}
          </span>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="modal-btn primary"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "Working…" : isEdit ? "Save changes" : "Create persona"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
