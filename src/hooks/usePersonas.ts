import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

const PERSONAS_CHANGED = "personas:changed";

export interface PersonaSummary {
  id: string;
  name: string;
  avatar: string;
  soulPreview: string;
}

export interface PersonaDoc {
  id: string;
  name: string;
  avatar: string;
  soul: string;
  memory: string;
  user: string;
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
