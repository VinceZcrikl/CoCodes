import type { Provider } from "../../hooks/usePersonas";

/** A one-click provider preset. Picking one fills every field but the API key
 *  from the vendor's official Claude-Code / Anthropic-compatible docs, so the
 *  user only pastes their key. `keyUrl` is where that key is issued. */
export interface ProviderPreset {
  key: string;
  label: string;
  id: string;
  base_url: string;
  model: string;
  small_fast_model: string | null;
  keyUrl: string;
  /** OpenAI/Codex wire protocol ("chat" | "responses"); set on Codex presets,
   *  omitted on Anthropic ones. */
  wire_api?: string | null;
  /** A local endpoint (Ollama, LM Studio) that needs no API key — the picker
   *  configures it in one click and never shows "needs key". */
  local?: boolean;
}

/** Verified against each vendor's official Claude-Code integration docs
 *  (2026-06): base URL = the Anthropic-compatible endpoint, model = the
 *  recommended coding model. This is the canonical set of supported base-model
 *  providers — the base-model picker shows all of them, configured or not. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: "kimi",
    label: "Kimi (Kimi Code)",
    id: "kimi",
    // kimi.com/code/docs — kimi-for-coding is a stable alias auto-mapped to the
    // latest Kimi model server-side.
    base_url: "https://api.kimi.com/coding/",
    model: "kimi-for-coding",
    small_fast_model: null,
    keyUrl: "https://www.kimi.com/code",
  },
  {
    key: "zhipu",
    label: "Zhipu GLM (Z.ai)",
    id: "zhipu",
    // docs.z.ai — Claude Code endpoint; Opus/Sonnet → glm-4.7, Haiku → glm-4.5-air.
    base_url: "https://api.z.ai/api/anthropic",
    model: "glm-4.7",
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
    small_fast_model: null,
    keyUrl: "https://platform.stepfun.ai",
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    id: "deepseek",
    base_url: "https://api.deepseek.com/anthropic",
    model: "deepseek-chat",
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
    small_fast_model: null,
    wire_api: "chat",
    local: true,
    keyUrl: "https://ollama.com/download",
  },
  {
    key: "lmstudio",
    label: "LM Studio (local)",
    id: "lmstudio-oss",
    base_url: "http://localhost:1234/v1",
    model: "gpt-oss-20b",
    small_fast_model: null,
    wire_api: "chat",
    local: true,
    keyUrl: "https://lmstudio.ai",
  },
  {
    key: "deepseek-codex",
    label: "DeepSeek",
    id: "deepseek-codex",
    // platform.deepseek.com — OpenAI-compatible endpoint (note: `/v1`, vs the
    // `/anthropic` endpoint the claude preset uses).
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    small_fast_model: null,
    wire_api: "chat",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
];

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
    has_token: false,
  };
}
