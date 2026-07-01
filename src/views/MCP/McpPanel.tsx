import { useEffect, useRef } from "react";
import { Plug, Plus, Settings2, X } from "lucide-react";
import type { McpServer } from "../../hooks/useMcp";
import { MCP_PRESETS } from "./mcpPresets";
import McpServerItem from "./McpServerItem";

interface Props {
  open: boolean;
  servers: McpServer[];
  loading: boolean;
  onClose: () => void;
  onConfigurePreset: (presetKey: string) => void;
  onAdd: () => void;
  onEdit: (server: McpServer) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function McpPanel({
  open,
  servers,
  loading,
  onClose,
  onConfigurePreset,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if ((e.target as Element).closest('[data-panel-toggle="mcp"]')) return;
      onClose();
    };
    const id = window.setTimeout(() => window.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  // Separate preset servers from custom servers.
  const configuredPresetKeys = new Set(servers.map((s) => s.presetKey).filter(Boolean));
  const unconfiguredPresets = MCP_PRESETS.filter((p) => !configuredPresetKeys.has(p.key));
  const presetServers = servers.filter((s) => s.presetKey);
  const customServers = servers.filter((s) => !s.presetKey);

  const hasAny = servers.length > 0 || MCP_PRESETS.length > 0;

  return (
    <div
      ref={panelRef}
      className="mcp-overlay"
      style={{ display: open ? "flex" : "none" }}
      role="dialog"
      aria-label="MCP Servers"
    >
      <header className="git-overlay-bar">
        <span className="git-overlay-title">
          <Plug size={13} strokeWidth={1.9} />
          <span>MCP Servers</span>
        </span>
        <div className="git-overlay-actions">
          <button
            type="button"
            className="git-overlay-btn"
            onClick={onAdd}
            title="Add custom server"
            aria-label="Add custom MCP server"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="git-overlay-btn git-overlay-close"
            onClick={onClose}
            title="Close"
            aria-label="Close MCP panel"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      </header>

      <div className="git-overlay-body mcp-panel-body">
        {loading ? (
          <p className="mcp-empty">Loading…</p>
        ) : (
          <>
            {/* ── Unconfigured presets ── */}
            {unconfiguredPresets.length > 0 && (
              <div className="mcp-section">
                {unconfiguredPresets.length < MCP_PRESETS.length && (
                  <p className="mcp-section-label">Available</p>
                )}
                {unconfiguredPresets.map((preset) => (
                  <div key={preset.key} className="mcp-preset-row">
                    <span className="mcp-preset-icon" aria-hidden="true">{preset.icon}</span>
                    <span className="mcp-server-info">
                      <span className="mcp-server-name">{preset.name}</span>
                      <span className="mcp-server-cmd">{preset.description}</span>
                    </span>
                    <button
                      type="button"
                      className="mcp-configure-btn"
                      onClick={() => onConfigurePreset(preset.key)}
                    >
                      <Settings2 size={11} strokeWidth={2} />
                      Configure
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Configured preset servers ── */}
            {presetServers.length > 0 && (
              <div className="mcp-section">
                {unconfiguredPresets.length > 0 && (
                  <p className="mcp-section-label">Configured</p>
                )}
                {presetServers.map((s) => (
                  <McpServerItem
                    key={s.id}
                    server={s}
                    onToggle={() => onToggle(s.id)}
                    onEdit={() => onEdit(s)}
                    onDelete={() => onDelete(s.id)}
                  />
                ))}
              </div>
            )}

            {/* ── Custom servers ── */}
            {customServers.length > 0 && (
              <div className="mcp-section">
                {hasAny && <p className="mcp-section-label">Custom</p>}
                {customServers.map((s) => (
                  <McpServerItem
                    key={s.id}
                    server={s}
                    onToggle={() => onToggle(s.id)}
                    onEdit={() => onEdit(s)}
                    onDelete={() => onDelete(s.id)}
                  />
                ))}
              </div>
            )}

            {/* ── Add custom server ── */}
            <div className="mcp-panel-footer">
              <button type="button" className="mcp-add-btn" onClick={onAdd}>
                <Plus size={12} strokeWidth={2} />
                Add Custom Server
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
