/** A required environment-variable field for an MCP preset. */
export interface McpEnvField {
  /** The env var name written into the config (e.g. "CLIENT_ID"). */
  key: string;
  /** Human-readable label shown in the form. */
  label: string;
  placeholder?: string;
  hint?: string;
  /** True if this is a secret (renders as password input). */
  secret?: boolean;
}

/** One-time auth step shown after saving the preset (e.g. xurl OAuth). */
export interface McpAuthStep {
  /** Short title shown as the step heading. */
  title: string;
  /** One-sentence description shown below the title. */
  description: string;
  /** Button label. */
  buttonLabel: string;
  /** Command to run (opened in a new terminal window). */
  command: string;
  args: string[];
}

/** A built-in MCP server preset — fills every field except the API keys. */
export interface McpPreset {
  /** Stable identifier stored in McpServer.presetKey. */
  key: string;
  name: string;
  description: string;
  /** Icon emoji shown in the panel list. */
  icon: string;
  command: string;
  args: string[];
  /** Fixed env vars baked into the preset (non-secret, non-user-editable). */
  staticEnv?: Record<string, string>;
  /** Extra top-level config fields merged into the mcpServers entry (e.g. startup_timeout_sec). */
  extraConfig?: Record<string, unknown>;
  /** Fields the user must fill in (API keys, credentials). */
  envFields: McpEnvField[];
  /** URL to the developer portal / API key page — opens in system browser. */
  keyUrl?: string;
  /** One-time setup step shown after first save (e.g. OAuth browser flow). */
  authStep?: McpAuthStep;
  /**
   * Guidance folded into the persona system prompt while this server is
   * enabled, so the model prefers these tools over a web-search fallback
   * without the user re-stating it every turn.
   */
  usageHint?: string;
}

export const MCP_PRESETS: McpPreset[] = [
  {
    key: "x-api",
    name: "X API",
    description: "Access X posts, search, bookmarks and trends",
    icon: "𝕏",
    command: "npx",
    args: ["-y", "@xdevplatform/xurl", "mcp", "https://api.x.com/mcp"],
    // xurl opens a browser for OAuth on first run — needs generous timeout.
    extraConfig: { startup_timeout_sec: 300 },
    envFields: [
      {
        key: "CLIENT_ID",
        label: "Client ID",
        placeholder: "Your X App Client ID",
        hint: "Found in your X Developer App settings.",
      },
      {
        key: "CLIENT_SECRET",
        label: "Client Secret",
        placeholder: "Your X App Client Secret",
        secret: true,
        hint: "Keep this private — stored locally, never sent to CoCodes servers.",
      },
    ],
    keyUrl: "https://developer.x.com/en/portal/dashboard",
    usageHint:
      "The **x-api** MCP server (X / Twitter) is connected. For any request " +
      "about X/Twitter — searching posts, a user's tweets, trends, timelines, " +
      "mentions, bookmarks, or posting — use its tools directly. Do NOT " +
      "substitute a web search unless an x-api tool actually returns an error; " +
      "if one does, say so explicitly before falling back.",
    authStep: {
      title: "Authorize X API (one-time)",
      description: "xurl opens a browser so you can log in with your X account. This only happens once — tokens are cached locally.",
      buttonLabel: "Authorize in Browser",
      command: "npx",
      args: ["-y", "@xdevplatform/xurl", "mcp", "https://api.x.com/mcp"],
    },
  },
];

/** Build the mcpServers config object for a preset given the user-supplied env values. */
export function buildPresetConfig(
  preset: McpPreset,
  envValues: Record<string, string>,
): Record<string, unknown> {
  const env: Record<string, string> = { ...preset.staticEnv };
  for (const field of preset.envFields) {
    const val = envValues[field.key] ?? "";
    if (val) env[field.key] = val;
  }
  const cfg: Record<string, unknown> = {
    command: preset.command,
    args: preset.args,
  };
  if (Object.keys(env).length) cfg.env = env;
  // Merge any extra top-level fields from the preset (e.g. startup_timeout_sec).
  if (preset.extraConfig) Object.assign(cfg, preset.extraConfig);
  return cfg;
}

/** Extract env var values from a saved server config for a given preset. */
export function extractEnvValues(
  preset: McpPreset,
  config: Record<string, unknown>,
): Record<string, string> {
  const env = (config.env ?? {}) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const field of preset.envFields) {
    out[field.key] = env[field.key] ?? "";
  }
  return out;
}
