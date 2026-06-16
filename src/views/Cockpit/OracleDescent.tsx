import { useEffect, useMemo, useRef } from "react";

/** Gold + olive leaf tones for the descending laurel. */
const LEAF_COLORS = ["#e8c879", "#f3d98a", "#c9a24a", "#d8b86a", "#a8a55e"];

interface Leaf {
  id: number;
  left: number; // %
  dx: number; // vw horizontal drift
  rot: number; // deg total tumble
  delay: number; // ms
  dur: number; // ms
  size: number; // px
  color: string;
}

function buildLeaves(): Leaf[] {
  const out: Leaf[] = [];
  for (let i = 0; i < 22; i++) {
    out.push({
      id: i,
      left: Math.round(Math.random() * 100),
      dx: Math.round((Math.random() * 2 - 1) * 18),
      rot: Math.round(220 + Math.random() * 520) * (Math.random() < 0.5 ? -1 : 1),
      delay: Math.round(Math.random() * 360),
      dur: Math.round(1700 + Math.random() * 700),
      size: 9 + Math.round(Math.random() * 7),
      color: LEAF_COLORS[i % LEAF_COLORS.length],
    });
  }
  return out;
}

/** "Oracle Descent" — the Theoi · Olympus celebration. Golden laurel/olive
 *  leaves drift down from the top while a soft Olympian light blooms from above.
 *  Mounts briefly, then calls `onDone` to unmount. Pointer-events-none and fully
 *  suppressed under `prefers-reduced-motion`. (Mirrors GoalConfetti's shape.) */
export default function OracleDescent({ onDone }: { onDone: () => void }) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Compute the leaves exactly once so re-renders don't reshuffle them.
  const leavesRef = useRef<Leaf[] | null>(null);
  if (leavesRef.current === null) leavesRef.current = reduced ? [] : buildLeaves();
  const leaves = leavesRef.current;

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    // Longest leaf (delay 360 + dur 2400) + margin.
    const t = window.setTimeout(onDone, 2900);
    return () => window.clearTimeout(t);
  }, [reduced, onDone]);

  if (reduced) return null;

  return (
    <div className="theoi-descent" aria-hidden="true">
      <div className="theoi-bloom" />
      {leaves.map((p) => (
        <span
          key={p.id}
          className="theoi-leaf"
          style={{
            left: `${p.left}%`,
            ["--dx" as string]: `${p.dx}vw`,
            ["--rot" as string]: `${p.rot}deg`,
            ["--delay" as string]: `${p.delay}ms`,
            ["--dur" as string]: `${p.dur}ms`,
            ["--sz" as string]: `${p.size}px`,
          }}
        >
          <svg viewBox="0 0 12 12" width="100%" height="100%" fill="none" aria-hidden="true">
            <path
              d="M6 0.5 C 9 3.5, 9 8.5, 6 11.5 C 3 8.5, 3 3.5, 6 0.5 Z"
              fill={p.color}
            />
            <path d="M6 1.5 L6 10.5" stroke="rgba(40,30,8,0.28)" strokeWidth="0.5" />
          </svg>
        </span>
      ))}
    </div>
  );
}
