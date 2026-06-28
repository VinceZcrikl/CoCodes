import Wordmark from "./Wordmark";
import type { PanelPaletteName } from "../../state/panelPalettes";

/** Generalised premium frame overlay — the Olympus "temple facade" extended to
 *  every theme. A refined accent hairline edges the panel, a small motif nests
 *  into each of the four corners, the `CoCodes_` wordmark rides the header
 *  divider, and a faint signature motif floats in the lower body. Rendered as a
 *  pointer-events-none overlay so it never blocks the terminal.
 *
 *  The frame/wordmark are theme-neutral (colours via --orb-accent + the wordmark
 *  CSS vars); the corner + body motifs are chosen by `scope` so each theme reads
 *  as its own (palmette + constellation for Olympus, ivy + leaf-fall for forest,
 *  snow crystal + aurora for nordic, …). Each motif's accent colour flows from
 *  `currentColor`, set to the theme accent on `.td-temple`. */
export default function ThemeFrame({ scope }: { scope: PanelPaletteName }) {
  return (
    <div className={`td-temple td-temple--${scope}`} aria-hidden="true">
      <span className="td-goldframe" />
      <CornerMotif scope={scope} pos="tl" />
      <CornerMotif scope={scope} pos="tr" />
      <CornerMotif scope={scope} pos="bl" />
      <CornerMotif scope={scope} pos="br" />
      <Wordmark className="td-wordmark--frame" />
      <BodyMotif scope={scope} />
    </div>
  );
}

/* ── Corner flourishes ──────────────────────────────────────────────────── */

function CornerMotif({ scope, pos }: { scope: PanelPaletteName; pos: "tl" | "tr" | "bl" | "br" }) {
  return (
    <span className={`td-corner td-corner--${pos}`}>
      <CornerGlyph scope={scope} />
    </span>
  );
}

/** One corner glyph drawn for the top-left; CSS mirrors it into the other three.
 *  Echoes the theme: a palmette fan (Olympus), an ivy sprig (forest), an ice
 *  crystal (nordic), a tendril scroll (burgundy), a compass tick (obsidian), a
 *  right-angle bracket (graphite/porcelain), a small star (midnight), a wave
 *  (deep-teal / world-cup). */
function CornerGlyph({ scope }: { scope: PanelPaletteName }) {
  const C = "currentColor";
  const common = {
    viewBox: "0 0 26 26",
    fill: "none" as const,
    "aria-hidden": true as const,
    xmlns: "http://www.w3.org/2000/svg",
  };

  switch (scope) {
    case "cocodes":
    case "world-cup-2026": {
      // Palmette: gold petals fanning diagonally inward from a base scroll.
      const petals = [];
      const N = 5;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1) - 0.5;
        const ang = 45 + t * 112;
        const a = (ang * Math.PI) / 180;
        const cx = 5 + Math.cos(a) * 9;
        const cy = 5 + Math.sin(a) * 9;
        petals.push(
          <ellipse
            key={i}
            cx={cx.toFixed(1)}
            cy={cy.toFixed(1)}
            rx="5"
            ry="1.7"
            fill={C}
            opacity="0.92"
            transform={`rotate(${ang.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`}
          />,
        );
      }
      return (
        <svg {...common}>
          {petals}
          <circle cx="5" cy="5" r="2" fill="#15151b" stroke={C} strokeWidth="1" />
          <circle cx="5" cy="5" r="0.8" fill={C} />
        </svg>
      );
    }

    case "forest-jade":
      // Ivy sprig: a curving stem with three small leaves.
      return (
        <svg {...common}>
          <path d="M4 4 Q 12 6 18 16" stroke={C} strokeWidth="1.1" fill="none" strokeLinecap="round" />
          {[
            [9, 7],
            [13, 11],
            [16, 15],
          ].map(([x, y], i) => (
            <path
              key={i}
              d={`M ${x} ${y} q 2 -2.4 4 0 q -2 2.4 -4 0 Z`}
              fill={C}
              opacity="0.9"
              transform={`rotate(${30 + i * 18} ${x} ${y})`}
            />
          ))}
        </svg>
      );

    case "nordic-slate":
      // Ice crystal: a three-armed star with side barbs.
      return (
        <svg {...common}>
          <g stroke={C} strokeWidth="1" strokeLinecap="round" fill="none">
            <line x1="5" y1="5" x2="20" y2="20" />
            <line x1="5" y1="13" x2="5" y2="5" />
            <line x1="13" y1="5" x2="5" y2="5" />
            <line x1="11" y1="11" x2="14" y2="9" />
            <line x1="11" y1="11" x2="9" y2="14" />
          </g>
        </svg>
      );

    case "wine-burgundy":
      // Vine scroll: a curling tendril with a small grape cluster.
      return (
        <svg {...common}>
          <path d="M4 4 Q 14 4 14 14 Q 14 20 20 20" stroke={C} strokeWidth="1.1" fill="none" strokeLinecap="round" />
          {[
            [16, 16],
            [19, 18],
            [17, 20],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.4" fill={C} />
          ))}
        </svg>
      );

    case "obsidian-gold":
      // Compass corner: a quarter-arc with radial ticks.
      return (
        <svg {...common}>
          <path d="M5 20 A 15 15 0 0 1 20 5" stroke={C} strokeWidth="1.1" fill="none" />
          {[20, 45, 70].map((deg, i) => {
            const a = (deg * Math.PI) / 180;
            const x1 = 5 + Math.cos(-a + Math.PI / 2) * 11;
            const y1 = 20 - Math.sin(-a + Math.PI / 2) * 11;
            const x2 = 5 + Math.cos(-a + Math.PI / 2) * 15;
            const y2 = 20 - Math.sin(-a + Math.PI / 2) * 15;
            return <line key={i} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke={C} strokeWidth="0.8" />;
          })}
        </svg>
      );

    case "midnight-indigo":
      // A small four-point star with a faint halo.
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="4.5" fill={C} opacity="0.16" />
          <path d="M8 2 L9.4 6.6 L14 8 L9.4 9.4 L8 14 L6.6 9.4 L2 8 L6.6 6.6 Z" fill={C} />
        </svg>
      );

    case "deep-teal":
      // Concentric quarter-ripples.
      return (
        <svg {...common}>
          {[6, 10, 14].map((r, i) => (
            <path key={i} d={`M5 ${5 + r} A ${r} ${r} 0 0 1 ${5 + r} 5`} stroke={C} strokeWidth={1.1 - i * 0.18} fill="none" opacity={0.95 - i * 0.2} />
          ))}
        </svg>
      );

    default:
      // Graphite / Porcelain — a clean right-angle bracket + corner dot.
      return (
        <svg {...common}>
          <path d="M4 14 L4 4 L14 4" stroke={C} strokeWidth="1.1" fill="none" strokeLinecap="round" />
          <circle cx="4" cy="4" r="1.3" fill={C} />
        </svg>
      );
  }
}

/* ── Body motif ─────────────────────────────────────────────────────────── */

/** A faint signature motif floating in the lower body — the theme's "small
 *  delight". Olympus keeps its constellation; others echo their imagery. */
function BodyMotif({ scope }: { scope: PanelPaletteName }) {
  const C = "currentColor";
  const cls = `td-bodymotif td-bodymotif--${scope}`;

  // Olympus / Midnight — a faint constellation (stars + links).
  if (scope === "cocodes" || scope === "midnight-indigo") {
    const stars: [number, number][] = [
      [16, 88], [42, 66], [72, 76], [102, 50], [136, 36], [90, 24], [118, 94], [150, 70], [60, 30], [28, 48],
    ];
    const links: [number, number][] = [
      [9, 8], [8, 1], [1, 2], [2, 3], [3, 4], [3, 5], [2, 6], [4, 7], [0, 1],
    ];
    return (
      <svg className={cls} viewBox="0 0 170 110" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <g stroke={C} strokeWidth="0.7" opacity="0.45">
          {links.map(([a, b], i) => (
            <line key={i} x1={stars[a][0]} y1={stars[a][1]} x2={stars[b][0]} y2={stars[b][1]} />
          ))}
        </g>
        {stars.map((s, i) => (
          <g key={i}>
            <circle cx={s[0]} cy={s[1]} r={i % 3 === 0 ? 4.8 : 3.4} fill={C} opacity="0.16" />
            <circle cx={s[0]} cy={s[1]} r={i % 3 === 0 ? 2.2 : 1.5} fill={C} />
          </g>
        ))}
      </svg>
    );
  }

  // Forest — a trailing ivy vine with leaves.
  if (scope === "forest-jade") {
    return (
      <svg className={cls} viewBox="0 0 170 90" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 60 Q 50 70 90 40 T 166 30" stroke={C} strokeWidth="1.1" fill="none" opacity="0.5" />
        {[[36, 58], [68, 50], [104, 36], [140, 30]].map(([x, y], i) => (
          <path key={i} d={`M ${x} ${y} q 5 -6 10 0 q -5 6 -10 0 Z`} fill={C} opacity="0.4" transform={`rotate(${-20 + i * 12} ${x} ${y})`} />
        ))}
      </svg>
    );
  }

  // Nordic — an aurora band of soft waves.
  if (scope === "nordic-slate") {
    return (
      <svg className={cls} viewBox="0 0 170 80" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <g stroke={C} fill="none" opacity="0.42">
          <path d="M0 50 Q 42 24 85 44 T 170 30" strokeWidth="1.4" />
          <path d="M0 60 Q 42 36 85 56 T 170 42" strokeWidth="1" opacity="0.7" />
          <path d="M0 40 Q 42 16 85 34 T 170 20" strokeWidth="0.7" opacity="0.55" />
        </g>
      </svg>
    );
  }

  // Burgundy — a sprig of grapes on a vine.
  if (scope === "wine-burgundy") {
    return (
      <svg className={cls} viewBox="0 0 130 110" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <path d="M64 8 Q 64 26 60 38" stroke={C} strokeWidth="1.2" fill="none" opacity="0.5" />
        {[[60, 44], [52, 52], [68, 52], [56, 62], [64, 62], [60, 72]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5.4" fill={C} opacity="0.32" />
        ))}
        <path d="M64 14 q 14 -6 22 4 q -16 4 -22 -4 Z" fill={C} opacity="0.3" />
      </svg>
    );
  }

  // World Cup keeps its bespoke chalk-pitch body decoration (CSS), so the
  // generalised frame adds no extra body motif there.
  if (scope === "world-cup-2026") return null;

  // Deep Teal — concentric tide rings.
  if (scope === "deep-teal") {
    return (
      <svg className={cls} viewBox="0 0 140 100" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <g stroke={C} fill="none" opacity="0.4">
          {[20, 34, 48, 62].map((r, i) => (
            <circle key={i} cx="70" cy="56" r={r} strokeWidth={1.2 - i * 0.18} opacity={0.95 - i * 0.18} />
          ))}
        </g>
      </svg>
    );
  }

  // Obsidian — a fine brass orrery (orbit rings + compass star).
  if (scope === "obsidian-gold") {
    return (
      <svg className={cls} viewBox="0 0 150 100" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <g stroke={C} fill="none" opacity="0.42">
          <ellipse cx="75" cy="52" rx="58" ry="22" strokeWidth="0.9" transform="rotate(-16 75 52)" />
          <ellipse cx="75" cy="52" rx="40" ry="15" strokeWidth="0.9" transform="rotate(-16 75 52)" />
        </g>
        <circle cx="75" cy="52" r="3" fill={C} opacity="0.6" />
        <circle cx="118" cy="40" r="2" fill={C} opacity="0.5" />
      </svg>
    );
  }

  // Graphite / Porcelain — a restrained measured-grid corner mark.
  return (
    <svg className={cls} viewBox="0 0 130 100" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g stroke={C} opacity="0.34">
        <path d="M10 90 L10 30 L70 30" strokeWidth="1" fill="none" />
        {[44, 58, 72, 86].map((y, i) => (
          <line key={i} x1="10" y1={y} x2={i % 2 ? 22 : 16} y2={y} strokeWidth="0.7" />
        ))}
        {[24, 38, 52, 66].map((x, i) => (
          <line key={i} x1={x} y1="30" x2={x} y2={i % 2 ? 42 : 36} strokeWidth="0.7" />
        ))}
      </g>
    </svg>
  );
}
