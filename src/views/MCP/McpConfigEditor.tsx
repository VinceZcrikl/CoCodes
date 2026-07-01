import { useEffect, useRef, useState } from "react";
import { ExternalLink, X, AlertCircle, CheckCircle2, LogIn, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { McpServer } from "../../hooks/useMcp";
import { MCP_PRESETS, buildPresetConfig, extractEnvValues, type McpPreset } from "./mcpPresets";
import { useDirectoryStore } from "../../state/directoryStore";
import { openExternal } from "../../util/openExternal";

const isWindows = navigator.userAgent.includes("Windows");
const isMac = navigator.userAgent.includes("Mac");

const CLIENTS = [
  {
    id: "claude_desktop", label: "Claude Desktop",
    path: isWindows
      ? "%APPDATA%\\Claude\\claude_desktop_config.json"
      : isMac
        ? "~/Library/Application Support/Claude/claude_desktop_config.json"
        : "~/.config/Claude/claude_desktop_config.json",
  },
  { id: "cursor",  label: "Cursor",   path: "~/.cursor/mcp.json" },
  { id: "vscode",  label: "VS Code",  path: ".vscode/mcp.json  (current dir)" },
];

const CUSTOM_PLACEHOLDER = JSON.stringify(
  { command: "npx", args: ["-y", "your-mcp-package"], env: { API_KEY: "your-key" } },
  null,
  2,
);

interface Props {
  /** Server to edit. null = new custom. McpServer with presetKey = edit preset. */
  server?: McpServer | null;
  /** If set, open directly into this preset's config form (new preset). */
  presetKey?: string;
  onSave: (server: McpServer, clientIds: string[]) => Promise<void>;
  onClose: () => void;
}

export default function McpConfigEditor({ server, presetKey: initialPresetKey, onSave, onClose }: Props) {
  const { cwd } = useDirectoryStore();

  // Resolve which preset (if any) this editor is for.
  const resolvedPresetKey = server?.presetKey ?? initialPresetKey ?? null;
  const preset: McpPreset | null = resolvedPresetKey
    ? (MCP_PRESETS.find((p) => p.key === resolvedPresetKey) ?? null)
    : null;

  const isNew = !server?.id;
  const isPresetMode = preset !== null;
  const title = isPresetMode
    ? `Configure ${preset.name}`
    : isNew ? "Add Custom MCP Server" : "Edit MCP Server";

  // ── Preset mode state ──
  const [envValues, setEnvValues] = useState<Record<string, string>>(() =>
    preset && server ? extractEnvValues(preset, server.config) : {},
  );

  // ── Custom mode state ──
  const [name, setName] = useState(
    isPresetMode ? (preset?.name ?? "") : (server?.name ?? ""),
  );
  const [jsonText, setJsonText] = useState(() => {
    if (isPresetMode) return "";
    return server?.config ? JSON.stringify(server.config, null, 2) : CUSTOM_PLACEHOLDER;
  });

  // ── Shared state ──
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAuthStep, setShowAuthStep] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authDone, setAuthDone] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { firstInputRef.current?.focus(); }, []);

  // Reset when server prop changes.
  useEffect(() => {
    const pk = server?.presetKey ?? initialPresetKey ?? null;
    const p = pk ? MCP_PRESETS.find((x) => x.key === pk) ?? null : null;
    setEnvValues(p && server ? extractEnvValues(p, server.config) : {});
    setName(p ? (p.name) : (server?.name ?? ""));
    setJsonText(
      p ? "" : server?.config ? JSON.stringify(server.config, null, 2) : CUSTOM_PLACEHOLDER,
    );
    setSelectedClients(new Set());
    setError(null);
    setSuccessMsg(null);
    setShowAuthStep(false);
    setAuthDone(false);
  }, [server, initialPresetKey]);

  const toggleClient = (id: string) =>
    setSelectedClients((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleSave = async () => {
    setError(null);
    setSuccessMsg(null);
    let config: Record<string, unknown>;

    if (isPresetMode && preset) {
      // Validate required fields.
      for (const field of preset.envFields) {
        if (!envValues[field.key]?.trim()) {
          setError(`${field.label} is required.`);
          return;
        }
      }
      config = buildPresetConfig(preset, envValues);
    } else {
      const trimmedName = name.trim();
      if (!trimmedName) { setError("Name is required."); return; }
      const text = jsonText.trim();
      try {
        const val = JSON.parse(text || "{}") as unknown;
        if (typeof val !== "object" || val === null || Array.isArray(val)) {
          setError("Must be a JSON object — starts with { and ends with }.");
          return;
        }
        config = val as Record<string, unknown>;
      } catch (e) {
        const msg = e instanceof SyntaxError ? e.message : "parse error";
        setError(`JSON syntax error: ${msg}`);
        return;
      }
    }

    setBusy(true);
    try {
      const updated: McpServer = {
        id: server?.id ?? "",
        name: isPresetMode ? preset!.name : name.trim(),
        config,
        enabled: server?.enabled ?? true,
        presetKey: preset?.key,
        usageHint: preset?.usageHint ?? server?.usageHint,
      };
      await onSave(updated, Array.from(selectedClients));
      setSuccessMsg(
        selectedClients.size > 0
          ? `Saved and written to ${selectedClients.size} client(s).`
          : "Saved.",
      );
      if (preset?.authStep) {
        setShowAuthStep(true);
      } else {
        window.setTimeout(onClose, 700);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAuth = async () => {
    if (!preset?.authStep) return;
    setAuthBusy(true);
    setError(null);

    const env: Record<string, string> = { ...preset.staticEnv };
    for (const field of preset.envFields) {
      const val = envValues[field.key];
      if (val) env[field.key] = val;
    }

    // Wire up event listeners before invoking so we never miss the signal.
    const unlistenOk = await listen("mcp:auth-complete", () => {
      unlistenOk();
      unlistenErr();
      setAuthDone(true);
      setAuthBusy(false);
      // Auto-close after brief success display.
      window.setTimeout(onClose, 2000);
    });
    const unlistenErr = await listen<string>("mcp:auth-error", (ev) => {
      unlistenOk();
      unlistenErr();
      setError(ev.payload ?? "Authorization did not complete.");
      setAuthBusy(false);
    });

    try {
      await invoke("mcp_run_auth", {
        command: preset.authStep.command,
        args: preset.authStep.args,
        env,
      });
    } catch (e) {
      unlistenOk();
      unlistenErr();
      setError(`Failed to start auth: ${String(e)}`);
      setAuthBusy(false);
    }
  };

  return (
    <div className="mcp-editor-backdrop" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="mcp-editor" role="dialog" aria-label={title}>
        {/* Header */}
        <header className="mcp-editor-header">
          {preset && (
            <span className="mcp-editor-icon" aria-hidden="true">{preset.icon}</span>
          )}
          <h2 className="mcp-editor-title">{title}</h2>
          <button
            type="button"
            className="git-overlay-btn git-overlay-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="mcp-editor-body">
          {/* Preset description */}
          {preset && (
            <p className="mcp-preset-desc">{preset.description}</p>
          )}

          {/* Preset mode: env var fields */}
          {isPresetMode && preset ? (
            <>
              {preset.envFields.map((field, i) => (
                <div key={field.key} className="mcp-field">
                  <label className="mcp-label" htmlFor={`mcp-env-${field.key}`}>
                    {field.label}
                    {field.hint && (
                      <span className="mcp-label-hint"> — {field.hint}</span>
                    )}
                  </label>
                  <div className="mcp-key-row">
                    <input
                      ref={i === 0 ? firstInputRef : undefined}
                      id={`mcp-env-${field.key}`}
                      type={field.secret ? "password" : "text"}
                      className="mcp-input"
                      value={envValues[field.key] ?? ""}
                      onChange={(e) =>
                        setEnvValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder ?? ""}
                      autoComplete="off"
                    />
                    {i === 0 && preset.keyUrl && (
                      <button
                        type="button"
                        className="mcp-get-key-btn"
                        onClick={() => void openExternal(preset.keyUrl!)}
                        title="Open developer portal to get keys"
                      >
                        <ExternalLink size={12} strokeWidth={2} />
                        Get key
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            /* Custom mode: name + JSON textarea */
            <>
              <div className="mcp-field">
                <label className="mcp-label" htmlFor="mcp-name">Name</label>
                <input
                  ref={firstInputRef}
                  id="mcp-name"
                  type="text"
                  className="mcp-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Filesystem MCP"
                  autoComplete="off"
                />
              </div>

              <div className="mcp-field">
                <label className="mcp-label" htmlFor="mcp-json">
                  MCP Configuration JSON
                  <span className="mcp-label-hint"> — the value for one mcpServers entry</span>
                </label>
                <textarea
                  id="mcp-json"
                  className={`mcp-json-area${error ? " error" : ""}`}
                  value={jsonText}
                  onChange={(e) => { setJsonText(e.target.value); setError(null); }}
                  spellCheck={false}
                  rows={10}
                />
              </div>
            </>
          )}

          {/* Also write to */}
          <div className="mcp-field">
            <p className="mcp-label">Also write config to</p>
            <div className="mcp-clients">
              <label className="mcp-client-row disabled">
                <input type="checkbox" checked readOnly disabled />
                <span className="mcp-client-name">CoCodes</span>
                <span className="mcp-client-path">~/.cocodes/mcp.json  (always)</span>
              </label>
              <label className="mcp-client-row disabled">
                <input type="checkbox" checked readOnly disabled />
                <span className="mcp-client-name">Claude Code</span>
                <span className="mcp-client-path">~/.claude/settings.json  (always)</span>
              </label>
              {CLIENTS.map((c) => (
                <label key={c.id} className="mcp-client-row">
                  <input
                    type="checkbox"
                    checked={selectedClients.has(c.id)}
                    onChange={() => toggleClient(c.id)}
                  />
                  <span className="mcp-client-name">{c.label}</span>
                  <span className="mcp-client-path">{c.path}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedClients.has("vscode") && cwd && (
            <p className="mcp-vscode-note">
              VS Code config will be written to{" "}
              <code>{cwd.replace(/\\/g, "/")}/.vscode/mcp.json</code>
            </p>
          )}

          {showAuthStep && preset?.authStep && (
            <div className="mcp-auth-step">
              <div className="mcp-auth-step-header">
                <LogIn size={14} strokeWidth={2} />
                <span className="mcp-auth-step-title">{preset.authStep.title}</span>
              </div>
              {!authBusy && !authDone && (
                <p className="mcp-auth-step-desc">{preset.authStep.description}</p>
              )}
              {authDone ? (
                <div className="mcp-status success">
                  <CheckCircle2 size={13} strokeWidth={2} />
                  <span>Authorization complete — opening a new session…</span>
                </div>
              ) : authBusy ? (
                <div className="mcp-auth-waiting">
                  <Loader2 size={13} strokeWidth={2} className="mcp-auth-spinner" />
                  <span>Browser opened — complete login and come back here…</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="mcp-footer-btn primary mcp-auth-btn"
                  onClick={() => void handleAuth()}
                >
                  <LogIn size={13} strokeWidth={2} />
                  {preset.authStep.buttonLabel}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="mcp-status error">
              <AlertCircle size={13} strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="mcp-status success">
              <CheckCircle2 size={13} strokeWidth={2} />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        <footer className="mcp-editor-footer">
          <button type="button" className="mcp-footer-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="mcp-footer-btn primary"
            onClick={() => void handleSave()}
            disabled={busy}
          >
            {busy ? "Saving…" : selectedClients.size > 0 ? "Save & Apply" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
