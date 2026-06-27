import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

interface ModelActivity {
  /** "codex" (per proxied request) or "claude" (per session launch). */
  cli: string;
  provider: string;
  model: string;
}

/** Tracks the backend's `model-activity` pulses — emitted whenever a switched
 *  base model is actually used (every Codex proxy request; each Claude session
 *  launch). `live` stays true for a short window after each pulse so the cockpit
 *  can blink a "this model is really running" indicator, no logs required. */
export function useModelActivity(windowMs = 2600) {
  const [model, setModel] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timer = useRef<number>(0);

  useEffect(() => {
    const p = listen<ModelActivity>("model-activity", (e) => {
      setModel(e.payload?.model ?? null);
      setLive(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLive(false), windowMs);
    });
    return () => {
      window.clearTimeout(timer.current);
      void p.then((fn) => fn());
    };
  }, [windowMs]);

  return { model, live };
}
