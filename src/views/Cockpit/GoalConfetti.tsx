import { useEffect, useMemo, useRef } from "react";
import TriondaBall from "./TriondaBall";

/** Host-nation + trophy colors. */
const COLORS = ["#E4322B", "#1FA35A", "#2F6BD8", "#E8B23A"];

interface Piece {
  id: number;
  left: number; // %
  dx: number; // vw horizontal drift
  rot: number; // deg
  delay: number; // ms
  dur: number; // ms
  size: number; // px
  color: string;
  emoji: boolean;
}

function buildPieces(): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < 32; i++) {
    const emoji = i % 6 === 0; // ~1 in 6 is a ⚽
    out.push({
      id: i,
      left: Math.round(Math.random() * 100),
      dx: Math.round((Math.random() * 2 - 1) * 15),
      rot: Math.round(360 + Math.random() * 540),
      delay: Math.round(Math.random() * 280),
      dur: Math.round(1100 + Math.random() * 400),
      size: emoji ? 13 + Math.round(Math.random() * 5) : 6 + Math.round(Math.random() * 5),
      color: COLORS[i % COLORS.length],
      emoji,
    });
  }
  return out;
}

/** A one-shot goal celebration: a confetti burst in the host-nation colors (plus
 *  a few footballs) and a Trionda ball rolling across the header. Mounts briefly,
 *  then calls `onDone` to unmount itself. Pointer-events-none and fully
 *  suppressed under `prefers-reduced-motion`. */
export default function GoalConfetti({ onDone }: { onDone: () => void }) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Compute the pieces exactly once so re-renders don't reshuffle them.
  const piecesRef = useRef<Piece[] | null>(null);
  if (piecesRef.current === null) piecesRef.current = reduced ? [] : buildPieces();
  const pieces = piecesRef.current;

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    // Longest piece (delay 280 + dur 1500) + rolling ball (~1400) + margin.
    const t = window.setTimeout(onDone, 1700);
    return () => window.clearTimeout(t);
  }, [reduced, onDone]);

  if (reduced) return null;

  return (
    <div className="wc-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`wc-confetti-piece${p.emoji ? " is-emoji" : ""}`}
          style={{
            left: `${p.left}%`,
            ["--dx" as string]: `${p.dx}vw`,
            ["--rot" as string]: `${p.rot}deg`,
            ["--delay" as string]: `${p.delay}ms`,
            ["--dur" as string]: `${p.dur}ms`,
            ["--sz" as string]: `${p.size}px`,
            ...(p.emoji
              ? {}
              : { width: `${p.size}px`, height: `${p.size}px`, background: p.color }),
          }}
        >
          {p.emoji ? "⚽" : null}
        </span>
      ))}
      <span className="wc-confetti-ball">
        <TriondaBall />
      </span>
    </div>
  );
}
