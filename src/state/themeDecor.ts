/**
 * Theme decoration registry — the single source of truth that extends the
 * "CoCodes · Olympus" design language to every panel palette.
 *
 * Olympus pioneered four decorative layers (a refined frame + corner flourishes,
 * the gilded `CoCodes_` wordmark, a body motif, and a switch-in celebration).
 * This file generalises those layers so each palette gets its own character —
 * the motif echoes the palette's name/imagery (Nordic → snow/aurora, Forest →
 * ivy, Midnight → star orbits, Burgundy → wine swirl, …) while sharing one
 * config-driven implementation. Adding/retuning a theme is editing this map plus
 * one scoped CSS block; no component branches.
 *
 * The colour-bearing chrome (frame glow, sweep, halo) reads `--orb-accent` in
 * CSS, so it auto-adapts to each palette's accent — only the wordmark gradients,
 * the ring icon, and the celebration particles are spelled out per theme here.
 */

import type { PanelPaletteName } from "./panelPalettes";

/** The signature SVG ringing the orb inside a palette button. */
export type RingIconKind =
  | "laurel" // Olympus laurel wreath
  | "ball" // World Cup Trionda ball
  | "ripple" // Deep Teal concentric tide rings
  | "compass" // Obsidian Gold brass compass ring
  | "tick" // Graphite concentric tick ring
  | "orbit" // Midnight Indigo star orbit
  | "vine" // Burgundy grapevine tendril
  | "ivy" // Forest Jade ivy leaves
  | "snowflake" // Nordic Slate snowflake
  | "seal"; // Porcelain ink seal ring

/** Per-theme wordmark styling. CSS reads these via custom properties so the
 *  gilded `CoCodes_` mark re-skins (serif↔sans, gold↔silver↔indigo↔jade…). */
export interface WordmarkStyle {
  /** font-family value for the wordmark glyphs. */
  font: string;
  /** linear-gradient(...) for the two camelCase capitals. */
  capGrad: string;
  /** linear-gradient(...) for the lowercase body. */
  lowGrad: string;
  /** linear-gradient(...) for the terminal caret. */
  caret: string;
  /** Solid colour of the tiny gleam at each capital (rendered un-clipped). */
  gleam: string;
}

/** Per-theme switch-in celebration (generalised OracleDescent). */
export interface CelebrateStyle {
  /** Particle silhouette — selects the SVG drawn in ThemeCelebrate. */
  particle:
    | "leaf" // Olympus laurel leaf
    | "confetti" // World Cup confetti (handled by GoalConfetti — see note)
    | "bubble" // Deep Teal rising bubble
    | "dust" // Obsidian Gold gold dust
    | "dash" // Graphite minimal dash
    | "star" // Midnight Indigo shooting star
    | "petal" // Burgundy wine petal
    | "greenleaf" // Forest Jade falling leaf
    | "snow" // Nordic Slate snowflake
    | "inkdot"; // Porcelain ink dot
  /** Particle fill colours, cycled across the spawned particles. */
  colors: string[];
  /** How many particles to spawn. */
  count: number;
  /** Direction of travel: most fall, bubbles rise. */
  dir?: "down" | "up";
  /** radial-gradient(...) for the soft light bloom behind the particles. */
  bloom: string;
}

export interface ThemeDecor {
  /** CSS scope token: styles are written `[data-palette="<name>"] .td-… {}` and
   *  motif variants keyed by this string. Equals the palette name. */
  scope: PanelPaletteName;
  ringIcon: RingIconKind;
  /** Cool core colour the ring sits against (gold laurel ↔ celestial core, etc.)
   *  so the icon doesn't wash out against an accent-matched orb. */
  ringCore: string;
  wordmark: WordmarkStyle;
  celebrate: CelebrateStyle;
}

/* Shared wordmark presets ------------------------------------------------- */

const SERIF =
  '"Didot", "Bodoni 72", "Hoefler Text", "Cormorant Garamond", "Optima", Georgia, serif';
const SANS =
  '"Optima", "Avenir Next", "Helvetica Neue", system-ui, -apple-system, sans-serif';

export const THEME_DECOR: Record<PanelPaletteName, ThemeDecor> = {
  /** Olympus — the original: gilded serif, golden laurel, falling laurel leaves. */
  cocodes: {
    scope: "cocodes",
    ringIcon: "laurel",
    ringCore: "#cdd9f2",
    wordmark: {
      font: SERIF,
      capGrad: "linear-gradient(180deg, #fff3d6 0%, #f1d488 48%, #cda24f 100%)",
      lowGrad: "linear-gradient(180deg, #f3d9a2 0%, #dcb368 50%, #b98a3e 100%)",
      caret: "linear-gradient(90deg, #fff3d6, #d2a24c)",
      gleam: "#fff3d6",
    },
    celebrate: {
      particle: "leaf",
      colors: ["#e8c879", "#f3d98a", "#c9a24a", "#d8b86a", "#a8a55e"],
      count: 22,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(243,217,138,0.34) 0%, rgba(232,200,120,0.12) 30%, transparent 62%)",
    },
  },

  /** World Cup — Trionda night. Ring + confetti keep their bespoke components;
   *  this entry only supplies the wordmark so the mark appears on the frame. */
  "world-cup-2026": {
    scope: "world-cup-2026",
    ringIcon: "ball",
    ringCore: "#15151b",
    wordmark: {
      font: SERIF,
      capGrad: "linear-gradient(180deg, #ffe9ad 0%, #e8b23a 50%, #b07d1f 100%)",
      lowGrad: "linear-gradient(180deg, #f4dda0 0%, #d9a93f 50%, #a9781f 100%)",
      caret: "linear-gradient(90deg, #ffe9ad, #e8b23a)",
      gleam: "#fff0c0",
    },
    celebrate: {
      particle: "confetti",
      colors: ["#e4322b", "#1fa35a", "#2f6bd8", "#e8b23a"],
      count: 32,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(232,178,58,0.30) 0%, rgba(47,107,216,0.12) 32%, transparent 62%)",
    },
  },

  /** Deep Teal — tidal aqua. Concentric ripple ring + rising bubbles. */
  "deep-teal": {
    scope: "deep-teal",
    ringIcon: "ripple",
    ringCore: "#082222",
    wordmark: {
      font: SANS,
      capGrad: "linear-gradient(180deg, #d6fff8 0%, #7fe6d7 48%, #3fb6a6 100%)",
      lowGrad: "linear-gradient(180deg, #bff3ea 0%, #6dd6c5 50%, #3aa394 100%)",
      caret: "linear-gradient(90deg, #d6fff8, #5dd6c5)",
      gleam: "#e6fffb",
    },
    celebrate: {
      particle: "bubble",
      colors: ["#5dd6c5", "#7fe6d7", "#a7f0e6", "#3fb6a6"],
      count: 26,
      dir: "up",
      bloom:
        "radial-gradient(120% 80% at 50% 108%, rgba(93,214,197,0.28) 0%, rgba(93,214,197,0.10) 34%, transparent 64%)",
    },
  },

  /** Obsidian Gold — brushed brass on black glass. Compass ring + gold dust. */
  "obsidian-gold": {
    scope: "obsidian-gold",
    ringIcon: "compass",
    ringCore: "#0e0b06",
    wordmark: {
      font: SERIF,
      capGrad: "linear-gradient(180deg, #f6e6c4 0%, #d0a76f 50%, #9a7138 100%)",
      lowGrad: "linear-gradient(180deg, #ecd6ab 0%, #c79c62 50%, #8f6731 100%)",
      caret: "linear-gradient(90deg, #f6e6c4, #d0a76f)",
      gleam: "#fbeece",
    },
    celebrate: {
      particle: "dust",
      colors: ["#d0a76f", "#e6cf9f", "#b9893f", "#f0dcae"],
      count: 30,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(208,167,111,0.30) 0%, rgba(208,167,111,0.10) 32%, transparent 62%)",
    },
  },

  /** Graphite — architectural mono. Concentric tick ring + minimal dashes. */
  "graphite-mono": {
    scope: "graphite-mono",
    ringIcon: "tick",
    ringCore: "#0f1113",
    wordmark: {
      font: SANS,
      capGrad: "linear-gradient(180deg, #ffffff 0%, #d6dbe2 50%, #aab1ba 100%)",
      lowGrad: "linear-gradient(180deg, #eef1f4 0%, #c4cad2 50%, #9aa1ab 100%)",
      caret: "linear-gradient(90deg, #ffffff, #c4cad2)",
      gleam: "#ffffff",
    },
    celebrate: {
      particle: "dash",
      colors: ["#c4cad2", "#e4e6ea", "#9aa1ab", "#d6dbe2"],
      count: 24,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(228,230,234,0.20) 0%, rgba(228,230,234,0.07) 32%, transparent 62%)",
    },
  },

  /** Midnight Indigo — nocturnal blue-violet. Star-orbit ring + shooting stars. */
  "midnight-indigo": {
    scope: "midnight-indigo",
    ringIcon: "orbit",
    ringCore: "#0d0f1f",
    wordmark: {
      font: SERIF,
      capGrad: "linear-gradient(180deg, #e8ebff 0%, #aab4f8 48%, #7e8cea 100%)",
      lowGrad: "linear-gradient(180deg, #d6dbfb 0%, #9aa6f5 50%, #6f7ce0 100%)",
      caret: "linear-gradient(90deg, #e8ebff, #9aa6f5)",
      gleam: "#f0f2ff",
    },
    celebrate: {
      particle: "star",
      colors: ["#9aa6f5", "#c2caff", "#e8ebff", "#7e8cea"],
      count: 24,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(154,166,245,0.28) 0%, rgba(154,166,245,0.10) 32%, transparent 62%)",
    },
  },

  /** Burgundy — vinous oxblood. Grapevine tendril ring + wine petals. */
  "wine-burgundy": {
    scope: "wine-burgundy",
    ringIcon: "vine",
    ringCore: "#1c0d13",
    wordmark: {
      font: SERIF,
      capGrad: "linear-gradient(180deg, #ffe5dc 0%, #e8b4a3 48%, #c98370 100%)",
      lowGrad: "linear-gradient(180deg, #f5d3c9 0%, #dca08c 50%, #bb7864 100%)",
      caret: "linear-gradient(90deg, #ffe5dc, #dca08c)",
      gleam: "#ffeae2",
    },
    celebrate: {
      particle: "petal",
      colors: ["#dca08c", "#e8b4a3", "#b9596a", "#8c2f44"],
      count: 24,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(220,160,140,0.28) 0%, rgba(140,47,68,0.12) 32%, transparent 62%)",
    },
  },

  /** Forest Jade — deep pine. Ivy ring + falling green leaves. */
  "forest-jade": {
    scope: "forest-jade",
    ringIcon: "ivy",
    ringCore: "#0a1710",
    wordmark: {
      font: SERIF,
      capGrad: "linear-gradient(180deg, #e6ffe9 0%, #95e0ad 48%, #5bb47f 100%)",
      lowGrad: "linear-gradient(180deg, #d2f3da 0%, #74cc98 50%, #4ea474 100%)",
      caret: "linear-gradient(90deg, #e6ffe9, #74cc98)",
      gleam: "#eafff0",
    },
    celebrate: {
      particle: "greenleaf",
      colors: ["#74cc98", "#95e0ad", "#4ea474", "#a7e8bd"],
      count: 24,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(116,204,152,0.28) 0%, rgba(116,204,152,0.10) 32%, transparent 62%)",
    },
  },

  /** Nordic Slate — icy fjord. Snowflake ring + drifting snow. */
  "nordic-slate": {
    scope: "nordic-slate",
    ringIcon: "snowflake",
    ringCore: "#0f181d",
    wordmark: {
      font: SANS,
      capGrad: "linear-gradient(180deg, #f0fbff 0%, #aedcf0 48%, #79b2d0 100%)",
      lowGrad: "linear-gradient(180deg, #ddf2fb 0%, #7ab2d0 50%, #5690ae 100%)",
      caret: "linear-gradient(90deg, #f0fbff, #7ab2d0)",
      gleam: "#f4fcff",
    },
    celebrate: {
      particle: "snow",
      colors: ["#cfeaf6", "#e8f6fc", "#a9d6ea", "#7ab2d0"],
      count: 30,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(122,178,208,0.26) 0%, rgba(122,178,208,0.10) 32%, transparent 62%)",
    },
  },

  /** Porcelain — light daylight. Ink seal ring + spreading ink dots. (Dark
   *  glyphs on cream — gleams/particles are ink-coloured so they read.) */
  "porcelain-ink": {
    scope: "porcelain-ink",
    ringIcon: "seal",
    ringCore: "#ece8dd",
    wordmark: {
      font: SERIF,
      capGrad: "linear-gradient(180deg, #4a5d72 0%, #34465a 50%, #1f2d3d 100%)",
      lowGrad: "linear-gradient(180deg, #5a6d82 0%, #44566a 50%, #2c3c4e 100%)",
      caret: "linear-gradient(90deg, #4a5d72, #2c3c4e)",
      gleam: "#4a5d72",
    },
    celebrate: {
      particle: "inkdot",
      colors: ["#4a5d72", "#6b7d92", "#34465a", "#8a98a8"],
      count: 22,
      bloom:
        "radial-gradient(120% 70% at 50% -8%, rgba(74,93,114,0.18) 0%, rgba(74,93,114,0.06) 32%, transparent 62%)",
    },
  },
};
