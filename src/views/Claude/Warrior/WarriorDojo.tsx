/** The "ink-scroll dojo" — a tiny hanging-scroll panel in the toolbar's right
 *  slot where a sumi-e samurai runs an endless, never-repeating set of katana
 *  stances. A weighted state machine (see `poses.tsx`) drives the choreography;
 *  `warriorActivity` feeds it the terminal's mood so the fighter reacts to what
 *  Claude is doing. Pure SVG + CSS — no canvas, no animation library. */
import { useCallback, useEffect, useRef, useState } from "react";
import { POSES, type PoseId, nextPose, holdFor } from "./poses";
import {
  subscribeWarrior,
  type WarriorCue,
  type WarriorState,
} from "../../../state/warriorActivity";

const PAUSE_KEY = "terminus.warrior.paused";

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function poseForCue(cue: WarriorCue): PoseId {
  switch (cue) {
    case "bow":
      return "bow";
    case "fall":
      return "kneel";
    case "deliver":
      return "dash";
    case "draw":
    default:
      return "draw";
  }
}

interface Props {
  /** "claude" | "codex" | "grok" — tints the scroll's seal. */
  cli?: string;
}

export default function WarriorDojo({ cli = "claude" }: Props) {
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(PAUSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [reduced, setReduced] = useState(reducedMotion);
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );

  const [pose, setPose] = useState<PoseId>("idle");
  const [prevPose, setPrevPose] = useState<PoseId>("idle");
  const [facing, setFacing] = useState<1 | -1>(1);
  const [dx, setDx] = useState(0);
  const [step, setStep] = useState(0);
  const [trail, setTrail] = useState<{ kind: "down" | "side" | "thrust"; key: number } | null>(
    null,
  );

  const poseRef = useRef<PoseId>("idle");
  const activityRef = useRef<WarriorState>({ mood: "idle", intensity: 0, cue: null, cueId: 0 });
  const lastCueRef = useRef(0);

  // Mirror gating flags into refs so the (stable) activity subscription can read
  // the latest values without being re-created.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  /** Switch to a pose, kicking off the cross-fade + (optional) sword-trail. */
  const applyPose = useCallback((next: PoseId, fromCue = false) => {
    setPrevPose(poseRef.current);
    poseRef.current = next;
    setPose(next);
    setStep((n) => n + 1);

    const p = POSES[next];
    setDx(p.dx ?? (next === "dash" ? (Math.random() < 0.5 ? -9 : 9) : 0));

    if (p.attack && p.trail) {
      const key = Date.now();
      const kind = p.trail;
      setTrail({ kind, key });
      window.setTimeout(() => setTrail((t) => (t && t.key === key ? null : t)), 460);
    } else if (next === "dash") {
      setTrail(null);
    }

    // Occasional facing flip keeps combat from looking like a loop.
    if (!fromCue && activityRef.current.mood === "combat" && Math.random() < 0.28) {
      setFacing((f) => (f === 1 ? -1 : 1));
    }
  }, []);

  // Subscribe to terminal activity. Mood/intensity are read from the ref by the
  // loop; cues interrupt the current frame immediately.
  useEffect(() => {
    const unsub = subscribeWarrior((s) => {
      activityRef.current = s;
      if (s.cueId !== lastCueRef.current) {
        lastCueRef.current = s.cueId;
        if (s.cue && !pausedRef.current && !reducedRef.current && !hiddenRef.current) {
          applyPose(poseForCue(s.cue), true);
        }
      }
    });
    return unsub;
  }, [applyPose]);

  // Track reduced-motion + tab visibility (pause the loop when hidden / reduced).
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMq = () => setReduced(mq?.matches ?? false);
    mq?.addEventListener?.("change", onMq);
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mq?.removeEventListener?.("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // The choreography loop: each step picks the next pose, then schedules itself
  // after a mood-scaled hold. Reads mood/intensity from the ref so it never has
  // to restart on activity changes.
  useEffect(() => {
    if (paused || reduced || hidden) return;
    let timer: number;
    const tick = () => {
      const { mood, intensity } = activityRef.current;
      const cur = poseRef.current;
      const next = nextPose(cur, mood, POSES[cur].drawn);
      applyPose(next);
      timer = window.setTimeout(tick, holdFor(next, mood, intensity));
    };
    timer = window.setTimeout(tick, 240);
    return () => window.clearTimeout(timer);
  }, [paused, reduced, hidden, applyPose]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const n = !p;
      try {
        localStorage.setItem(PAUSE_KEY, n ? "1" : "0");
      } catch {
        /* private mode — pause just won't persist */
      }
      return n;
    });
  }, []);

  return (
    <button
      type="button"
      className="warrior-dojo"
      data-cli={cli}
      onClick={togglePause}
      title={paused ? "武者已暂停 · 点击继续" : "点击暂停武者"}
      aria-label="Samurai animation"
      aria-pressed={paused}
    >
      <span className="warrior-rod warrior-rod-l" aria-hidden="true" />
      <svg className="warrior-stage" viewBox="0 0 64 48" aria-hidden="true">
        <g
          className="warrior-flip"
          style={{ transform: `translateX(${dx}px) scaleX(${facing})` }}
        >
          <g className="warrior-fig warrior-prev">{POSES[prevPose].svg}</g>
          <g className="warrior-fig warrior-cur" key={step}>
            {POSES[pose].svg}
          </g>
          {trail && (
            <path
              key={trail.key}
              className={`warrior-trail warrior-trail-${trail.kind}`}
              d="M 8 24 Q 32 6 56 24"
            />
          )}
        </g>
      </svg>
      <span className="warrior-rod warrior-rod-r" aria-hidden="true" />
      <span className="warrior-seal" aria-hidden="true" />
    </button>
  );
}
