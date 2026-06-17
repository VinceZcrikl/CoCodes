import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useProviders, type Provider } from "../../hooks/usePersonas";
import {
  PROVIDER_PRESETS,
  CUSTOM_PRESET,
  BLANK_PROVIDER as BLANK,
  draftFromPreset,
} from "./providerPresets";

interface Props {
  onClose: () => void;
  /** Open straight into the edit form for this existing provider id (used by
   *  the base-model picker's "Add key" shortcut on a configured provider). */
  initialEditId?: string;
  /** Open straight into the add form pre-filled from this preset key (used when
   *  the picker's "Add key" targets a supported-but-unconfigured provider). */
  initialPresetKey?: string;
}

/** Manage base-model providers — Anthropic-compatible endpoints (DeepSeek,
 *  Kimi…) a persona's embedded `claude` can use instead of the Claude
 *  subscription. Tokens are write-only: stored in ~/.theoi/.env, never
 *  echoed back (the form only shows whether one is set). */
export default function ProviderManager({
  onClose,
  initialEditId,
  initialPresetKey,
}: Props) {
  const { providers, save, remove } = useProviders();
  // undefined = list view; otherwise the draft being added (isNew) or edited.
  const [draft, setDraft] = useState<Provider | undefined>(undefined);
  const [isNew, setIsNew] = useState(false);
  // Which preset is selected while adding ("" = Custom). Drives auto-fill.
  const [presetKey, setPresetKey] = useState<string>(PROVIDER_PRESETS[0].key);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activePreset = PROVIDER_PRESETS.find((p) => p.key === presetKey);

  // Adding opens pre-filled with the first preset, so the form is ready and the
  // user only pastes a key. Switching the dropdown re-fills every field.
  const startAdd = () => {
    const first = PROVIDER_PRESETS[0];
    setPresetKey(first.key);
    setDraft(draftFromPreset(first));
    setIsNew(true);
    setToken("");
    setError(null);
  };
  const applyPreset = (key: string) => {
    setPresetKey(key);
    const preset = PROVIDER_PRESETS.find((p) => p.key === key);
    setDraft(preset ? draftFromPreset(preset) : { ...BLANK });
  };
  const startEdit = (p: Provider) => {
    setDraft({ ...p });
    setIsNew(false);
    setPresetKey(CUSTOM_PRESET);
    setToken("");
    setError(null);
  };
  const cancelForm = () => {
    setDraft(undefined);
    setError(null);
  };

  // Honor the "Add key" shortcut from the base-model picker: open directly into
  // the matching form. Runs once; for an edit target it waits for the provider
  // list to load (the effect re-runs when `providers` arrives).
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (appliedInitial.current) return;
    if (initialPresetKey) {
      appliedInitial.current = true;
      const preset = PROVIDER_PRESETS.find((p) => p.key === initialPresetKey);
      setPresetKey(preset ? preset.key : CUSTOM_PRESET);
      setDraft(preset ? draftFromPreset(preset) : { ...BLANK });
      setIsNew(true);
      setToken("");
      setError(null);
    } else if (initialEditId) {
      const p = providers.find((x) => x.id === initialEditId);
      if (p) {
        appliedInitial.current = true;
        setDraft({ ...p });
        setIsNew(false);
        setPresetKey(CUSTOM_PRESET);
        setToken("");
        setError(null);
      }
    }
  }, [initialEditId, initialPresetKey, providers]);

  const onDelete = async (id: string) => {
    try {
      await remove(id);
    } catch (e) {
      console.error("provider_delete failed", e);
    }
  };

  const submit = async () => {
    if (!draft) return;
    setError(null);
    if (!draft.label.trim()) return setError("Label is required.");
    if (isNew && !draft.id.trim()) return setError("Id is required.");
    if (!draft.base_url.trim()) return setError("Base URL is required.");
    if (!draft.model.trim()) return setError("Model is required.");
    setBusy(true);
    try {
      await save(
        {
          ...draft,
          id: draft.id.trim(),
          small_fast_model: draft.small_fast_model?.trim() || null,
        },
        token.trim() ? token.trim() : null,
      );
      setDraft(undefined);
      setToken("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Base-model providers"
      >
        <header className="modal-header">
          <h2>Base-model providers</h2>
          <p className="modal-subtitle">
            Anthropic-compatible endpoints (DeepSeek, Kimi…) a persona's{" "}
            <code>claude</code> can use instead of your Claude subscription. Some
            Claude features — prompt caching, 1M context, extended thinking — may
            be unavailable on third-party endpoints.
          </p>
        </header>

        <div className="modal-body">
          {draft === undefined ? (
            <div className="provider-list">
              {providers.length === 0 && (
                <div className="provider-empty">
                  No providers yet. Add one to route a persona at a third-party
                  model.
                </div>
              )}
              {providers.map((p) => (
                <div key={p.id} className="provider-row">
                  <div className="provider-row-head">
                    <span className="cli-picker-label">{p.label}</span>
                    <span className="provider-token-state">
                      {p.has_token ? "key set" : "needs key"}
                    </span>
                  </div>
                  <div className="cli-picker-hint">
                    {p.model} · {p.base_url}
                  </div>
                  <div className="provider-row-actions">
                    <button
                      type="button"
                      className="session-row-action"
                      title="Edit provider"
                      aria-label="Edit provider"
                      onClick={() => startEdit(p)}
                    >
                      <Pencil size={13} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="session-row-action danger"
                      title="Delete provider"
                      aria-label="Delete provider"
                      onClick={() => void onDelete(p.id)}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="provider-form">
              {isNew && (
                <label className="agent-editor-label">
                  <span>Provider</span>
                  <select
                    className="agent-editor-input"
                    value={presetKey}
                    onChange={(e) => applyPreset(e.target.value)}
                  >
                    {PROVIDER_PRESETS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                    <option value={CUSTOM_PRESET}>Custom (enter manually)</option>
                  </select>
                  <p className="agent-editor-hint">
                    {activePreset ? (
                      <>
                        Endpoint &amp; model pre-filled from {activePreset.label}'s
                        docs — just paste your API key below. Get a key at{" "}
                        <span className="provider-key-url">{activePreset.keyUrl}</span>
                      </>
                    ) : (
                      "Enter an Anthropic-compatible endpoint and model by hand."
                    )}
                  </p>
                </label>
              )}
              <label className="agent-editor-label">
                <span>Label</span>
                <input
                  className="agent-editor-input"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="DeepSeek"
                />
              </label>
              <label className="agent-editor-label">
                <span>Id</span>
                <input
                  className="agent-editor-input"
                  value={draft.id}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  placeholder="deepseek"
                  disabled={!isNew}
                />
              </label>
              {!isNew && (
                <p className="agent-editor-hint">
                  The id is tied to the stored token key and can't be changed.
                </p>
              )}
              <label className="agent-editor-label">
                <span>Base URL — Anthropic-compatible endpoint</span>
                <input
                  className="agent-editor-input"
                  value={draft.base_url}
                  onChange={(e) =>
                    setDraft({ ...draft, base_url: e.target.value })
                  }
                  placeholder="https://api.deepseek.com/anthropic"
                />
              </label>
              <label className="agent-editor-label">
                <span>Model</span>
                <input
                  className="agent-editor-input"
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  placeholder="deepseek-chat"
                />
              </label>
              <label className="agent-editor-label">
                <span>Small / fast model (optional — defaults to Model)</span>
                <input
                  className="agent-editor-input"
                  value={draft.small_fast_model ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, small_fast_model: e.target.value })
                  }
                  placeholder="deepseek-chat"
                />
              </label>
              <label className="agent-editor-label">
                <span>
                  API token{" "}
                  <span className="provider-token-state">
                    {isNew
                      ? "(sent as ANTHROPIC_AUTH_TOKEN)"
                      : draft.has_token
                        ? "(stored — leave blank to keep)"
                        : "(not set)"}
                  </span>
                </span>
                <input
                  className="agent-editor-input"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={draft.has_token ? "•••••• unchanged" : "sk-…"}
                  autoComplete="off"
                />
              </label>
              <p className="agent-editor-hint">
                Stored in ~/.theoi/.env, never shown again.
              </p>
              {error && <div className="modal-status error">{error}</div>}
            </div>
          )}
        </div>

        <footer className="modal-footer">
          {draft === undefined ? (
            <>
              <button
                type="button"
                className="modal-btn primary"
                onClick={startAdd}
              >
                <Plus size={14} strokeWidth={2.25} />
                <span>Add provider</span>
              </button>
              <div className="modal-actions">
                <button type="button" className="modal-btn" onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="modal-counter">
                {isNew ? "New provider" : `Editing ${draft.label || draft.id}`}
              </span>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn"
                  onClick={cancelForm}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-btn primary"
                  onClick={submit}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save provider"}
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
