import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, Trash2, Upload } from "lucide-react";
import { usePersonas, useProviders, type PersonaDoc } from "../../hooks/usePersonas";
import ProviderManager from "./ProviderManager";
import { PROVIDER_PRESETS } from "./providerPresets";
import PersonaAvatar, { MASCOT_SENTINEL } from "./PersonaAvatar";
import ClaudeMascot from "./ClaudeMascot";
import CodexMascot from "./CodexMascot";
import GrokMascot from "./GrokMascot";
import KimiMascot from "./KimiMascot";

const EMOJI_PRESETS = ["🤖", "🦊", "🧠", "✨", "🐙", "📝", "🎨", "🚀", "🦉", "👾"];

const MASCOT_PRESETS = [
  { sentinel: MASCOT_SENTINEL.claude, label: "Claude", Component: ClaudeMascot },
  { sentinel: MASCOT_SENTINEL.codex,  label: "Codex",  Component: CodexMascot  },
  { sentinel: MASCOT_SENTINEL.grok,   label: "Grok",   Component: GrokMascot   },
  { sentinel: MASCOT_SENTINEL.kimi,   label: "Kimi",   Component: KimiMascot   },
];

const CLI_OPTIONS = [
  { id: "claude", label: "Claude", hint: "Anthropic · Claude Code" },
  { id: "codex",  label: "Codex",  hint: "OpenAI · Codex CLI" },
  { id: "grok",   label: "Grok",   hint: "xAI · Grok Build" },
  { id: "kimi",   label: "Kimi Code", hint: "Moonshot · Kimi Code CLI" },
];

interface Props {
  /** Existing persona id to edit, or null to create a new one. */
  editId: string | null;
  load: (id: string) => Promise<PersonaDoc>;
  save: (doc: PersonaDoc) => Promise<string>;
  onClose: () => void;
  onSaved: (id: string) => void;
  /** Called after a persona is deleted, so the parent can reset the active
   *  profile if it was pointing at the now-gone persona. */
  onDeleted?: (id: string) => void;
}

/** The default persona is the fallback identity and isn't deletable. */
const DEFAULT_PERSONA_ID = "claude";

/** Create / edit a persona: name + SOUL (system prompt) + MEMORY + USER. SOUL,
 *  MEMORY and USER are injected into the embedded terminal via
 *  `--append-system-prompt-file`. Ported from orb's AgentEditor design. */
export default function PersonaEditor({
  editId,
  load,
  save,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const isEdit = editId !== null && editId !== "";
  const canDelete = isEdit && editId !== DEFAULT_PERSONA_ID;
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [cli, setCli] = useState("claude");
  const [baseModel, setBaseModel] = useState("");
  const [promptMode, setPromptMode] = useState("append");
  const [soul, setSoul] = useState("");
  const [memory, setMemory] = useState("");
  const [user, setUser] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = closed; {} = open to the list; otherwise open straight into a form
  // (the "Add key" shortcut on a base-model row).
  const [providerMgr, setProviderMgr] =
    useState<{ editId?: string; presetKey?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { providers } = useProviders();
  const { remove } = usePersonas();

  // Every supported base-model provider, configured or not: the preset catalog
  // first (in catalog order, merged with any saved overrides), then any custom
  // providers the user added that aren't in the catalog. Keyless rows expose an
  // "Add key" shortcut instead of being silently unusable.
  const baseModelRows = useMemo(() => {
    const byId = new Map(providers.map((p) => [p.id, p]));
    const rows = PROVIDER_PRESETS.map((preset) => {
      const cfg = byId.get(preset.id);
      return {
        id: preset.id,
        label: cfg?.label ?? preset.label,
        model: cfg?.model ?? preset.model,
        hasToken: cfg?.has_token ?? false,
        configured: !!cfg,
        presetKey: preset.key as string | undefined,
      };
    });
    for (const p of providers) {
      if (PROVIDER_PRESETS.some((preset) => preset.id === p.id)) continue;
      rows.push({
        id: p.id,
        label: p.label,
        model: p.model,
        hasToken: p.has_token,
        configured: true,
        presetKey: undefined,
      });
    }
    return rows;
  }, [providers]);

  const openAddKey = (row: (typeof baseModelRows)[number]) =>
    setProviderMgr(
      row.configured ? { editId: row.id } : { presetKey: row.presetKey },
    );
  // Two-step delete: first click arms (auto-disarms after 3s), second confirms.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

  useEffect(() => {
    if (!isEdit || editId === null) return;
    let cancelled = false;
    void load(editId).then((doc) => {
      if (cancelled) return;
      setName(doc.name);
      setAvatar(doc.avatar);
      setCli(doc.cli || "claude");
      setBaseModel(doc.base_model ?? "");
      setPromptMode(doc.prompt_mode === "replace" ? "replace" : "append");
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
    setSubmitting(true);
    try {
      const id = await save({
        id: editId ?? "",
        name: name.trim(),
        avatar: avatar.trim(),
        cli,
        // base_model / prompt_mode only apply to the claude CLI.
        base_model: cli === "claude" ? baseModel || null : null,
        prompt_mode: cli === "claude" ? promptMode : null,
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

  const onDelete = async () => {
    if (!canDelete || editId === null) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    window.clearTimeout(confirmTimer.current);
    setDeleting(true);
    setError(null);
    try {
      await remove(editId);
      onDeleted?.(editId);
      onClose();
    } catch (e) {
      setError(String(e));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
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
                {MASCOT_PRESETS.map(({ sentinel, label, Component }) => (
                  <button
                    key={sentinel}
                    type="button"
                    className={`avatar-picker-cell avatar-picker-mascot-cell${avatar === sentinel ? " selected" : ""}`}
                    onClick={() => setAvatar(sentinel)}
                    title={`${label} mascot`}
                    aria-label={`${label} mascot`}
                  >
                    <Component className="avatar-picker-mascot-svg" />
                  </button>
                ))}
                <div className="avatar-picker-sep-v" aria-hidden="true" />
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

          <div className="agent-editor-label">
            <span>CLI</span>
            <div className="cli-picker">
              {CLI_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`cli-picker-btn${cli === opt.id ? " active" : ""}`}
                  onClick={() => setCli(opt.id)}
                  title={opt.hint}
                >
                  <span className="cli-picker-label">{opt.label}</span>
                  <span className="cli-picker-hint">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {cli === "claude" && (
            <div className="agent-editor-label">
              <span>Base model</span>
              <div className="basemodel-picker">
                <button
                  type="button"
                  className={`basemodel-row-main${baseModel === "" ? " active" : ""}`}
                  onClick={() => setBaseModel("")}
                >
                  <span className="cli-picker-label">
                    Default — Claude subscription
                  </span>
                  <span className="cli-picker-hint">
                    Your Claude subscription
                  </span>
                </button>
                {baseModelRows.map((row) => (
                  <div
                    key={row.id}
                    className={`basemodel-row${baseModel === row.id ? " active" : ""}`}
                  >
                    <button
                      type="button"
                      className="basemodel-row-main"
                      onClick={() => setBaseModel(row.id)}
                      title={row.model}
                    >
                      <span className="cli-picker-label">{row.label}</span>
                      <span className="cli-picker-hint">
                        {row.model}
                        {row.hasToken ? "" : " · needs key"}
                      </span>
                    </button>
                    {!row.hasToken && (
                      <button
                        type="button"
                        className="basemodel-addkey"
                        onClick={() => openAddKey(row)}
                        title="Add an API key for this provider"
                      >
                        <KeyRound size={12} strokeWidth={2} />
                        <span>Add key</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="agent-editor-hint">
                Routes this persona's <code>claude</code> at a third-party
                Anthropic-compatible endpoint. Other personas — and the default —
                stay on your Claude subscription.{" "}
                <button
                  type="button"
                  className="agent-editor-link"
                  onClick={() => setProviderMgr({})}
                >
                  Manage providers…
                </button>
              </p>
            </div>
          )}

          {cli === "claude" && (
            <div className="agent-editor-label">
              <span>Identity</span>
              <div className="cli-picker">
                <button
                  type="button"
                  className={`cli-picker-btn${promptMode !== "replace" ? " active" : ""}`}
                  onClick={() => setPromptMode("append")}
                >
                  <span className="cli-picker-label">Augment</span>
                  <span className="cli-picker-hint">Claude Code + SOUL</span>
                </button>
                <button
                  type="button"
                  className={`cli-picker-btn${promptMode === "replace" ? " active" : ""}`}
                  onClick={() => setPromptMode("replace")}
                >
                  <span className="cli-picker-label">Replace</span>
                  <span className="cli-picker-hint">SOUL only · pure persona</span>
                </button>
              </div>
              <p className="agent-editor-hint">
                <strong>Replace</strong> makes the SOUL the entire system prompt —
                best for writing / character personas and third-party models that
                ignore an appended persona. <strong>Augment</strong> keeps Claude
                Code's coding identity and appends the SOUL.
              </p>
            </div>
          )}

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
            <span>SOUL — system prompt (optional)</span>
            <textarea
              className="agent-editor-input agent-editor-soul"
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              rows={7}
              placeholder="You are a terse, senior Rust engineer…"
            />
            {cli === "claude" && !soul.trim() && (
              <p className="agent-editor-hint">
                Leave blank to use Claude Code's default system prompt.
              </p>
            )}
          </label>

          <label className="agent-editor-label">
            <span>MEMORY — what the CLI should remember (optional)</span>
            <textarea
              className="agent-editor-input agent-editor-soul"
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              rows={4}
              placeholder="The project is Theoi, a Tauri cockpit…"
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
          {canDelete ? (
            <button
              type="button"
              className={`modal-btn danger${confirmDelete ? " confirming" : ""}`}
              onClick={onDelete}
              disabled={submitting || deleting}
              title="Delete this persona"
            >
              <Trash2 size={14} strokeWidth={2} />
              <span>
                {deleting ? "Deleting…" : confirmDelete ? "Click to confirm" : "Delete persona"}
              </span>
            </button>
          ) : (
            <span className="modal-counter">
              {isEdit ? "Applies to new sessions" : "Creates a new persona"}
            </span>
          )}
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

      {providerMgr && (
        <ProviderManager
          onClose={() => setProviderMgr(null)}
          initialEditId={providerMgr.editId}
          initialPresetKey={providerMgr.presetKey}
        />
      )}
    </div>
  );
}
