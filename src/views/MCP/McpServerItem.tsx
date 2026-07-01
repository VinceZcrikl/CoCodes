import { Pencil, Trash2 } from "lucide-react";
import type { McpServer } from "../../hooks/useMcp";

interface Props {
  server: McpServer;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Command preview: first meaningful token from the config. */
function commandPreview(config: Record<string, unknown>): string {
  const cmd = typeof config.command === "string" ? config.command : "";
  const args = Array.isArray(config.args) ? (config.args as unknown[]).map(String) : [];
  const parts = [cmd, ...args].filter(Boolean);
  const full = parts.join(" ");
  return full.length > 44 ? full.slice(0, 41) + "…" : full;
}

export default function McpServerItem({ server, onToggle, onEdit, onDelete }: Props) {
  const preview = commandPreview(server.config);

  return (
    <div className={`mcp-server-item${server.enabled ? " enabled" : ""}`}>
      <button
        type="button"
        className="mcp-server-main"
        onClick={onEdit}
        aria-label={`Edit ${server.name}`}
      >
        <span className={`mcp-server-dot${server.enabled ? " on" : ""}`} aria-hidden="true" />
        <span className="mcp-server-info">
          <span className="mcp-server-name">{server.name}</span>
          {preview && <span className="mcp-server-cmd">{preview}</span>}
        </span>
      </button>

      <div className="mcp-server-actions">
        <button
          type="button"
          className="mcp-item-btn"
          onClick={onEdit}
          title="Edit"
          aria-label={`Edit ${server.name}`}
        >
          <Pencil size={12} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="mcp-item-btn danger"
          onClick={onDelete}
          title="Delete"
          aria-label={`Delete ${server.name}`}
        >
          <Trash2 size={12} strokeWidth={1.9} />
        </button>

        {/* Toggle switch */}
        <button
          type="button"
          className={`mcp-toggle${server.enabled ? " on" : ""}`}
          onClick={onToggle}
          role="switch"
          aria-checked={server.enabled}
          aria-label={server.enabled ? "Disable" : "Enable"}
          title={server.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
        >
          <span className="mcp-toggle-thumb" />
        </button>
      </div>
    </div>
  );
}
