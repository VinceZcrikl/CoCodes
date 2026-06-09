import { ORB_THEMES, type OrbThemeName } from "./orbThemes";

/**
 * Cockpit UI palette.
 *
 * Orb keeps a **constant** dark teal/green base for the panel and only swaps the
 * accent (`--orb-accent`) per theme — the WebGL orb changes colour, the chat
 * surface does not. We mirror that exactly: the base below is fixed (orb's own
 * values) and theme switching changes only the accent-driven tokens.
 */

// Orb's constant base — the green/teal panel that never changes with theme.
const BASE: Record<string, string> = {
  "--bg-canvas": "#041c1c",
  "--panel": "#0d2626",
  "--panel-deep": "#082222",
  "--panel-soft": "rgba(13, 38, 38, 0.78)",
  "--border": "rgba(240, 230, 210, 0.16)",
  "--teal-line": "rgba(93, 214, 197, 0.34)",
  "--text-main": "#f0e6d2",
  "--text-soft": "rgba(240, 230, 210, 0.78)",
  "--text-muted": "rgba(240, 230, 210, 0.58)",
  "--danger": "#ff8a7a",
};

/** The full CSS custom-property set: constant base + this theme's accent. */
export function cssVarsForTheme(name: OrbThemeName): Record<string, string> {
  const accent = ORB_THEMES[name].accent;
  return {
    ...BASE,
    "--accent-gold": accent,
    "--orb-accent": accent,
    "--shot-accent": accent,
    "--gold-soft": `color-mix(in srgb, ${accent} 72%, #000000)`,
  };
}

/** xterm.js palette — orb's constant teal base, cursor/yellow tinted by accent. */
export function xtermThemeForTheme(name: OrbThemeName) {
  const accent = ORB_THEMES[name].accent;
  return {
    background: "#041c1c",
    foreground: "#e8ddc6",
    cursor: accent,
    cursorAccent: "#041c1c",
    selectionBackground: `color-mix(in srgb, ${accent} 24%, transparent)`,
    black: "#0a2624",
    brightBlack: "#3a564f",
    red: "#e06c75",
    brightRed: "#ff7b86",
    green: "#7fd1a6",
    brightGreen: "#9fe6bf",
    yellow: accent,
    brightYellow: "#ffe45e",
    blue: "#6fb3d2",
    brightBlue: "#8fcde8",
    magenta: "#c39ac9",
    brightMagenta: "#d9b3df",
    cyan: "#5fc9c0",
    brightCyan: "#86e2da",
    white: "#e8ddc6",
    brightWhite: "#f7f0e0",
  };
}

/** Apply a theme's CSS variables to the document root. */
export function applyThemeVars(name: OrbThemeName) {
  if (typeof document === "undefined") return;
  const vars = cssVarsForTheme(name);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.setAttribute("data-theme", name);
}
