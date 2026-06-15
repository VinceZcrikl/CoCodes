/** Ink-brush samurai pose library + random choreography.
 *
 *  Each pose is a tiny silhouette authored in a 64×48 viewBox (centred on
 *  x=32, ground near y=44). Filled shapes use `currentColor` (ink); the katana
 *  is the `.warrior-blade` stroked path so it reads as a thin blade. The
 *  `WarriorDojo` component cross-fades between poses and tweens position, so
 *  the discrete frames read as one continuous flurry.
 *
 *  Choreography is a weighted, near-Markov walk: `nextPose()` picks the next
 *  frame from a per-mood weight table (no fixed sequence), guarded so the
 *  fighter must `draw` before it can swing. */
import type { ReactNode } from "react";
import type { WarriorMood } from "../../../state/warriorActivity";

export type PoseId =
  | "idle"
  | "ready"
  | "draw"
  | "slashDown"
  | "slashSide"
  | "thrust"
  | "parry"
  | "dash"
  | "sheathe"
  | "bow"
  | "kneel"
  | "zen";

export interface Pose {
  id: PoseId;
  /** false = blade sheathed; must `draw` before an attack pose. */
  drawn: boolean;
  /** swings the blade → spawns a sword-trail. */
  attack?: boolean;
  /** trail flavour; CSS rotates the arc to match the cut. */
  trail?: "down" | "side" | "thrust";
  /** resting drift across the stage (viewBox px), tweened between poses. */
  dx?: number;
  /** hold range (ms) before mood/intensity tempo scaling. */
  hold: [number, number];
  /** silhouette geometry. */
  svg: ReactNode;
}

/** Head + topknot, shared by most upright poses. */
function Head({ x, y }: { x: number; y: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={3} />
      <circle cx={x - 1.5} cy={y - 2.6} r={1.3} />
    </>
  );
}

export const POSES: Record<PoseId, Pose> = {
  idle: {
    id: "idle",
    drawn: false,
    hold: [1400, 2600],
    svg: (
      <>
        <Head x={32} y={12} />
        <path d="M29 15 L35 15 L34 29 L30 29 Z" />
        <path d="M30 29 L28 43 L31 43 L31.5 29.5 Z" />
        <path d="M33 29 L35 43 L38 43 L34 29 Z" />
        <path d="M30 17 L27 27 L29 27 L31 18 Z" />
        <path d="M34 17 L37 26 L39 26 L35 18 Z" />
        <path className="warrior-blade" d="M37 26 L41 41" />
      </>
    ),
  },

  ready: {
    id: "ready",
    drawn: true,
    hold: [600, 1100],
    svg: (
      <>
        <Head x={30} y={13} />
        <path d="M27 16 L33 16 L33 28 L28 28 Z" />
        <path d="M28 28 L24 42 L27 42 L30 29 Z" />
        <path d="M31 28 L35 42 L38 42 L33 29 Z" />
        <path d="M32 18 L40 22 L41 24 L33 21 Z" />
        <circle cx={40} cy={23} r={1.2} />
        <path className="warrior-blade" d="M40 23 L52 14" />
      </>
    ),
  },

  draw: {
    id: "draw",
    drawn: true,
    attack: true,
    trail: "side",
    hold: [240, 420],
    svg: (
      <>
        <Head x={30} y={13} />
        <path d="M27 16 L33 17 L33 29 L28 28 Z" />
        <path d="M28 28 L25 42 L28 42 L30 29 Z" />
        <path d="M31 28 L34 42 L37 42 L33 29 Z" />
        <path d="M31 18 L22 12 L21 14 L31 20 Z" />
        <path className="warrior-blade" d="M22 13 L41 9" />
      </>
    ),
  },

  slashDown: {
    id: "slashDown",
    drawn: true,
    attack: true,
    trail: "down",
    hold: [220, 360],
    svg: (
      <>
        <Head x={31} y={14} />
        <path d="M28 17 L34 17 L34 29 L29 29 Z" />
        <path d="M29 29 L26 43 L29 43 L31 30 Z" />
        <path d="M32 30 L36 43 L39 43 L34 29 Z" />
        <path d="M32 18 L38 16 L40 18 L33 20 Z" />
        <path className="warrior-blade" d="M38 15 L49 30" />
      </>
    ),
  },

  slashSide: {
    id: "slashSide",
    drawn: true,
    attack: true,
    trail: "side",
    hold: [220, 360],
    svg: (
      <>
        <Head x={31} y={13} />
        <path d="M28 16 L34 16 L34 28 L29 28 Z" />
        <path d="M29 28 L25 42 L28 42 L31 29 Z" />
        <path d="M32 29 L37 42 L40 42 L34 28 Z" />
        <path d="M33 18 L40 19 L41 21 L33 21 Z" />
        <path className="warrior-blade" d="M40 20 L57 20" />
      </>
    ),
  },

  thrust: {
    id: "thrust",
    drawn: true,
    attack: true,
    trail: "thrust",
    dx: 2,
    hold: [240, 380],
    svg: (
      <>
        <Head x={30} y={14} />
        <path d="M27 17 L33 16 L34 27 L28 27 Z" />
        <path d="M28 27 L20 40 L23 41 L30 28 Z" />
        <path d="M32 28 L37 41 L40 41 L34 28 Z" />
        <path d="M33 19 L42 21 L43 22 L33 21 Z" />
        <path className="warrior-blade" d="M42 21 L59 22" />
      </>
    ),
  },

  parry: {
    id: "parry",
    drawn: true,
    hold: [360, 560],
    svg: (
      <>
        <Head x={31} y={15} />
        <path d="M28 18 L34 18 L34 29 L29 29 Z" />
        <path d="M29 29 L26 43 L29 43 L31 30 Z" />
        <path d="M32 30 L36 43 L39 43 L34 29 Z" />
        <path d="M30 19 L34 11 L36 11 L33 19 Z" />
        <path className="warrior-blade" d="M26 9 L46 9" />
      </>
    ),
  },

  dash: {
    id: "dash",
    drawn: true,
    hold: [300, 460],
    svg: (
      <>
        <Head x={33} y={14} />
        <path d="M30 17 L36 15 L36 26 L31 27 Z" />
        <path d="M31 27 L25 39 L28 40 L33 28 Z" />
        <path d="M34 27 L40 38 L43 38 L36 27 Z" />
        <path d="M30 19 L22 24 L23 26 L31 21 Z" />
        <path className="warrior-blade" d="M22 25 L12 33" />
      </>
    ),
  },

  sheathe: {
    id: "sheathe",
    drawn: false,
    hold: [500, 800],
    svg: (
      <>
        <Head x={31} y={13} />
        <path d="M28 16 L34 16 L34 29 L29 29 Z" />
        <path d="M29 29 L27 43 L30 43 L31 30 Z" />
        <path d="M33 30 L35 43 L38 43 L34 29 Z" />
        <path d="M30 18 L27 27 L29 27 L31 19 Z" />
        <path className="warrior-blade" d="M27 27 L33 40" />
      </>
    ),
  },

  bow: {
    id: "bow",
    drawn: false,
    hold: [900, 1400],
    svg: (
      <>
        <circle cx={38} cy={20} r={3} />
        <circle cx={36} cy={18} r={1.3} />
        <path d="M30 22 L40 23 L39 26 L29 25 Z" />
        <path d="M29 25 L27 43 L30 43 L31 25 Z" />
        <path d="M33 25 L35 43 L38 43 L35 25 Z" />
        <path d="M39 24 L43 33 L41 34 L37 25 Z" />
        <path className="warrior-blade" d="M41 33 L46 42" />
      </>
    ),
  },

  kneel: {
    id: "kneel",
    drawn: false,
    hold: [1200, 1800],
    svg: (
      <>
        <circle cx={33} cy={20} r={3} />
        <circle cx={31} cy={18} r={1.3} />
        <path d="M30 22 L36 22 L35 31 L30 30 Z" />
        <path d="M30 30 L25 41 L28 43 L32 31 Z" />
        <path d="M33 31 L36 38 L41 43 L36 39 Z" />
        <path d="M34 24 L40 33 L39 35 L33 26 Z" />
        <path className="warrior-blade" d="M40 24 L40 43" />
      </>
    ),
  },

  zen: {
    id: "zen",
    drawn: false,
    hold: [2000, 3600],
    svg: (
      <>
        <Head x={32} y={18} />
        <path d="M29 21 L35 21 L36 31 L28 31 Z" />
        <path d="M24 31 L40 31 L40 36 L24 36 Z" />
        <path d="M28 24 L25 31 L27 32 L30 26 Z" />
        <path d="M36 24 L39 31 L37 32 L34 26 Z" />
        <path className="warrior-blade" d="M24 34 L40 34" />
      </>
    ),
  },
};

/** Per-mood candidate weights — the source of the unpredictable choreography. */
const MOOD_WEIGHTS: Record<WarriorMood, Partial<Record<PoseId, number>>> = {
  zen: { zen: 7, idle: 2, bow: 1 },
  idle: { idle: 5, ready: 2, sheathe: 2, draw: 1 },
  alert: { ready: 4, draw: 2, slashSide: 2, thrust: 1, parry: 1, dash: 1, sheathe: 1 },
  combat: { slashDown: 3, slashSide: 3, thrust: 3, parry: 2, dash: 2, draw: 1, ready: 1 },
  finish: { bow: 2, kneel: 1, sheathe: 1 },
};

/** Weighted random pick, optionally excluding one key (to avoid dull repeats). */
export function pickWeighted<T extends string>(
  weights: Partial<Record<T, number>>,
  exclude?: T,
): T {
  const entries = (Object.entries(weights) as [T, number][]).filter(
    ([k, w]) => w > 0 && k !== exclude,
  );
  if (entries.length === 0) return exclude ?? (Object.keys(weights)[0] as T);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** Choose the next pose for the current mood. Guards: must `draw` before an
 *  attack; avoid repeating the exact frame (except attack flurries in combat). */
export function nextPose(current: PoseId, mood: WarriorMood, drawn: boolean): PoseId {
  const table = MOOD_WEIGHTS[mood] ?? MOOD_WEIGHTS.idle;
  let pick = pickWeighted(table);
  if (pick === current && !(mood === "combat" && POSES[pick].attack)) {
    pick = pickWeighted(table, current);
  }
  if (!drawn && POSES[pick].attack) return "draw";
  return pick;
}

/** Hold time for a pose, scaled by mood + output intensity (combat = faster). */
export function holdFor(pose: PoseId, mood: WarriorMood, intensity: number): number {
  const [min, max] = POSES[pose].hold;
  const base = min + Math.random() * (max - min);
  const tempo =
    mood === "combat"
      ? 0.62 - intensity * 0.18
      : mood === "alert"
        ? 0.85
        : mood === "zen"
          ? 1.5
          : 1.05;
  return Math.max(150, Math.round(base * tempo));
}
