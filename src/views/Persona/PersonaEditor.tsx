import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ExternalLink, KeyRound, RefreshCw, Trash2, Upload } from "lucide-react";
import { usePersonas, useProviders, type PersonaDoc } from "../../hooks/usePersonas";
import ProviderManager from "./ProviderManager";
import { PROVIDER_PRESETS, CODEX_PROVIDER_PRESETS, effectiveModelsUrl } from "./providerPresets";
import PersonaAvatar, { MASCOT_SENTINEL } from "./PersonaAvatar";
import { useProviderModels } from "../../hooks/useProviderModels";
import { openExternal } from "../../util/openExternal";
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

/** Create / edit a persona. Essentials (name, assistant, model, SOUL) are shown
 *  up front; prompt-engineering knobs (Identity mode, MEMORY, USER) live under an
 *  "Advanced" disclosure so the common path stays approachable. A persona's
 *  third-party model + API key can be set inline here, without the separate
 *  provider dialog. Ported from orb's AgentEditor design. */
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
  // Prompt-engineering knobs are collapsed by default; auto-opened when editing a
  // persona that already uses any of them (so existing content is never hidden).
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Inline "set up a third-party model" panel: which row is expanded, plus its
  // draft key + model. Replaces the bounce out to the provider dialog.
  const [keyRowId, setKeyRowId] = useState<string | null>(null);
  const [keyToken, setKeyToken] = useState("");
  const [keyModel, setKeyModel] = useState("");
  const [enabling, setEnabling] = useState(false);
  // Inline note in the key panel (e.g. "paste a key before Refresh").
  const [keyPanelMsg, setKeyPanelMsg] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  // null = closed; {} = open to the list; otherwise open straight into a form
  // (the advanced "Manage providers…" path for custom endpoints).
  const [providerMgr, setProviderMgr] =
    useState<{ editId?: string; presetKey?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { providers, save: saveProvider } = useProviders();
  const { remove } = usePersonas();

  // The base-model picker applies to the claude and codex CLIs. Each draws from
  // its own preset catalog (Anthropic vs OpenAI-compatible); custom providers are
  // matched to a CLI by `wire_api` (present → codex, absent → claude).
  const isCodex = cli === "codex";
  const showBaseModel = cli === "claude" || isCodex;
  const catalog = isCodex ? CODEX_PROVIDER_PRESETS : PROVIDER_PRESETS;

  // Every supported base-model provider, configured or not: the preset catalog
  // first (in catalog order, merged with any saved overrides), then any custom
  // providers the user added that aren't in the catalog. Each row carries enough
  // (models, keyUrl, base_url…) to set the provider up inline.
  const baseModelRows = useMemo(() => {
    const byId = new Map(providers.map((p) => [p.id, p]));
    const rows = catalog.map((preset) => {
      const cfg = byId.get(preset.id);
      return {
        id: preset.id,
        label: cfg?.label ?? preset.label,
        model: cfg?.model ?? preset.model,
        models: preset.models,
        models_url: preset.models_url ?? null,
        keyUrl: preset.keyUrl,
        base_url: cfg?.base_url ?? preset.base_url,
        wire_api: cfg?.wire_api ?? preset.wire_api ?? null,
        context_window: cfg?.context_window ?? preset.context_window ?? null,
        max_output_tokens: cfg?.max_output_tokens ?? preset.max_output_tokens ?? null,
        local: preset.local ?? false,
        hasToken: cfg?.has_token ?? false,
        configured: !!cfg,
      };
    });
    for (const p of providers) {
      if (catalog.some((preset) => preset.id === p.id)) continue;
      // Only show custom providers whose kind matches this CLI.
      if (!!p.wire_api !== isCodex) continue;
      rows.push({
        id: p.id,
        label: p.label,
        model: p.model,
        models: [p.model],
        models_url: null,
        keyUrl: "",
        base_url: p.base_url,
        wire_api: p.wire_api ?? null,
        context_window: p.context_window ?? null,
        max_output_tokens: p.max_output_tokens ?? null,
        local: false,
        hasToken: p.has_token,
        configured: true,
      });
    }
    return rows;
  }, [providers, catalog, isCodex]);

  type BaseModelRow = (typeof baseModelRows)[number];

  // A local codex provider needs no API key; everything else is "usable" only
  // once a token is stored.
  const rowUsableWithoutKey = (row: BaseModelRow) => row.local;

  // Open the inline key/model panel for a row (add a key, or change key/model).
  const openKeyPanel = (row: BaseModelRow) => {
    setKeyRowId(row.id);
    setKeyModel(row.model);
    setKeyToken("");
    setError(null);
  };

  // Selecting a row: a keyless local provider is persisted in one click; an
  // unconfigured cloud provider opens the inline key panel; anything already
  // usable is selected directly.
  const selectRow = async (row: BaseModelRow) => {
    if (!row.configured && rowUsableWithoutKey(row)) {
      try {
        await saveProvider(
          {
            id: row.id,
            label: row.label,
            base_url: row.base_url,
            model: row.model,
            small_fast_model: null,
            wire_api: row.wire_api ?? "chat",
            context_window: row.context_window,
            max_output_tokens: row.max_output_tokens,
            has_token: false,
          },
          null,
        );
        setBaseModel(row.id);
      } catch (e) {
        setError(String(e));
      }
      return;
    }
    if (!row.configured && !row.hasToken) {
      openKeyPanel(row);
      return;
    }
    setBaseModel(row.id);
  };

  // Save the provider from the inline panel (preset-derived endpoint + chosen
  // model + pasted key), then select it. A blank key on an already-configured
  // provider keeps the stored one (backend preserves it).
  const enableProvider = async (row: BaseModelRow) => {
    setEnabling(true);
    setError(null);
    try {
      await saveProvider(
        {
          id: row.id,
          label: row.label,
          base_url: row.base_url,
          model: keyModel || row.model,
          small_fast_model: null,
          wire_api: row.wire_api ?? null,
          context_window: row.context_window,
          max_output_tokens: row.max_output_tokens,
          has_token: false,
        },
        keyToken.trim() ? keyToken.trim() : null,
      );
      setBaseModel(row.id);
      setKeyRowId(null);
      setKeyToken("");
    } catch (e) {
      setError(String(e));
    } finally {
      setEnabling(false);
    }
  };

  // Live model list for the row whose key panel is open (Kimi/DeepSeek/Ollama…).
  const keyRow = baseModelRows.find((r) => r.id === keyRowId) ?? null;
  const keyModelsUrl = keyRow ? effectiveModelsUrl(keyRow) : null;
  const {
    models: keyModelOptions,
    loading: keyModelsLoading,
    error: keyModelsError,
    refresh: refreshKeyModels,
    reset: resetKeyModels,
  } = useProviderModels(keyRow?.models ?? []);

  // When the key panel opens, drop any prior list and auto-load when the endpoint
  // is reachable without the user typing a key (configured = stored key; local =
  // no key). For a fresh cloud provider, the "Refresh" button fetches once a key
  // is pasted.
  useEffect(() => {
    resetKeyModels();
    setKeyPanelMsg(null);
    if (keyRow && keyModelsUrl && (keyRow.configured || keyRow.local)) {
      void refreshKeyModels(keyModelsUrl, keyRow.id, undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyRowId]);

  // Refresh the live model list, but if the provider needs a key and none is
  // available (not local, no stored key, nothing typed) prompt for it instead of
  // firing a request that would just 401.
  const tryRefreshKeyModels = async (row: BaseModelRow) => {
    setKeyPanelMsg(null);
    if (!row.local && !row.hasToken && !keyToken.trim()) {
      setKeyPanelMsg("Paste your API key first, then Refresh.");
      keyInputRef.current?.focus();
      return;
    }
    const ids = await refreshKeyModels(keyModelsUrl, row.id, keyToken);
    // After a successful refresh, default-select the first model in the list.
    if (ids && ids.length) setKeyModel(ids[0]);
  };

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
      // Reveal Advanced if this persona already uses any of its knobs.
      setShowAdvanced(
        doc.prompt_mode === "replace" ||
          !!doc.memory?.trim() ||
          !!doc.user?.trim(),
      );
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
        // base_model applies to claude + codex; prompt_mode is claude-only.
        base_model: showBaseModel ? baseModel || null : null,
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
            A persona is a named assistant with its own look, model and
            personality. Only a name is required — everything else is optional.
          </p>
        </header>
        <div className="modal-body">
          {/* ── Avatar ─────────────────────────────────────────────── */}
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
                  // Explicit extensions, not the `image/*` wildcard: on recent
                  // macOS the wildcard makes WKWebView offer the system Photos
                  // picker, which triggers a "would like to access your Photo
                  // Library" prompt attributed to the app. Listing extensions
                  // uses the plain file panel and still filters to images.
                  accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.bmp"
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

          {/* ── Name (required) ────────────────────────────────────── */}
          <label className="agent-editor-label">
            <span>Name</span>
            <input
              type="text"
              className="agent-editor-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Frontend helper"
              disabled={isEdit}
            />
            <p className="agent-editor-hint">
              {isEdit
                ? "The name is tied to the persona's folder on disk and can't be changed here."
                : "What you'll call this persona."}
            </p>
          </label>

          {/* ── CLI / assistant ────────────────────────────────────── */}
          <div className="agent-editor-label">
            <span>CLI</span>
            <div className="cli-picker">
              {CLI_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`cli-picker-btn${cli === opt.id ? " active" : ""}`}
                  onClick={() => {
                    // A base-model preset is CLI-specific; clear it on switch so a
                    // claude provider can't leak onto a codex persona (or vice versa).
                    if (opt.id !== cli) {
                      setBaseModel("");
                      setKeyRowId(null);
                    }
                    setCli(opt.id);
                  }}
                  title={opt.hint}
                >
                  <span className="cli-picker-label">{opt.label}</span>
                  <span className="cli-picker-hint">{opt.hint}</span>
                </button>
              ))}
            </div>
            <p className="agent-editor-hint">
              Which AI assistant this persona runs.
            </p>
          </div>

          {/* ── Base model (+ inline key/model setup) ──────────────── */}
          {showBaseModel && (
            <div className="agent-editor-label">
              <span>Base model</span>
              <div className="basemodel-picker">
                <button
                  type="button"
                  className={`basemodel-row-main${baseModel === "" ? " active" : ""}`}
                  onClick={() => setBaseModel("")}
                >
                  <span className="cli-picker-label">
                    {isCodex
                      ? "Default — ChatGPT / OpenAI"
                      : "Default — Claude subscription"}
                  </span>
                  <span className="cli-picker-hint">
                    {isCodex
                      ? "Your Codex sign-in (ChatGPT or OPENAI_API_KEY)"
                      : "Your Claude subscription"}
                  </span>
                </button>
                {baseModelRows.map((row) => {
                  const needsKey = !row.hasToken && !rowUsableWithoutKey(row);
                  const editingKey = keyRowId === row.id;
                  return (
                    <div
                      key={row.id}
                      className={`basemodel-row${baseModel === row.id ? " active" : ""}${editingKey ? " editing" : ""}`}
                    >
                      <div className="basemodel-row-head">
                        <button
                          type="button"
                          className="basemodel-row-main"
                          onClick={() => void selectRow(row)}
                          title={row.model}
                        >
                          <span className="cli-picker-label">{row.label}</span>
                          <span className="cli-picker-hint">
                            {row.model}
                            {row.local ? " · local" : ""}
                            {needsKey ? " · needs key" : ""}
                          </span>
                        </button>
                        {!row.local && (needsKey || row.configured) && (
                          <button
                            type="button"
                            className="basemodel-addkey"
                            onClick={() => openKeyPanel(row)}
                            title={needsKey ? "Add an API key" : "Change key or model"}
                          >
                            <KeyRound size={12} strokeWidth={2} />
                            <span>{needsKey ? "Add key" : "Key"}</span>
                          </button>
                        )}
                      </div>
                      {editingKey && (
                        <div className="basemodel-keypanel">
                          {(keyModelOptions.length > 1 || keyModelsUrl) && (
                            <label className="basemodel-keypanel-field">
                              <span className="basemodel-keypanel-modelhead">
                                <span>Model</span>
                                {keyModelsUrl && (
                                  <button
                                    type="button"
                                    className="basemodel-refresh"
                                    onClick={() => void tryRefreshKeyModels(row)}
                                    disabled={keyModelsLoading}
                                    title="Refresh the model list from the provider"
                                  >
                                    <RefreshCw
                                      size={11}
                                      strokeWidth={2}
                                      className={keyModelsLoading ? "spin" : undefined}
                                    />
                                    <span>{keyModelsLoading ? "Loading…" : "Refresh"}</span>
                                  </button>
                                )}
                              </span>
                              <select
                                className="agent-editor-input"
                                value={keyModel}
                                onChange={(e) => setKeyModel(e.target.value)}
                              >
                                {[...new Set([keyModel, ...keyModelOptions].filter(Boolean))].map(
                                  (m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ),
                                )}
                              </select>
                              {keyPanelMsg ? (
                                <span className="basemodel-keypanel-note">{keyPanelMsg}</span>
                              ) : (
                                keyModelsError && (
                                  <span className="basemodel-keypanel-err">
                                    Couldn't load the live list — using defaults.
                                  </span>
                                )
                              )}
                            </label>
                          )}
                          <label className="basemodel-keypanel-field">
                            <span>
                              API key
                              {row.hasToken ? " (leave blank to keep)" : ""}
                            </span>
                            <input
                              ref={keyInputRef}
                              className="agent-editor-input"
                              type="password"
                              autoComplete="off"
                              placeholder={
                                row.hasToken ? "•••••• unchanged" : "Paste your API key (sk-…)"
                              }
                              value={keyToken}
                              onChange={(e) => {
                                setKeyToken(e.target.value);
                                if (keyPanelMsg) setKeyPanelMsg(null);
                              }}
                            />
                          </label>
                          <div className="basemodel-keypanel-actions">
                            {row.keyUrl && (
                              <button
                                type="button"
                                className="agent-editor-link"
                                onClick={() => void openExternal(row.keyUrl)}
                              >
                                <ExternalLink size={12} strokeWidth={2} />
                                <span>Get key</span>
                              </button>
                            )}
                            <span className="basemodel-keypanel-spacer" />
                            <button
                              type="button"
                              className="modal-btn"
                              onClick={() => {
                                setKeyRowId(null);
                                setKeyToken("");
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="modal-btn primary"
                              disabled={enabling || (!row.hasToken && !keyToken.trim())}
                              onClick={() => void enableProvider(row)}
                            >
                              {enabling ? "Saving…" : "Enable"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="agent-editor-hint">
                The model it uses. Default uses your{" "}
                {isCodex ? "Codex sign-in" : "Claude subscription"}; pick a
                provider to use a different model (paste its key right here).{" "}
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

          {/* ── SOUL (personality) ─────────────────────────────────── */}
          <label className="agent-editor-label">
            <span>SOUL</span>
            <textarea
              className="agent-editor-input agent-editor-soul"
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              rows={6}
              placeholder="You are a terse, senior Rust engineer…"
            />
            <p className="agent-editor-hint">
              System prompt — this persona's personality &amp; behaviour.{" "}
              {cli === "claude" && !soul.trim()
                ? "Leave blank to use Claude Code's default."
                : "Optional."}
            </p>
          </label>

          {/* ── Advanced (collapsed) ───────────────────────────────── */}
          <div className="agent-editor-advanced">
            <button
              type="button"
              className="agent-editor-advanced-toggle"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <ChevronRight
                size={14}
                strokeWidth={2}
                className={`agent-editor-advanced-chevron${showAdvanced ? " open" : ""}`}
              />
              <span>Advanced</span>
            </button>
            {showAdvanced && (
              <div className="agent-editor-advanced-body">
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
                      <strong>Replace</strong> makes the SOUL the entire system
                      prompt — best for writing / character personas and
                      third-party models that ignore an appended persona.{" "}
                      <strong>Augment</strong> keeps Claude Code's coding identity
                      and appends the SOUL.
                    </p>
                  </div>
                )}

                <label className="agent-editor-label">
                  <span>MEMORY</span>
                  <textarea
                    className="agent-editor-input agent-editor-soul"
                    value={memory}
                    onChange={(e) => setMemory(e.target.value)}
                    rows={4}
                    placeholder="The project is CoCodes, a Tauri cockpit…"
                  />
                  <p className="agent-editor-hint">
                    Facts it should always remember (e.g. about your project).
                  </p>
                </label>

                <label className="agent-editor-label">
                  <span>USER</span>
                  <textarea
                    className="agent-editor-input agent-editor-soul"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    rows={3}
                    placeholder="Prefers concise answers and minimal dependencies."
                  />
                  <p className="agent-editor-hint">
                    About you, so it tailors its answers.
                  </p>
                </label>
              </div>
            )}
          </div>

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
          kind={isCodex ? "codex" : "claude"}
          presets={catalog}
          onClose={() => setProviderMgr(null)}
          initialEditId={providerMgr.editId}
          initialPresetKey={providerMgr.presetKey}
        />
      )}
    </div>
  );
}
