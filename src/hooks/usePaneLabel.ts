import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePersonas, useProviders } from "./usePersonas";

interface CommitProvider {
  id: string;
  label: string;
  model: string;
  hasToken: boolean;
}

/** Don't re-summarize a pane more often than this. AI labeling is a real LLM
 *  call; a busy pane can flap idle→busy repeatedly, so we rate-limit per pane. */
const REFRESH_COOLDOWN_MS = 20_000;

/** A pane needs at least this many transcript chars before an auto-label is
 *  worth generating — avoids labeling a pane that has only printed its banner. */
const MIN_TRANSCRIPT = 40;

/** Auto + manual AI task-labeling for one pane.
 *
 *  Watches the pane's busy→idle transitions: when output settles, it reads the
 *  terminal tail, asks the pane persona's provider for a short task label, and
 *  persists it via `onLabel`. `refresh()` forces a regeneration (the header's
 *  Sparkles button). Generation failures are surfaced via `error` and never
 *  clobber the existing label. */
export function usePaneLabel(opts: {
  terminalKey: string;
  profileId: string;
  busy: boolean;
  started: boolean;
  onLabel: (label: string) => void;
}) {
  const { terminalKey, profileId, busy, started, onLabel } = opts;
  const { get } = usePersonas();
  const { providers } = useProviders();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRunRef = useRef(0);
  const wasBusyRef = useRef(false);
  // Avoid overlapping runs (auto edge + manual click landing together).
  const inFlightRef = useRef(false);

  // Resolve the provider to summarize with: the pane persona's configured
  // base_model when it's usable, else the first usable provider on file. A
  // provider is usable if it has a token or is a local keyless endpoint — the
  // same rule the backend enforces, mirrored here to pick a sensible default.
  const resolveProviderId = useCallback(async (): Promise<string | null> => {
    let usable: CommitProvider[] = [];
    try {
      usable = await invoke<CommitProvider[]>("ai_commit_providers");
    } catch {
      return null;
    }
    if (usable.length === 0) return null;
    try {
      const doc = await get(profileId);
      const base = doc?.base_model;
      if (base && usable.some((p) => p.id === base)) return base;
    } catch {
      /* fall through to first usable */
    }
    return usable[0].id;
  }, [get, profileId, providers]);

  const run = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const transcript = await invoke<string>("terminal_tail", { id: terminalKey });
      if (transcript.trim().length < MIN_TRANSCRIPT) return; // nothing worth labeling yet
      const providerId = await resolveProviderId();
      if (!providerId) return; // no configured provider → silently skip
      const label = await invoke<string>("ai_summarize_terminal", {
        providerId,
        transcript,
      });
      if (label.trim()) {
        onLabel(label);
        lastRunRef.current = performance.now();
      }
    } catch (e) {
      const err = e as { message?: string } | string;
      setError(typeof err === "string" ? err : (err?.message ?? "labeling failed"));
    } finally {
      setPending(false);
      inFlightRef.current = false;
    }
  }, [terminalKey, resolveProviderId, onLabel]);

  // Auto: fire once on the busy→idle edge, throttled per pane.
  useEffect(() => {
    if (!started) return;
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (wasBusy && !busy) {
      if (performance.now() - lastRunRef.current >= REFRESH_COOLDOWN_MS) void run();
    }
  }, [busy, started, run]);

  // Manual: the header button ignores the cooldown but not an in-flight run.
  const refresh = useCallback(() => {
    void run();
  }, [run]);

  return { pending, error, refresh };
}
