import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface McpServer {
  id: string;
  name: string;
  /** Raw mcpServers entry — the JSON object stored under one key in client configs. */
  config: Record<string, unknown>;
  enabled: boolean;
  /** Links this server to a built-in preset key (e.g. "x-api"). */
  presetKey?: string;
  /** Guidance folded into the persona system prompt while enabled, so the
   *  model prefers this server's tools over a web-search fallback. */
  usageHint?: string;
}

export function useMcp() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const list = await invoke<McpServer[]>("mcp_list");
      setServers(list);
    } catch (e) {
      console.error("mcp_list failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const save = useCallback(async (updated: McpServer[]) => {
    await invoke("mcp_save", { servers: updated });
    setServers(updated);
  }, []);

  const toggle = useCallback(async (id: string) => {
    const updated = servers.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s,
    );
    await save(updated);
  }, [servers, save]);

  const upsert = useCallback(async (server: McpServer) => {
    const exists = servers.some((s) => s.id === server.id);
    const updated = exists
      ? servers.map((s) => (s.id === server.id ? server : s))
      : [...servers, server];
    await save(updated);
  }, [servers, save]);

  const remove = useCallback(async (id: string) => {
    await save(servers.filter((s) => s.id !== id));
  }, [servers, save]);

  const applyToClients = useCallback(async (
    server: McpServer,
    clientIds: string[],
    cwd?: string,
  ): Promise<string[]> => {
    return invoke<string[]>("mcp_apply_to_clients", {
      server,
      clientIds,
      cwd: cwd ?? null,
    });
  }, []);

  return { servers, loading, reload, toggle, upsert, remove, applyToClients };
}
