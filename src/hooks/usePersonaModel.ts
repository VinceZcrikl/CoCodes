import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePersonas, useProviders, type PersonaDoc } from "./usePersonas";

/** Avatar, name and the real model label for a persona. We never fabricate a
 *  model name — it comes from a verifiable source or shows "default":
 *    base-model provider's model  → the model we actually inject, or
 *    the CLI's own configured model (claude settings.json / codex config.toml), or
 *    "default" when the CLI picks dynamically and nothing is pinned.
 *  (A hardcoded per-CLI guess used to drift from reality, e.g. claude showing
 *  "Opus 4.8" while Claude Code ran something else.) */
export function usePersonaModel(profileId: string, cliHint?: string) {
  const { personas, get } = usePersonas();
  const { providers } = useProviders();
  const summary = personas.find((p) => p.id === profileId);

  // Full doc gives us base_model; refetched when the persona list changes (i.e.
  // after an edit) so a base-model switch reflects without a restart.
  const [doc, setDoc] = useState<PersonaDoc | null>(null);
  useEffect(() => {
    let cancelled = false;
    void get(profileId)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profileId, personas, get]);

  // The CLI's own configured default model (claude settings.json / codex
  // config.toml). null when the CLI picks dynamically with nothing pinned.
  const [claudeModel, setClaudeModel] = useState<string | null>(null);
  const [codexModel, setCodexModel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void invoke<string | null>("claude_default_model")
      .then((m) => !cancelled && setClaudeModel(m))
      .catch(() => {});
    void invoke<string | null>("codex_default_model")
      .then((m) => !cancelled && setCodexModel(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const cli = doc?.cli ?? summary?.cli ?? cliHint ?? "claude";
  const provider = doc?.base_model
    ? providers.find((p) => p.id === doc.base_model)
    : undefined;
  const cliModel = cli === "claude" ? claudeModel : cli === "codex" ? codexModel : null;
  const model = provider?.model || cliModel || "default";

  return {
    avatar: summary?.avatar ?? "",
    name: summary?.name ?? profileId,
    model,
    cli,
  };
}
