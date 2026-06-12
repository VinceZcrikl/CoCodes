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
  /** Base-model provider preset id, or null → default Claude subscription.
   *  Only meaningful for the "claude" CLI. */
  base_model?: string | null;
  /** SOUL application: "replace" swaps Claude Code's system prompt entirely;
   *  anything else (default) appends. Only meaningful for the "claude" CLI. */
  prompt_mode?: string | null;
}

/** A base-model provider preset (Anthropic-compatible endpoint). Mirrors the
 *  Rust `providers::Provider`; secret-free — `has_token` flags whether a token
 *  is stored in ~/.openterminus/.env. */
export interface Provider {
  id: string;
  label: string;
  base_url: string;
  model: string;
  small_fast_model: string | null;
  has_token: boolean;
}

/** Thin wrapper over the persona_* backend commands. Personas are app-owned
 *  dirs under ~/.openterminus/personas; the active one is injected into the
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
 *  base-model presets under ~/.openterminus/providers.json; a persona may point
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
