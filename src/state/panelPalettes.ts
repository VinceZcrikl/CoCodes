/**
 * Cockpit panel palettes — curated "designer" colour schemes for the whole
 * panel chrome (canvas / panel surface / borders / text / accent), independent
 * of the WebGL orb theme. Selected from the top-right palette popover.
 *
 * Each palette is a complete, self-consistent set: a base surface ramp (canvas
 * → panel → deep), a hairline border + accent line, a three-step text ramp, an
 * accent (the "点缀" colour used for the satellite glow, HUD pills, cursor) and
 * a danger hue. They map 1:1 onto the CSS custom properties the app already
 * consumes (see `uiPalette.ts`), so switching a palette re-skins everything.
 *
 * Palettes are intentionally restrained — one accent family each, deep low-
 * chroma surfaces, parchment/ivory text — so every preset reads as "premium"
 * rather than loud. Mix freely: the panel palette is orthogonal to the orb
 * theme, so e.g. an "Obsidian Gold" panel can host any orb.
 */

export type PanelPaletteName =
  | "world-cup-2026"
  | "cocodes"
  | "deep-teal"
  | "obsidian-gold"
  | "graphite-mono"
  | "midnight-indigo"
  | "wine-burgundy"
  | "forest-jade"
  | "porcelain-ink"
  | "nordic-slate";

export interface PanelPalette {
  name: PanelPaletteName;
  label: string;
  /** Background canvas behind the panel (the deepest surface). */
  bgCanvas: string;
  /** The panel surface. */
  panel: string;
  /** A slightly deeper inset surface (insets, wells). */
  panelDeep: string;
  /** Translucent panel for floating layers. */
  panelSoft: string;
  /** Hairline border (translucent). */
  border: string;
  /** Accent-tinted hairline (dividers, focus rails). */
  accentLine: string;
  /** Primary / soft / muted text ramp. */
  textMain: string;
  textSoft: string;
  textMuted: string;
  /** The accent "点缀" — satellite glow, HUD pill, cursor, links. */
  accent: string;
  /** Error / destructive hue. */
  danger: string;
  /** Whether this palette reads as a light surface (affects swatch contrast). */
  light?: boolean;
}

export const PANEL_PALETTES: Record<PanelPaletteName, PanelPalette> = {
  /** World Cup 26 — "Trionda Night": a midnight-navy stadium with trophy-gold
   *  as the accent and the Trionda tri-color (red/green/blue host nations) used
   *  for the festive chrome scoped under [data-palette="world-cup-2026"]. */
  "world-cup-2026": {
    name: "world-cup-2026",
    label: "World Cup 26",
    bgCanvas: "#070b1c",
    panel: "#0e1530",
    panelDeep: "#090f24",
    panelSoft: "rgba(14, 21, 48, 0.82)",
    border: "rgba(232, 200, 120, 0.18)",
    accentLine: "rgba(232, 178, 58, 0.34)",
    textMain: "#f4ecd6",
    textSoft: "rgba(244, 236, 214, 0.78)",
    textMuted: "rgba(244, 236, 214, 0.55)",
    accent: "#e8b23a",
    danger: "#e4322b",
  },
  /** CoCodes · Olympus — the app's namesake theme: an Olympus-at-dusk look (deep
   *  Aegean night + night-marble surfaces + Olympian gold accent, ivory marble
   *  text, Tyrian "divine wrath" red). Greek-mythology chrome (meander ribbon,
   *  Apollo sunbeam, constellation, laurel) is scoped under [data-palette="cocodes"]. */
  cocodes: {
    name: "cocodes",
    label: "CoCodes · Olympus",
    bgCanvas: "#0a0e1a",
    panel: "#121a2e",
    panelDeep: "#0b1120",
    panelSoft: "rgba(18, 26, 46, 0.82)",
    border: "rgba(232, 200, 120, 0.16)",
    accentLine: "rgba(232, 200, 120, 0.30)",
    textMain: "#f3ecd9",
    textSoft: "rgba(243, 236, 217, 0.78)",
    textMuted: "rgba(243, 236, 217, 0.52)",
    accent: "#e8c879",
    danger: "#c0392b",
  },

  /** The current/default scheme — orb's constant dark teal-green. */
  "deep-teal": {
    name: "deep-teal",
    label: "Deep Teal",
    bgCanvas: "#041c1c",
    panel: "#0d2626",
    panelDeep: "#082222",
    panelSoft: "rgba(13, 38, 38, 0.78)",
    border: "rgba(240, 230, 210, 0.16)",
    accentLine: "rgba(93, 214, 197, 0.34)",
    textMain: "#f0e6d2",
    textSoft: "rgba(240, 230, 210, 0.78)",
    textMuted: "rgba(240, 230, 210, 0.58)",
    accent: "#5dd6c5",
    danger: "#ff8a7a",
  },

  /** Obsidian Gold — near-black surfaces with a warm antique-gold accent.
   *  Reads like brushed brass on black glass. */
  "obsidian-gold": {
    name: "obsidian-gold",
    label: "Obsidian Gold",
    bgCanvas: "#0a0805",
    panel: "#15110a",
    panelDeep: "#0e0b06",
    panelSoft: "rgba(21, 17, 10, 0.82)",
    border: "rgba(208, 167, 111, 0.18)",
    accentLine: "rgba(208, 167, 111, 0.36)",
    textMain: "#f3e9d4",
    textSoft: "rgba(243, 233, 212, 0.76)",
    textMuted: "rgba(243, 233, 212, 0.52)",
    accent: "#d0a76f",
    danger: "#e8836b",
  },

  /** Graphite Mono — neutral charcoal, no chroma. Architectural, restrained;
   *  the accent is a cool silver so nothing competes with content. */
  "graphite-mono": {
    name: "graphite-mono",
    label: "Graphite",
    bgCanvas: "#0c0d0f",
    panel: "#16181b",
    panelDeep: "#0f1113",
    panelSoft: "rgba(22, 24, 27, 0.82)",
    border: "rgba(228, 230, 234, 0.14)",
    accentLine: "rgba(228, 230, 234, 0.28)",
    textMain: "#ebedf0",
    textSoft: "rgba(235, 237, 240, 0.74)",
    textMuted: "rgba(235, 237, 240, 0.5)",
    accent: "#c4cad2",
    danger: "#ef7d7d",
  },

  /** Midnight Indigo — deep blue-violet night with a periwinkle accent.
   *  Calm, nocturnal, slightly editorial. */
  "midnight-indigo": {
    name: "midnight-indigo",
    label: "Midnight Indigo",
    bgCanvas: "#0a0c1a",
    panel: "#14172b",
    panelDeep: "#0d0f1f",
    panelSoft: "rgba(20, 23, 43, 0.82)",
    border: "rgba(196, 200, 240, 0.16)",
    accentLine: "rgba(139, 150, 245, 0.34)",
    textMain: "#e7e8f6",
    textSoft: "rgba(231, 232, 246, 0.76)",
    textMuted: "rgba(231, 232, 246, 0.52)",
    accent: "#9aa6f5",
    danger: "#ff7b9c",
  },

  /** Wine Burgundy — oxblood/aubergine surfaces with a muted rose-gold accent.
   *  Warm, vinous, lounge-like. */
  "wine-burgundy": {
    name: "wine-burgundy",
    label: "Burgundy",
    bgCanvas: "#190a0f",
    panel: "#27121a",
    panelDeep: "#1c0d13",
    panelSoft: "rgba(39, 18, 26, 0.82)",
    border: "rgba(232, 198, 200, 0.16)",
    accentLine: "rgba(214, 138, 142, 0.32)",
    textMain: "#f4e3e2",
    textSoft: "rgba(244, 227, 226, 0.76)",
    textMuted: "rgba(244, 227, 226, 0.52)",
    accent: "#dca08c",
    danger: "#ff8a7a",
  },

  /** Forest Jade — deep pine surfaces with a jade-green accent. Botanical,
   *  grounded, a cooler cousin of deep-teal. */
  "forest-jade": {
    name: "forest-jade",
    label: "Forest Jade",
    bgCanvas: "#08130d",
    panel: "#0f2016",
    panelDeep: "#0a1710",
    panelSoft: "rgba(15, 32, 22, 0.82)",
    border: "rgba(206, 232, 214, 0.15)",
    accentLine: "rgba(116, 204, 152, 0.32)",
    textMain: "#e7f2e8",
    textSoft: "rgba(231, 242, 232, 0.75)",
    textMuted: "rgba(231, 242, 232, 0.5)",
    accent: "#74cc98",
    danger: "#ff8a7a",
  },

  /** Porcelain Ink — a *light* palette: warm ivory surfaces with charcoal ink
   *  text and a slate-blue accent. The premium "daylight" option.
   *
   *  Contrast-tuned: the canvas is lifted to a cleaner warm-white (#f2efe6) and
   *  every text step + accent is darkened so all clear WCAG AA (≥4.5:1) against
   *  it — the previous beige (#e9e5dc) washed out muted text and the accent.
   *  textSoft/textMuted use solid hexes (not low-alpha black) so the terminal's
   *  parallel dark-on-cream ANSI ramp (see uiPalette.ts) reads at the same
   *  contrast as the chrome. */
  "porcelain-ink": {
    name: "porcelain-ink",
    label: "Porcelain",
    light: true,
    bgCanvas: "#f2efe6",
    panel: "#faf7ef",
    panelDeep: "#ece8dd",
    panelSoft: "rgba(250, 247, 239, 0.85)",
    border: "rgba(31, 29, 24, 0.18)",
    accentLine: "rgba(74, 93, 114, 0.38)",
    textMain: "#1f1d18",
    textSoft: "rgba(31, 29, 24, 0.74)",
    textMuted: "rgba(31, 29, 24, 0.58)",
    accent: "#4a5d72",
    danger: "#a63226",
  },

  /** Nordic Slate — cool blue-grey fjord surfaces with an icy sky accent.
   *  Clean, Scandinavian, low-temperature. */
  "nordic-slate": {
    name: "nordic-slate",
    label: "Nordic Slate",
    bgCanvas: "#0c1418",
    panel: "#152027",
    panelDeep: "#0f181d",
    panelSoft: "rgba(21, 32, 39, 0.82)",
    border: "rgba(206, 222, 232, 0.15)",
    accentLine: "rgba(122, 178, 208, 0.32)",
    textMain: "#e6eef3",
    textSoft: "rgba(230, 238, 243, 0.75)",
    textMuted: "rgba(230, 238, 243, 0.5)",
    accent: "#7ab2d0",
    danger: "#ff8a7a",
  },
};

export const PANEL_PALETTE_ORDER: PanelPaletteName[] = [
  "cocodes",
  "world-cup-2026",
  "deep-teal",
  "obsidian-gold",
  "graphite-mono",
  "midnight-indigo",
  "wine-burgundy",
  "forest-jade",
  "nordic-slate",
  "porcelain-ink",
];

export const DEFAULT_PANEL_PALETTE: PanelPaletteName = "cocodes";

/* ───────────────────────────── Accents ─────────────────────────────
 * The accent ("点缀") is an independent axis: it tints borders/dividers,
 * links, the cursor and HUD pills — leaving the base surface + neutral text
 * from the chosen palette intact. "Auto" keeps each base palette's own
 * coordinated accent; the rest let you freely recombine base × accent.
 */
export type AccentName =
  | "auto"
  | "gold"
  | "champagne"
  | "amber"
  | "coral"
  | "rose"
  | "mauve"
  | "periwinkle"
  | "sky"
  | "teal"
  | "jade"
  | "silver";

export interface PanelAccent {
  name: AccentName;
  label: string;
  /** null → use the base palette's own accent. */
  color: string | null;
}

export const PANEL_ACCENTS: Record<AccentName, PanelAccent> = {
  auto:       { name: "auto",       label: "Auto",       color: null },
  gold:       { name: "gold",       label: "Gold",       color: "#d0a76f" },
  champagne:  { name: "champagne",  label: "Champagne",  color: "#e6cf9f" },
  amber:      { name: "amber",      label: "Amber",      color: "#e0a955" },
  coral:      { name: "coral",      label: "Coral",      color: "#ec8a6f" },
  rose:       { name: "rose",       label: "Rose",       color: "#e29ab0" },
  mauve:      { name: "mauve",      label: "Mauve",      color: "#c39ac9" },
  periwinkle: { name: "periwinkle", label: "Periwinkle", color: "#9aa6f5" },
  sky:        { name: "sky",        label: "Sky",        color: "#7ab2d0" },
  teal:       { name: "teal",       label: "Teal",       color: "#5dd6c5" },
  jade:       { name: "jade",       label: "Jade",       color: "#74cc98" },
  silver:     { name: "silver",     label: "Silver",     color: "#c4cad2" },
};

export const PANEL_ACCENT_ORDER: AccentName[] = [
  "auto",
  "gold",
  "champagne",
  "amber",
  "coral",
  "rose",
  "mauve",
  "periwinkle",
  "sky",
  "teal",
  "jade",
  "silver",
];

export const DEFAULT_ACCENT: AccentName = "auto";

/** Resolve the effective accent colour for a base palette + accent choice. */
export function resolveAccentColor(
  palette: PanelPalette,
  accent: AccentName,
): string {
  if (accent !== "auto") {
    const a = PANEL_ACCENTS[accent];
    if (a?.color) return a.color;
  }
  return palette.accent;
}
