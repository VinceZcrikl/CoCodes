import { useEffect, useRef, useState } from "react";
import { ChevronRight, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useProviders, type Provider } from "../../hooks/usePersonas";
import {
  PROVIDER_PRESETS,
  CUSTOM_PRESET,
  BLANK_PROVIDER as BLANK,
  draftFromPreset,
  slugify,
  type ProviderPreset,
} from "./providerPresets";
import { openExternal } from "../../util/openExternal";

/** Sentinel option in the Model dropdown that switches to free-text entry. */
const CUSTOM_MODEL = "__custom__";

interface Props {
  onClose: () => void;
  /** Which CLI's providers to manage — selects the preset catalog and copy.
   *  "claude" → Anthropic-compatible; "codex" → OpenAI-compatible. */
  kind?: "claude" | "codex";
  /** The preset catalog for `kind`. Defaults to the Anthropic (claude) one. */
  presets?: ProviderPreset[];
  /** Open straight into the edit form for this existing provider id (used by
   *  the base-model picker's "Add key" shortcut on a configured provider). */
  initialEditId?: string;
  /** Open straight into the add form pre-filled from this preset key (used when
   *  the picker's "Add key" targets a supported-but-unconfigured provider). */
  initialPresetKey?: string;
}

/** Manage base-model providers a persona's embedded CLI can use instead of the
 *  vendor default — Anthropic-compatible endpoints for `claude`, or
 *  OpenAI-compatible ones for `codex`. Tokens are write-only: stored in
 *  ~/.cocodes/.env, never echoed back (the form only shows whether one is set). */
export default function ProviderManager({
  onClose,
  kind = "claude",
  presets = PROVIDER_PRESETS,
  initialEditId,
  initialPresetKey,
}: Props) {
  const isCodex = kind === "codex";
  const { providers, save, remove } = useProviders();
  // undefined = list view; otherwise the draft being added (isNew) or edited.
  const [draft, setDraft] = useState<Provider | undefined>(undefined);
  const [isNew, setIsNew] = useState(false);
  // Which preset is selected while adding ("" = Custom). Drives auto-fill.
  const [presetKey, setPresetKey] = useState<string>(presets[0]?.key ?? CUSTOM_PRESET);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // When true, the model is typed freely instead of picked from the preset's
  // dropdown (the "Custom…" option, or a provider with no known model list).
  const [modelCustom, setModelCustom] = useState(false);
  // Technical fields (Base URL, wire note / small-fast model) live under an
  // "Advanced" fold — collapsed for presets (prefilled), open for Custom.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const activePreset = presets.find((p) => p.key === presetKey);
  // Models offered for the current draft: the chosen preset's list when adding,
  // or the matching preset (by id) when editing. Empty → free-text model entry.
  const modelPreset = activePreset ?? presets.find((p) => p.id === draft?.id);
  const modelOptions = modelPreset?.models ?? [];
  // A custom (non-preset) draft for this CLI: codex providers default to the
  // "chat" wire protocol; claude ones have no wire_api.
  const blankDraft = (): Provider => ({ ...BLANK, wire_api: isCodex ? "chat" : null });

  // Adding opens pre-filled with the first preset, so the form is ready and the
  // user only pastes a key. Switching the dropdown re-fills every field.
  const startAdd = () => {
    const first = presets[0];
    setPresetKey(first ? first.key : CUSTOM_PRESET);
    setDraft(first ? draftFromPreset(first) : blankDraft());
    setIsNew(true);
    setToken("");
    setError(null);
    setModelCustom(!first);
    setAdvancedOpen(!first);
  };
  const applyPreset = (key: string) => {
    setPresetKey(key);
    const preset = presets.find((p) => p.key === key);
    setDraft(preset ? draftFromPreset(preset) : blankDraft());
    setModelCustom(!preset);
    setAdvancedOpen(!preset);
  };
  const startEdit = (p: Provider) => {
    setDraft({ ...p });
    setIsNew(false);
    setPresetKey(CUSTOM_PRESET);
    setToken("");
    setError(null);
    // Free-text unless the saved model is one this provider's preset lists.
    const preset = presets.find((x) => x.id === p.id);
    setModelCustom(!preset || !preset.models.includes(p.model));
    setAdvancedOpen(!preset);
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
      const preset = presets.find((p) => p.key === initialPresetKey);
      setPresetKey(preset ? preset.key : CUSTOM_PRESET);
      setDraft(preset ? draftFromPreset(preset) : blankDraft());
      setIsNew(true);
      setToken("");
      setError(null);
      setModelCustom(!preset);
      setAdvancedOpen(!preset);
    } else if (initialEditId) {
      const p = providers.find((x) => x.id === initialEditId);
      if (p) {
        appliedInitial.current = true;
        setDraft({ ...p });
        setIsNew(false);
        setPresetKey(CUSTOM_PRESET);
        setToken("");
        setError(null);
        const preset = presets.find((x) => x.id === p.id);
        setModelCustom(!preset || !preset.models.includes(p.model));
        setAdvancedOpen(!preset);
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
    if (!draft.label.trim()) return setError("Name is required.");
    // Id is derived from the name for new custom providers (the field is hidden).
    const id = isNew ? draft.id.trim() || slugify(draft.label) : draft.id.trim();
    if (!id) return setError("Name must contain letters or numbers.");
    if (!draft.base_url.trim()) {
      setAdvancedOpen(true);
      return setError("Base URL is required.");
    }
    if (!draft.model.trim()) return setError("Model is required.");
    setBusy(true);
    try {
      await save(
        {
          ...draft,
          id,
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
            {isCodex ? (
              <>
                Chat Completions endpoints (DeepSeek, Qwen, Ollama, LM Studio…)
                a persona's <code>codex</code> can use instead of your ChatGPT /
                OpenAI sign-in. CoCodes bridges Codex's Responses API to them
                locally; local runtimes need no API key.
              </>
            ) : (
              <>
                Anthropic-compatible endpoints (DeepSeek, Kimi…) a persona's{" "}
                <code>claude</code> can use instead of your Claude subscription.
                Some Claude features — prompt caching, 1M context, extended
                thinking — may be unavailable on third-party endpoints.
              </>
            )}
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
                    {presets.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                    <option value={CUSTOM_PRESET}>Custom (enter manually)</option>
                  </select>
                  <p className="agent-editor-hint">
                    {activePreset ? (
                      activePreset.local ? (
                        <>
                          Endpoint &amp; model pre-filled for {activePreset.label} —
                          no API key needed (install it first).
                        </>
                      ) : (
                        <>
                          Endpoint &amp; model pre-filled for {activePreset.label} —
                          just pick a model and paste your API key below ("Get
                          key" opens the page).
                        </>
                      )
                    ) : isCodex ? (
                      "Enter an OpenAI-compatible endpoint and model by hand."
                    ) : (
                      "Enter an Anthropic-compatible endpoint and model by hand."
                    )}
                  </p>
                </label>
              )}
              <label className="agent-editor-label">
                <span>Name</span>
                <input
                  className="agent-editor-input"
                  value={draft.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    // New custom providers derive their id from the name, so the
                    // user never sees the id field. Presets keep their fixed id.
                    setDraft({
                      ...draft,
                      label,
                      ...(isNew && presetKey === CUSTOM_PRESET
                        ? { id: slugify(label) }
                        : {}),
                    });
                  }}
                  placeholder="DeepSeek"
                />
              </label>
              {!isNew && (
                <label className="agent-editor-label">
                  <span>Id</span>
                  <input className="agent-editor-input" value={draft.id} disabled />
                  <p className="agent-editor-hint">
                    The id is tied to the stored key and can't be changed.
                  </p>
                </label>
              )}
              <label className="agent-editor-label">
                <span>Model</span>
                {modelOptions.length > 0 && !modelCustom ? (
                  <select
                    className="agent-editor-input"
                    value={draft.model}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM_MODEL) {
                        setModelCustom(true);
                      } else {
                        setDraft({ ...draft, model: e.target.value });
                      }
                    }}
                  >
                    {/* The saved/default value plus the preset's options, deduped,
                        then a "Custom…" escape hatch for unlisted ids. */}
                    {[...new Set([draft.model, ...modelOptions].filter(Boolean))].map(
                      (m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ),
                    )}
                    <option value={CUSTOM_MODEL}>Custom…</option>
                  </select>
                ) : (
                  <input
                    className="agent-editor-input"
                    value={draft.model}
                    onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                    placeholder="deepseek-v4-flash"
                  />
                )}
              </label>

              {/* Advanced — endpoint & protocol details, prefilled for presets. */}
              <div className="agent-editor-advanced">
                <button
                  type="button"
                  className="agent-editor-advanced-toggle"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((v) => !v)}
                >
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    className={`agent-editor-advanced-chevron${advancedOpen ? " open" : ""}`}
                  />
                  <span>Advanced</span>
                </button>
                {advancedOpen && (
                  <div className="agent-editor-advanced-body">
                    <label className="agent-editor-label">
                      <span>
                        Base URL —{" "}
                        {isCodex
                          ? "OpenAI-compatible endpoint"
                          : "Anthropic-compatible endpoint"}
                      </span>
                      <input
                        className="agent-editor-input"
                        value={draft.base_url}
                        onChange={(e) =>
                          setDraft({ ...draft, base_url: e.target.value })
                        }
                        placeholder={
                          isCodex
                            ? "http://localhost:11434/v1"
                            : "https://api.deepseek.com/anthropic"
                        }
                      />
                    </label>
                    {isCodex ? (
                      <p className="agent-editor-hint">
                        Codex only speaks OpenAI's Responses API, while this
                        endpoint speaks Chat Completions. CoCodes runs a local
                        translator proxy that bridges the two automatically — just
                        give the Chat Completions base URL (ending in{" "}
                        <code>/v1</code>) above.
                      </p>
                    ) : (
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
                    )}
                  </div>
                )}
              </div>
              <label className="agent-editor-label">
                <span>
                  API key{" "}
                  <span className="provider-token-state">
                    {isCodex && isNew
                      ? "(optional — local providers need none)"
                      : isNew
                        ? "(stored locally, sent only to the provider)"
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
                  placeholder={draft.has_token ? "•••••• unchanged" : "Paste your API key (sk-…)"}
                  autoComplete="off"
                />
                <div className="provider-key-actions">
                  {activePreset && !activePreset.local && (
                    <button
                      type="button"
                      className="agent-editor-link"
                      onClick={() => void openExternal(activePreset.keyUrl)}
                    >
                      <ExternalLink size={12} strokeWidth={2} />
                      <span>Get key</span>
                    </button>
                  )}
                  <span className="agent-editor-hint">
                    Stored in ~/.cocodes/.env, never shown again.
                  </span>
                </div>
              </label>
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
