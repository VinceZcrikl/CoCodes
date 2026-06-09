/**
 * Orb visual themes — palette + per-theme "signature" effect.
 *
 * Names and base palette intent track hermes-agent's dashboard themes
 * (see `hermes-agent/web/src/themes/presets.ts`), but each one carries an
 * orb-specific extra effect — a "small clever touch" baked into the shader
 * — so themes feel personality-distinct beyond color alone:
 *
 *   hermes-teal → drifting gold sparkle trails (default)
 *   midnight    → constellation stars rotating in deep space
 *   ember       → embers rising upward like a forge
 *   mono        → fine film grain, no chroma noise
 *   cyberpunk   → CRT scanlines + chromatic aberration on the rim
 *   rose        → petal-like soft dots rotating in concentric rings
 *   black-gold  → three dotted orbital rings + four compass-point stars,
 *                 styled like a brass orrery over a near-black void
 */

export type OrbThemeName =
  | "hermes-teal"
  | "hermes-gold"
  | "midnight"
  | "ember"
  | "mono"
  | "cyberpunk"
  | "rose"
  | "black-gold";

/** Numeric effect IDs the shader switches on. */
export const enum OrbEffect {
  None = 0,
  GoldTrails = 1,
  Constellation = 2,
  RisingEmbers = 3,
  FilmGrain = 4,
  Scanlines = 5,
  Petals = 6,
  StellarOrbit = 7,
}

export interface OrbTheme {
  name: OrbThemeName;
  label: string;
  /** CSS hex for satellite button glow / HUD accents. */
  accent: string;
  /** 0..1+ multiplier on the always-on particle layer. */
  particleDensity: number;
  /** When true, OrbCanvas ignores the selected agent's brand colour and uses
   *  the theme accent for the rim/inner-glow hue. Themes whose B channel is
   *  near-black (e.g. black-gold) need this — otherwise the 18% agent-hue
   *  bias inside the shader tints the dark side of the orb. */
  lockAccent?: boolean;
  /** Per-phase palette pairs (primary / accent), as 0..1 RGB triplets. */
  phases: {
    idle: [Triplet, Triplet];
    think: [Triplet, Triplet];
    reply: [Triplet, Triplet];
    perm: [Triplet, Triplet];
    error: [Triplet, Triplet];
  };
  /** Music visualizer palette pair. */
  music: [Triplet, Triplet];
  effect: OrbEffect;
}

export type Triplet = [number, number, number];

export const ORB_THEMES: Record<OrbThemeName, OrbTheme> = {
  /** Pure teal/cyan — orb body, satellite ring, and HUD accent all sit
   *  in the same cool blue-green family. No gold here; gold lives in
   *  the dedicated `hermes-gold` theme below. */
  "hermes-teal": {
    name: "hermes-teal",
    label: "Hermes Teal",
    accent: "#5dd6c5",
    particleDensity: 1.0,
    phases: {
      idle: [
        [0.36, 0.84, 0.77],
        [0.14, 0.46, 0.55],
      ],
      // Cooled-down "think" — was a violet that clashed with the teal
      // family; now a deep ocean blue that stays in palette.
      think: [
        [0.42, 0.70, 0.95],
        [0.10, 0.30, 0.62],
      ],
      // Reply was amber/gold (the old "mixed" colour); switched to a
      // bright aqua/cyan so an in-progress reply still reads as teal.
      reply: [
        [0.55, 0.95, 0.95],
        [0.18, 0.62, 0.78],
      ],
      perm: [
        [1.00, 0.65, 0.20],
        [0.85, 0.40, 0.10],
      ],
      error: [
        [0.98, 0.42, 0.32],
        [0.62, 0.10, 0.12],
      ],
    },
    // Music palette also nudged to cyan / aqua — keeps the listening
    // mode visually consistent with the rest of the theme.
    music: [
      [0.55, 0.95, 0.95],
      [0.30, 0.78, 0.92],
    ],
    effect: OrbEffect.GoldTrails,
  },

  /** Pure gold/amber — formerly the "warm half" of the old mixed teal
   *  theme. Everything now sits in the gold/amber/copper family so the
   *  orb body and the satellite ring read as one palette. */
  "hermes-gold": {
    name: "hermes-gold",
    label: "Hermes Gold",
    accent: "#ffd700",
    particleDensity: 1.0,
    phases: {
      // Idle = warm amber glow.
      idle: [
        [1.00, 0.82, 0.40],
        [0.60, 0.35, 0.08],
      ],
      // Thinking = burnished bronze with a copper accent — slower, deeper.
      think: [
        [0.92, 0.58, 0.20],
        [0.45, 0.20, 0.05],
      ],
      // Reply = bright sunlit yellow-gold, brighter than idle so streaming
      // visibly lifts the orb's energy.
      reply: [
        [1.00, 0.92, 0.55],
        [0.85, 0.55, 0.18],
      ],
      perm: [
        [1.00, 0.65, 0.20],
        [0.85, 0.40, 0.10],
      ],
      error: [
        [0.98, 0.42, 0.32],
        [0.62, 0.10, 0.12],
      ],
    },
    music: [
      [1.00, 0.86, 0.42],
      [0.78, 0.48, 0.10],
    ],
    effect: OrbEffect.GoldTrails,
  },

  midnight: {
    name: "midnight",
    label: "Midnight",
    accent: "#a78bfa",
    particleDensity: 0.95,
    phases: {
      idle: [
        [0.42, 0.40, 0.85],
        [0.10, 0.08, 0.32],
      ],
      think: [
        [0.65, 0.55, 1.00],
        [0.20, 0.14, 0.55],
      ],
      reply: [
        [0.70, 0.78, 1.00],
        [0.32, 0.40, 0.78],
      ],
      perm: [
        [1.00, 0.75, 0.45],
        [0.55, 0.30, 0.70],
      ],
      error: [
        [1.00, 0.45, 0.65],
        [0.55, 0.08, 0.30],
      ],
    },
    music: [
      [0.78, 0.42, 1.00],
      [0.45, 0.78, 1.00],
    ],
    effect: OrbEffect.Constellation,
  },

  ember: {
    name: "ember",
    label: "Ember",
    accent: "#f97316",
    particleDensity: 0.9,
    phases: {
      idle: [
        [0.85, 0.42, 0.18],
        [0.30, 0.08, 0.04],
      ],
      think: [
        [1.00, 0.55, 0.20],
        [0.60, 0.15, 0.05],
      ],
      reply: [
        [1.00, 0.78, 0.32],
        [0.80, 0.28, 0.08],
      ],
      perm: [
        [1.00, 0.62, 0.18],
        [0.78, 0.22, 0.06],
      ],
      error: [
        [1.00, 0.30, 0.18],
        [0.50, 0.05, 0.05],
      ],
    },
    music: [
      [1.00, 0.78, 0.30],
      [1.00, 0.30, 0.10],
    ],
    effect: OrbEffect.RisingEmbers,
  },

  mono: {
    name: "mono",
    label: "Mono",
    accent: "#eaeaea",
    particleDensity: 0.6,
    phases: {
      idle: [
        [0.78, 0.78, 0.78],
        [0.30, 0.30, 0.30],
      ],
      think: [
        [0.92, 0.92, 0.92],
        [0.42, 0.42, 0.42],
      ],
      reply: [
        [1.00, 1.00, 1.00],
        [0.55, 0.55, 0.55],
      ],
      perm: [
        [1.00, 0.95, 0.85],
        [0.50, 0.45, 0.38],
      ],
      error: [
        [1.00, 0.62, 0.62],
        [0.45, 0.18, 0.18],
      ],
    },
    music: [
      [0.85, 0.85, 0.85],
      [1.00, 1.00, 1.00],
    ],
    effect: OrbEffect.FilmGrain,
  },

  cyberpunk: {
    name: "cyberpunk",
    label: "Cyberpunk",
    accent: "#00ff88",
    particleDensity: 1.4,
    phases: {
      idle: [
        [0.20, 1.00, 0.55],
        [0.04, 0.32, 0.18],
      ],
      think: [
        [0.55, 1.00, 0.78],
        [0.10, 0.45, 0.30],
      ],
      reply: [
        [0.78, 1.00, 0.42],
        [0.18, 0.55, 0.08],
      ],
      perm: [
        [1.00, 0.85, 0.10],
        [0.60, 0.45, 0.00],
      ],
      error: [
        [1.00, 0.10, 0.35],
        [0.55, 0.04, 0.18],
      ],
    },
    music: [
      [0.10, 1.00, 0.55],
      [1.00, 0.20, 0.78],
    ],
    effect: OrbEffect.Scanlines,
  },

  rose: {
    name: "rose",
    label: "Rosé",
    accent: "#f9a8d4",
    particleDensity: 0.85,
    phases: {
      idle: [
        [1.00, 0.78, 0.85],
        [0.55, 0.28, 0.42],
      ],
      think: [
        [1.00, 0.65, 0.82],
        [0.62, 0.28, 0.55],
      ],
      reply: [
        [1.00, 0.85, 0.78],
        [0.85, 0.45, 0.55],
      ],
      perm: [
        [1.00, 0.78, 0.55],
        [0.78, 0.40, 0.32],
      ],
      error: [
        [1.00, 0.45, 0.55],
        [0.55, 0.10, 0.22],
      ],
    },
    music: [
      [1.00, 0.55, 0.85],
      [0.85, 0.78, 1.00],
    ],
    effect: OrbEffect.Petals,
  },

  /** Black-Gold — handcrafted palette delivered by design. Reads as an
   *  antique brass orrery in a dark display case: every gold tone is a
   *  step on a single warm ramp (#5C3711 → #AB7C40 → #D0A76F → #ECD3A8
   *  → #FCF6E8) and every dark tone is a step on a near-black ramp
   *  (#060101 → #140702 → #261204). No cool/magenta drift anywhere —
   *  the only off-ramp is the error phase, which keeps a warm red so
   *  it still feels part of the gold family rather than alarming.
   *
   *  Reference vars (CSS hex → 0..1 RGB triplets used below):
   *    --orb-black       #060101 → [0.024, 0.004, 0.004]
   *    --墨黑棕           #140702 → [0.078, 0.027, 0.008]
   *    --deep-brown      #261204 → [0.149, 0.071, 0.016]
   *    --dark-gold       #5C3711 → [0.361, 0.216, 0.067]
   *    --antique-gold    #AB7C40 → [0.671, 0.486, 0.251]
   *    --primary-gold    #D0A76F → [0.816, 0.655, 0.435]
   *    --highlight-gold  #ECD3A8 → [0.925, 0.827, 0.659]
   *    --warm-white      #FCF6E8 → [0.988, 0.965, 0.910]
   */
  "black-gold": {
    name: "black-gold",
    label: "Black Gold",
    // Primary gold #D0A76F — used by the CSS satellite glow, HUD pill
    // tint, mini-chat hairlines, etc. Same warm amber/honey hue as the
    // shader's idle phaseA so the satellite ring colour matches the
    // body's gold without a perceptual seam.
    accent: "#D0A76F",
    // Block agent-hue bias — phaseB sits near-black, so even an 18%
    // mix of a coloured agent hue visibly stains the dark side. Lock
    // to keep the void pure.
    lockAccent: true,
    // Dust kept restrained — the brass-orrery identity comes from the
    // per-theme `StellarOrbit` effect (orbital rings + compass stars),
    // not the ambient stardust layer.
    particleDensity: 0.55,
    phases: {
      // Idle = primary gold over the deepest black. Reads as a gold
      // medallion floating in space.
      idle: [
        [0.816, 0.655, 0.435], // #D0A76F primary gold
        [0.024, 0.004, 0.004], // #060101 orb black
      ],
      // Think = antique-gold (one step darker on the gold ramp) over
      // 墨黑棕 (one step warmer than orb-black). Same hue family —
      // thinking reads as "cooling brass" not a colour change.
      think: [
        [0.671, 0.486, 0.251], // #AB7C40 antique gold
        [0.078, 0.027, 0.008], // #140702 black-brown
      ],
      // Reply = highlight gold (the brightest gold step) over deep
      // brown. Visible lift in luminance signals streaming activity
      // without leaving the palette.
      reply: [
        [0.925, 0.827, 0.659], // #ECD3A8 highlight gold
        [0.149, 0.071, 0.016], // #261204 deep brown
      ],
      // Perm = primary gold over dark-gold so the slow pulse during a
      // permission prompt reads as a warm "ask" rather than alarming.
      perm: [
        [0.816, 0.655, 0.435], // #D0A76F primary gold
        [0.361, 0.216, 0.067], // #5C3711 dark gold
      ],
      // Error = the one warm-red excursion. Kept dim so it still feels
      // part of the warm family — bright crimson would clash hard.
      error: [
        [1.00, 0.42, 0.32],
        [0.30, 0.04, 0.04],
      ],
    },
    // Music = primary gold ↔ dark gold. Light end matches idle for
    // continuity; dark end is the warm "star-trail" step on the gold
    // ramp so beats pulse within the palette.
    music: [
      [0.816, 0.655, 0.435], // #D0A76F primary gold
      [0.361, 0.216, 0.067], // #5C3711 dark gold
    ],
    effect: OrbEffect.StellarOrbit,
  },
};

export const ORB_THEME_ORDER: OrbThemeName[] = [
  "hermes-teal",
  "hermes-gold",
  "midnight",
  "ember",
  "mono",
  "cyberpunk",
  "rose",
  "black-gold",
];
