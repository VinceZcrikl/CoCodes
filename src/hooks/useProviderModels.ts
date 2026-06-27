import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Fetch a provider's live model list from its OpenAI-compatible `…/models`
 *  endpoint (via the backend, to avoid CORS and keep the key server-side) and
 *  merge it ahead of the static `fallback` list. Until a successful fetch, the
 *  fallback is used unchanged, so the dropdown always has sensible options. */
export function useProviderModels(fallback: string[]) {
  const [live, setLive] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (
      modelsUrl: string | null,
      providerId: string | undefined,
      token: string | undefined,
    ): Promise<string[] | null> => {
      if (!modelsUrl) return null;
      setLoading(true);
      setError(null);
      try {
        const ids = await invoke<string[]>("provider_models", {
          modelsUrl,
          providerId: providerId ?? null,
          token: token?.trim() ? token.trim() : null,
        });
        if (ids.length) {
          setLive(ids);
          return ids;
        }
        setError("No models returned");
        return null;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /** Drop any fetched list (e.g. when switching to a different provider). */
  const reset = useCallback(() => {
    setLive(null);
    setError(null);
    setLoading(false);
  }, []);

  const models = useMemo(
    () => (live ? [...new Set([...live, ...fallback])] : fallback),
    [live, fallback],
  );

  return { models, live, loading, error, refresh, reset };
}
