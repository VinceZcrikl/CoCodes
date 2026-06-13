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
    // Dark, saturated ANSI for a light canvas. `brightBlack` is the dim/faint
    // grey used by TUIs for de-emphasised lines ("+19 lines…") — kept dark
    // enough to read on cream. `white`/`brightWhite` stay near the surface so
    // inverse/selection blocks still look right.
    return {
      ...base,
      black: "#2b2822",
      brightBlack: "#6b6660",
      red: "#b4452f",
      brightRed: "#c8503a",
      green: "#2f7d52",
      brightGreen: "#3c9362",
      yellow: "#9a7320",
      brightYellow: "#b0852c",
      blue: "#3a5e88",
      brightBlue: "#4a72a0",
      magenta: "#8a4d92",
      brightMagenta: "#9d5ca5",
      cyan: "#2a7d78",
      brightCyan: "#348d88",
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
