import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { usePersonas } from "../../hooks/usePersonas";
import { useProfileStore } from "../../state/profileStore";
import PersonaEditor from "./PersonaEditor";
import PersonaAvatar from "./PersonaAvatar";

/** Persona library — pick the active persona (injected into the terminal),
 *  create / edit / delete custom personas. Orb's modal + card design. */
export default function PersonaManager({ onClose }: { onClose: () => void }) {
  const { personas, refresh, get, save, remove } = usePersonas();
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const [editorFor, setEditorFor] = useState<string | null | undefined>(undefined);
  // undefined = closed, null = creating, string = editing that id.

  const onDelete = async (id: string) => {
    try {
      await remove(id);
      if (activeProfileId === id) setActiveProfile("default");
      await refresh();
    } catch (e) {
      console.error("persona_delete failed", e);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal persona-manager"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Personas"
      >
        <header className="modal-header">
          <h2>Personas</h2>
          <p className="modal-subtitle">
            The active persona is injected into every new terminal session.
          </p>
        </header>
        <div className="modal-body">
          <div className="persona-list">
            {personas.map((p) => {
              const active = p.id === activeProfileId;
              return (
                <div
                  key={p.id}
                  className={`persona-card${active ? " active" : ""}`}
                  onClick={() => setActiveProfile(p.id)}
                  role="button"
                  tabIndex={0}
                >
                  <PersonaAvatar
                    id={p.id}
                    name={p.name}
                    avatar={p.avatar}
                    className="persona-card-avatar"
                  />
                  <div className="persona-card-body">
                    <div className="persona-card-name">
                      {p.name}
                      {active && (
                        <span className="persona-card-badge">
                          <Check size={11} strokeWidth={2.5} /> active
                        </span>
                      )}
                    </div>
                    <div className="persona-card-preview">
                      {p.soulPreview || "No SOUL set — claude uses its default identity."}
                    </div>
                  </div>
                  <div className="persona-card-actions">
                    <button
                      type="button"
                      className="session-row-action"
                      title="Edit persona"
                      aria-label="Edit persona"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditorFor(p.id);
                      }}
                    >
                      <Pencil size={13} strokeWidth={2} />
                    </button>
                    {p.id !== "default" && (
                      <button
                        type="button"
                        className="session-row-action danger"
                        title="Delete persona"
                        aria-label="Delete persona"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDelete(p.id);
                        }}
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="modal-btn primary"
            onClick={() => setEditorFor(null)}
          >
            <Plus size={14} strokeWidth={2.25} />
            <span>New persona</span>
          </button>
          <div className="modal-actions">
            <button type="button" className="modal-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </div>

      {editorFor !== undefined && (
        <PersonaEditor
          editId={editorFor}
          load={get}
          save={save}
          onClose={() => setEditorFor(undefined)}
          onSaved={async (id) => {
            await refresh();
            setActiveProfile(id);
          }}
        />
      )}
    </div>
  );
}
