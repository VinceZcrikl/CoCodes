import {
  PANEL_PALETTES,
  resolveAccentColor,
  type PanelPaletteName,
  type AccentName,
} from "./panelPalettes";

/**
 * Cockpit UI palette.
 *
 * The panel chrome is driven by two independent axes chosen from the top-right
 * palette popover: a **base palette** (canvas / surface / borders / neutral
 * text) and an **accent** (the "点缀" colour tinting dividers, links, cursor and
 * HUD pills). `accent = "auto"` keeps the base palette's own coordinated accent;
 * any other accent recombines freely with the base. Switching either re-skins
 * every chrome surface at once.
 */

/** The full CSS custom-property set for a base palette + accent. */
export function cssVarsForPalette(
  name: PanelPaletteName,
  accent: AccentName = "auto",
): Record<string, string> {
  const p = PANEL_PALETTES[name] ?? PANEL_PALETTES["deep-teal"];
  const a = resolveAccentColor(p, accent);
  // With a custom accent, derive the accent hairline from it; with "auto" keep
  // the palette's own (hand-tuned) accent line.
  const accentLine =
    accent === "auto" ? p.accentLine : `color-mix(in srgb, ${a} 34%, transparent)`;
  return {
    "--bg-canvas": p.bgCanvas,
    "--panel": p.panel,
    "--panel-deep": p.panelDeep,
    "--panel-soft": p.panelSoft,
    "--border": p.border,
    "--teal-line": accentLine,
    "--text-main": p.textMain,
    "--text-soft": p.textSoft,
    "--text-muted": p.textMuted,
    "--danger": p.danger,
    "--accent-gold": a,
    "--orb-accent": a,
    "--shot-accent": a,
    "--gold-soft": `color-mix(in srgb, ${a} 72%, ${p.bgCanvas})`,
  };
}

/** xterm.js palette — surface from the base, cursor/yellow from the accent.
 *  The 16-colour ANSI ramp is contrast-matched to the surface: the default
 *  dark ramp washes out on a light canvas, so light palettes get a parallel
 *  dark-on-cream ramp (saturated, low-lightness hues + a readable dim grey). */
export function xtermThemeForPalette(
  name: PanelPaletteName,
  accent: AccentName = "auto",
) {
  const p = PANEL_PALETTES[name] ?? PANEL_PALETTES["deep-teal"];
  const a = resolveAccentColor(p, accent);
  const base = {
    background: p.bgCanvas,
    foreground: p.textMain,
    cursor: a,
    cursorAccent: p.bgCanvas,
    selectionBackground: `color-mix(in srgb, ${a} 24%, transparent)`,
  };
  if (p.light) {
    // Dark, saturated ANSI for a light canvas. Every hue is contrast-tuned to
    // clear WCAG AA (≥4.5:1) against the light surface — the prior ramp's
    // "bright" variants (bright green/yellow/cyan) washed out to ~3:1 and were
    // unreadable. On a light canvas "bright" can't mean lighter, so each bright
    // hue is kept as dark as (or darker than) its base while staying distinct.
    // `brightBlack` is the dim/faint grey TUIs use for de-emphasised lines
    // ("+19 lines…"). `white`/`brightWhite` stay near the surface so
    // inverse/selection blocks still look right.
    return {
      ...base,
      black: "#23211c",
      brightBlack: "#5f5b54",
      red: "#a63226",
      brightRed: "#b83c2c",
      green: "#1f6e44",
      brightGreen: "#23764a",
      yellow: "#8a6310",
      brightYellow: "#876010",
      blue: "#2f5180",
      brightBlue: "#3a6092",
      magenta: "#7a3d83",
      brightMagenta: "#8c4a95",
      cyan: "#1d6c68",
      brightCyan: "#1f7770",
      white: p.panelDeep,
      brightWhite: p.bgCanvas,
    };
  }
  return {
    ...base,
    black: p.panelDeep,
    brightBlack: "#3a564f",
    red: "#e06c75",
    brightRed: "#ff7b86",
    green: "#7fd1a6",
    brightGreen: "#9fe6bf",
    yellow: a,
    brightYellow: "#ffe45e",
    blue: "#6fb3d2",
    brightBlue: "#8fcde8",
    magenta: "#c39ac9",
    brightMagenta: "#d9b3df",
    cyan: "#5fc9c0",
    brightCyan: "#86e2da",
    white: p.textMain,
    brightWhite: "#f7f0e0",
  };
}

/** Apply a base palette + accent's CSS variables to the document root. */
export function applyPaletteVars(
  name: PanelPaletteName,
  accent: AccentName = "auto",
) {
  if (typeof document === "undefined") return;
  const vars = cssVarsForPalette(name, accent);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.setAttribute("data-palette", name);
  root.setAttribute("data-accent", accent);
  root.setAttribute(
    "data-palette-mode",
    PANEL_PALETTES[name]?.light ? "light" : "dark",
  );
}
