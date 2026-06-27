import type { Provider } from "../../hooks/usePersonas";

/** A one-click provider preset. Picking one fills every field but the API key
 *  from the vendor's official Claude-Code / Anthropic-compatible docs, so the
 *  user only pastes their key. `keyUrl` is where that key is issued. */
export interface ProviderPreset {
  key: string;
  label: string;
  id: string;
  base_url: string;
  /** The recommended (default) model — must be one of `models`. */
  model: string;
  /** Selectable models for this provider, shown as a dropdown in the form. The
   *  picker also offers a "Custom…" escape hatch for ids not listed here. */
  models: string[];
  small_fast_model: string | null;
  keyUrl: string;
  /** OpenAI/Codex wire protocol ("chat" | "responses"); set on Codex presets,
   *  omitted on Anthropic ones. */
  wire_api?: string | null;
  /** A local endpoint (Ollama, LM Studio) that needs no API key — the picker
   *  configures it in one click and never shows "needs key". */
  local?: boolean;
  /** Codex model metadata (Codex presets) — silences "Model metadata not found"
   *  and fixes compaction/limits for the custom slug. */
  context_window?: number | null;
  max_output_tokens?: number | null;
  /** OpenAI-compatible `…/models` endpoint used to refresh the dropdown with the
   *  vendor's live model list. Set when it differs from `<base_url>/models` (e.g.
   *  Kimi's coding base URL is not where its model list lives). When omitted, a
   *  `/v1` base URL derives `<base_url>/models` automatically. */
  models_url?: string | null;
}

/** The OpenAI-compatible model-list endpoint for a provider, or null when none
 *  can be derived (so the static `models` list is used as-is). */
export function effectiveModelsUrl(p: {
  models_url?: string | null;
  base_url: string;
}): string | null {
  if (p.models_url) return p.models_url;
  const b = p.base_url.replace(/\/+$/, "");
  return b.endsWith("/v1") ? `${b}/models` : null;
}

/** Verified against each vendor's official Claude-Code integration docs
 *  (2026-06): base URL = the Anthropic-compatible endpoint, model = the
 *  recommended coding model. This is the canonical set of supported base-model
 *  providers — the base-model picker shows all of them, configured or not. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: "kimi",
    label: "Kimi (Moonshot)",
    id: "kimi",
    // Moonshot's Anthropic-compatible endpoint (works with a platform key from
    // platform.moonshot.ai). NOTE: this is NOT api.kimi.com/coding — that's the
    // separate Kimi-Code subscription service with its own keys.
    base_url: "https://api.moonshot.ai/anthropic",
    // Only list models that work with Claude Code's direct connection. The
    // `*-code` models (kimi-k2.7-code…) REQUIRE `thinking:{type:"enabled"}` on
    // every request and 400 otherwise — Claude Code doesn't send thinking on
    // normal/background turns and there's no proxy on the Claude path to inject
    // it, so they're unusable here. k2.6 / k2.5 work unconditionally.
    model: "kimi-k2.6",
    models: ["kimi-k2.6", "kimi-k2.5"],
    models_url: "https://api.moonshot.ai/v1/models",
    small_fast_model: null,
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
  },
  {
    key: "zhipu",
    label: "Zhipu GLM (Z.ai)",
    id: "zhipu",
    // docs.z.ai — Claude Code endpoint; Opus/Sonnet → glm-4.7, Haiku → glm-4.5-air.
    base_url: "https://api.z.ai/api/anthropic",
    model: "glm-4.7",
    models: ["glm-4.7", "glm-4.6", "glm-4.5-air"],
    small_fast_model: "glm-4.5-air",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
  },
  {
    key: "stepfun",
    label: "StepFun (阶跃星辰)",
    id: "stepfun",
    // platform.stepfun.ai — Step Plan Claude Code endpoint; step-3.7-flash is
    // the latest agentic coding model.
    base_url: "https://api.stepfun.ai/step_plan",
    model: "step-3.7-flash",
    models: ["step-3.7-flash", "step-3.7"],
    small_fast_model: null,
    keyUrl: "https://platform.stepfun.ai",
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    id: "deepseek",
    base_url: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    small_fast_model: null,
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
];

/** Codex base-model providers — OpenAI-compatible endpoints the embedded
 *  `codex` CLI can target instead of ChatGPT/OpenAI. Defined per OpenAI's
 *  Codex "OSS mode & local providers" docs: local runtimes (Ollama, LM Studio)
 *  need no key; cloud endpoints expose an OpenAI-style `/v1` base URL. `wire_api`
 *  is "chat" for the broadest compatibility ("responses" only where supported). */
export const CODEX_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: "ollama",
    label: "Ollama (local)",
    id: "ollama-oss",
    // Codex `--oss` default; gpt-oss:20b is the recommended local coding model.
    base_url: "http://localhost:11434/v1",
    model: "gpt-oss:20b",
    models: ["gpt-oss:20b", "gpt-oss:120b", "qwen2.5-coder:32b"],
    small_fast_model: null,
    wire_api: "chat",
    local: true,
    context_window: 131072,
    max_output_tokens: 32768,
    keyUrl: "https://ollama.com/download",
  },
  {
    key: "lmstudio",
    label: "LM Studio (local)",
    id: "lmstudio-oss",
    base_url: "http://localhost:1234/v1",
    model: "gpt-oss-20b",
    models: ["gpt-oss-20b", "gpt-oss-120b", "qwen2.5-coder-32b"],
    small_fast_model: null,
    wire_api: "chat",
    local: true,
    context_window: 131072,
    max_output_tokens: 32768,
    keyUrl: "https://lmstudio.ai",
  },
  {
    key: "deepseek-codex",
    label: "DeepSeek",
    id: "deepseek-codex",
    // platform.deepseek.com — OpenAI-compatible endpoint (note: `/v1`, vs the
    // `/anthropic` endpoint the claude preset uses).
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    small_fast_model: null,
    wire_api: "chat",
    // DeepSeek V4: 128K context, 8K max output.
    context_window: 131072,
    max_output_tokens: 8192,
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
];

/** Filesystem/env-safe provider id derived from a label — mirrors the backend's
 *  `sanitize_provider_id` (lowercased alphanumerics + dash/underscore). Lets the
 *  form auto-fill the Id so users never see that field. */
export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The sentinel dropdown value for "fill nothing, I'll type it myself". */
export const CUSTOM_PRESET = "";

/** An empty provider draft for the "Custom (enter manually)" path. `wire_api`
 *  is filled per-CLI by the form (null for claude, "chat" for codex). */
export const BLANK_PROVIDER: Provider = {
  id: "",
  label: "",
  base_url: "",
  model: "",
  small_fast_model: null,
  wire_api: null,
  context_window: null,
  max_output_tokens: null,
  has_token: false,
};

export function draftFromPreset(p: ProviderPreset): Provider {
  return {
    id: p.id,
    label: p.label,
    base_url: p.base_url,
    model: p.model,
    small_fast_model: p.small_fast_model,
    wire_api: p.wire_api ?? null,
    context_window: p.context_window ?? null,
    max_output_tokens: p.max_output_tokens ?? null,
    has_token: false,
  };
}
