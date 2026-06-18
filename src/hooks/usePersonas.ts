import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

const PERSONAS_CHANGED = "personas:changed";

export interface PersonaSummary {
  id: string;
  name: string;
  avatar: string;
  soulPreview: string;
  /** Preferred CLI for this persona: "claude" | "codex" | "grok" */
  cli: string;
}

export interface PersonaDoc {
  id: string;
  name: string;
  avatar: string;
  soul: string;
  memory: string;
  user: string;
  /** Preferred CLI for this persona: "claude" | "codex" | "grok" */
  cli: string;
  /** Base-model provider preset id, or null → the CLI's default (Claude
   *  subscription / ChatGPT login). Meaningful for the "claude" and "codex"
   *  CLIs; the chosen provider's kind must match the CLI. */
  base_model?: string | null;
  /** SOUL application: "replace" swaps Claude Code's system prompt entirely;
   *  anything else (default) appends. Only meaningful for the "claude" CLI. */
  prompt_mode?: string | null;
}

/** A base-model provider preset (Anthropic-compatible endpoint). Mirrors the
 *  Rust `providers::Provider`; secret-free — `has_token` flags whether a token
 *  is stored in ~/.cocodes/.env. */
export interface Provider {
  id: string;
  label: string;
  base_url: string;
  model: string;
  small_fast_model: string | null;
  /** OpenAI/Codex wire protocol ("chat" | "responses"); null on Anthropic
   *  (claude) providers. Its presence marks a provider as a Codex one. */
  wire_api?: string | null;
  has_token: boolean;
}

/** CLI group order for displaying personas — Claude first (it owns the default
 *  persona), then the rest matching the editor's CLI picker. Unknown CLIs last. */
export const CLI_ORDER = ["claude", "codex", "grok", "kimi"];

/** Human labels for each CLI group header. */
export const CLI_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
  kimi: "Kimi Code",
};

/** Normalized CLI key (legacy personas with no `cli` count as Claude). */
export const cliGroupKey = (cli: string) => cli || "claude";

/** The default persona is the fallback identity; it always leads its group. */
const DEFAULT_PERSONA_ID = "claude";

const cliRank = (cli: string) => {
  const i = CLI_ORDER.indexOf(cliGroupKey(cli));
  return i === -1 ? CLI_ORDER.length : i;
};

/** Stable sort that groups personas by CLI so each kind sits together; within a
 *  group order is preserved (so a newly created persona lands beside its CLI's
 *  peers) except the default persona, which leads the Claude group. */
export function sortPersonasByCli<T extends { id: string; cli: string }>(
  list: T[],
): T[] {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ra = cliRank(a.p.cli);
      const rb = cliRank(b.p.cli);
      if (ra !== rb) return ra - rb;
      const da = a.p.id === DEFAULT_PERSONA_ID ? 0 : 1;
      const db = b.p.id === DEFAULT_PERSONA_ID ? 0 : 1;
      if (da !== db) return da - db;
      return a.i - b.i;
    })
    .map(({ p }) => p);
}

/** Thin wrapper over the persona_* backend commands. Personas are app-owned
 *  dirs under ~/.cocodes/personas; the active one is injected into the
 *  embedded terminal as the system prompt. */
export function usePersonas() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<PersonaSummary[]>("persona_list");
      setPersonas(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("persona_list failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Keep every usePersonas instance (header, constellation, manager) in sync
    // when a persona is created / edited / deleted anywhere.
    const p = listen(PERSONAS_CHANGED, () => void refresh());
    return () => {
      void p.then((fn) => fn());
    };
  }, [refresh]);

  const get = useCallback(
    (id: string) => invoke<PersonaDoc>("persona_get", { id }),
    [],
  );
  const save = useCallback(async (doc: PersonaDoc) => {
    const id = await invoke<string>("persona_save", { doc });
    void emit(PERSONAS_CHANGED);
    return id;
  }, []);
  const remove = useCallback(async (id: string) => {
    await invoke("persona_delete", { id });
    void emit(PERSONAS_CHANGED);
  }, []);

  return { personas, loading, refresh, get, save, remove };
}

const PROVIDERS_CHANGED = "providers:changed";

/** Thin wrapper over the provider_* backend commands. Providers are app-owned
 *  base-model presets under ~/.cocodes/providers.json; a persona may point
 *  its embedded `claude` at one instead of the default Claude subscription. */
export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<Provider[]>("provider_list");
      setProviders(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("provider_list failed", e);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Keep every useProviders instance (editor dropdown, manager) in sync.
    const p = listen(PROVIDERS_CHANGED, () => void refresh());
    return () => {
      void p.then((fn) => fn());
    };
  }, [refresh]);

  const save = useCallback(
    async (provider: Provider, token: string | null) => {
      const saved = await invoke<Provider>("provider_save", { provider, token });
      void emit(PROVIDERS_CHANGED);
      return saved;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await invoke("provider_delete", { id });
    void emit(PROVIDERS_CHANGED);
  }, []);

  return { providers, refresh, save, remove };
}
