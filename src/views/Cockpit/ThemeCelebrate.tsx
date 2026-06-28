import { useEffect, useMemo, useRef } from "react";
import type { PanelPaletteName } from "../../state/panelPalettes";
import { THEME_DECOR, type CelebrateStyle } from "../../state/themeDecor";

interface Particle {
  id: number;
  left: number; // %
  dx: number; // vw horizontal drift
  rot: number; // deg total tumble
  delay: number; // ms
  dur: number; // ms
  size: number; // px
  color: string;
}

function build(cfg: CelebrateStyle): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < cfg.count; i++) {
    out.push({
      id: i,
      left: Math.round(Math.random() * 100),
      dx: Math.round((Math.random() * 2 - 1) * 18),
      rot: Math.round(220 + Math.random() * 520) * (Math.random() < 0.5 ? -1 : 1),
      delay: Math.round(Math.random() * 360),
      dur: Math.round(1700 + Math.random() * 700),
      size: 9 + Math.round(Math.random() * 7),
      color: cfg.colors[i % cfg.colors.length],
    });
  }
  return out;
}

/** One particle silhouette, selected by the theme's `celebrate.particle`. Drawn
 *  on a 12×12 grid; `color` is the spawned fill. */
function ParticleGlyph({ kind, color }: { kind: CelebrateStyle["particle"]; color: string }) {
  const v = { viewBox: "0 0 12 12", width: "100%", height: "100%", fill: "none", "aria-hidden": true as const };
  switch (kind) {
    case "leaf":
    case "greenleaf":
      return (
        <svg {...v}>
          <path d="M6 0.5 C 9 3.5, 9 8.5, 6 11.5 C 3 8.5, 3 3.5, 6 0.5 Z" fill={color} />
          <path d="M6 1.5 L6 10.5" stroke="rgba(20,30,10,0.28)" strokeWidth="0.5" />
        </svg>
      );
    case "petal":
      return (
        <svg {...v}>
          <path d="M6 0.5 C 10 3, 10 9, 6 11.5 C 2 9, 2 3, 6 0.5 Z" fill={color} />
        </svg>
      );
    case "bubble":
      return (
        <svg {...v}>
          <circle cx="6" cy="6" r="5" fill={color} fillOpacity="0.22" stroke={color} strokeWidth="0.8" />
          <circle cx="4.2" cy="4" r="1.1" fill="#fff" fillOpacity="0.7" />
        </svg>
      );
    case "dust":
      return (
        <svg {...v}>
          <circle cx="6" cy="6" r="2.4" fill={color} />
          <circle cx="6" cy="6" r="5" fill={color} fillOpacity="0.18" />
        </svg>
      );
    case "dash":
      return (
        <svg {...v}>
          <rect x="1.5" y="5" width="9" height="2" rx="1" fill={color} />
        </svg>
      );
    case "star":
      return (
        <svg {...v}>
          <path d="M6 0 L7.3 4.7 L12 6 L7.3 7.3 L6 12 L4.7 7.3 L0 6 L4.7 4.7 Z" fill={color} />
        </svg>
      );
    case "snow":
      return (
        <svg {...v}>
          <g stroke={color} strokeWidth="0.9" strokeLinecap="round">
            <line x1="6" y1="0.5" x2="6" y2="11.5" />
            <line x1="1.2" y1="3.2" x2="10.8" y2="8.8" />
            <line x1="10.8" y1="3.2" x2="1.2" y2="8.8" />
          </g>
        </svg>
      );
    case "inkdot":
      return (
        <svg {...v}>
          <circle cx="6" cy="6" r="3.2" fill={color} />
          <circle cx="6" cy="6" r="5.2" fill={color} fillOpacity="0.16" />
        </svg>
      );
    default:
      return (
        <svg {...v}>
          <circle cx="6" cy="6" r="3" fill={color} />
        </svg>
      );
  }
}

/** Generalised switch-in celebration (the Olympus "Oracle Descent" extended to
 *  every theme): themed particles drift down (or rise, for bubbles) while a soft
 *  light blooms. Mounts briefly, then `onDone` unmounts. Pointer-events-none and
 *  fully suppressed under prefers-reduced-motion. World Cup keeps its bespoke
 *  GoalConfetti and is handled separately by the Cockpit. */
export default function ThemeCelebrate({
  name,
  onDone,
}: {
  name: PanelPaletteName;
  onDone: () => void;
}) {
  const cfg = THEME_DECOR[name].celebrate;
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const ref = useRef<Particle[] | null>(null);
  if (ref.current === null) ref.current = reduced ? [] : build(cfg);
  const parts = ref.current;

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    const t = window.setTimeout(onDone, 2900);
    return () => window.clearTimeout(t);
  }, [reduced, onDone]);

  if (reduced) return null;

  const up = cfg.dir === "up";

  return (
    <div className={`td-descent${up ? " td-descent--up" : ""}`} aria-hidden="true">
      <div className="td-bloom" style={{ background: cfg.bloom }} />
      {parts.map((p) => (
        <span
          key={p.id}
          className="td-particle"
          style={{
            left: `${p.left}%`,
            ["--dx" as string]: `${p.dx}vw`,
            ["--rot" as string]: `${p.rot}deg`,
            ["--delay" as string]: `${p.delay}ms`,
            ["--dur" as string]: `${p.dur}ms`,
            ["--sz" as string]: `${p.size}px`,
          }}
        >
          <ParticleGlyph kind={cfg.particle} color={p.color} />
        </span>
      ))}
    </div>
  );
}
