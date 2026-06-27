import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePersonas, useProviders, type PersonaDoc } from "./usePersonas";

/** Fallback display model per CLI when no base-model provider is set (mirrors the
 *  cockpit's CLIS table). */
const CLI_DEFAULT_MODEL: Record<string, string> = {
  claude: "Opus 4.8",
  codex: "GPT-5.5",
  gemini: "Gemini 2.5 Pro",
  grok: "Grok 4",
  kimi: "Kimi K2.7",
};

/** Avatar, name and the real model label for a persona — the same resolution the
 *  cockpit header uses (base-model provider's model → claude's pinned model →
 *  the CLI's default), exposed for per-pane headers. */
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

  const [claudeModel, setClaudeModel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void invoke<string | null>("claude_default_model")
      .then((m) => {
        if (!cancelled) setClaudeModel(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const cli = doc?.cli ?? summary?.cli ?? cliHint ?? "claude";
  const provider = doc?.base_model
    ? providers.find((p) => p.id === doc.base_model)
    : undefined;
  const model =
    provider?.model ||
    (cli === "claude" ? claudeModel : null) ||
    CLI_DEFAULT_MODEL[cli] ||
    cli;

  return {
    avatar: summary?.avatar ?? "",
    name: summary?.name ?? profileId,
    model,
    cli,
  };
}
