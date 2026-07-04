/**
 * The app's real panel palettes, mirrored from `src/state/panelPalettes.ts`
 * so the theme gallery on the landing page re-skins its mock pane with the
 * exact colours shipped in CoCodes.
 */

export interface PanelPalette {
  name: string;
  label: string;
  bgCanvas: string;
  panel: string;
  panelDeep: string;
  border: string;
  textMain: string;
  textSoft: string;
  textMuted: string;
  accent: string;
  danger: string;
  light?: boolean;
}

export const PALETTES: PanelPalette[] = [
  {
    name: "cocodes",
    label: "CoCodes · Olympus",
    bgCanvas: "#0a0e1a",
    panel: "#121a2e",
    panelDeep: "#0b1120",
    border: "rgba(232, 200, 120, 0.16)",
    textMain: "#f3ecd9",
    textSoft: "rgba(243, 236, 217, 0.78)",
    textMuted: "rgba(243, 236, 217, 0.52)",
    accent: "#e8c879",
    danger: "#c0392b",
  },
  {
    name: "world-cup-2026",
    label: "World Cup 26",
    bgCanvas: "#070b1c",
    panel: "#0e1530",
    panelDeep: "#090f24",
    border: "rgba(232, 200, 120, 0.18)",
    textMain: "#f4ecd6",
    textSoft: "rgba(244, 236, 214, 0.78)",
    textMuted: "rgba(244, 236, 214, 0.55)",
    accent: "#e8b23a",
    danger: "#e4322b",
  },
  {
    name: "deep-teal",
    label: "Deep Teal",
    bgCanvas: "#041c1c",
    panel: "#0d2626",
    panelDeep: "#082222",
    border: "rgba(240, 230, 210, 0.16)",
    textMain: "#f0e6d2",
    textSoft: "rgba(240, 230, 210, 0.78)",
    textMuted: "rgba(240, 230, 210, 0.58)",
    accent: "#5dd6c5",
    danger: "#ff8a7a",
  },
  {
    name: "obsidian-gold",
    label: "Obsidian Gold",
    bgCanvas: "#0a0805",
    panel: "#15110a",
    panelDeep: "#0e0b06",
    border: "rgba(208, 167, 111, 0.18)",
    textMain: "#f3e9d4",
    textSoft: "rgba(243, 233, 212, 0.76)",
    textMuted: "rgba(243, 233, 212, 0.52)",
    accent: "#d0a76f",
    danger: "#e8836b",
  },
  {
    name: "graphite-mono",
    label: "Graphite",
    bgCanvas: "#0c0d0f",
    panel: "#16181b",
    panelDeep: "#0f1113",
    border: "rgba(228, 230, 234, 0.14)",
    textMain: "#ebedf0",
    textSoft: "rgba(235, 237, 240, 0.74)",
    textMuted: "rgba(235, 237, 240, 0.5)",
    accent: "#c4cad2",
    danger: "#ef7d7d",
  },
  {
    name: "midnight-indigo",
    label: "Midnight Indigo",
    bgCanvas: "#0a0c1a",
    panel: "#14172b",
    panelDeep: "#0d0f1f",
    border: "rgba(196, 200, 240, 0.16)",
    textMain: "#e7e8f6",
    textSoft: "rgba(231, 232, 246, 0.76)",
    textMuted: "rgba(231, 232, 246, 0.52)",
    accent: "#9aa6f5",
    danger: "#ff7b9c",
  },
  {
    name: "wine-burgundy",
    label: "Burgundy",
    bgCanvas: "#190a0f",
    panel: "#27121a",
    panelDeep: "#1c0d13",
    border: "rgba(232, 198, 200, 0.16)",
    textMain: "#f4e3e2",
    textSoft: "rgba(244, 227, 226, 0.76)",
    textMuted: "rgba(244, 227, 226, 0.52)",
    accent: "#dca08c",
    danger: "#ff8a7a",
  },
  {
    name: "forest-jade",
    label: "Forest Jade",
    bgCanvas: "#08130d",
    panel: "#0f2016",
    panelDeep: "#0a1710",
    border: "rgba(206, 232, 214, 0.15)",
    textMain: "#e7f2e8",
    textSoft: "rgba(231, 242, 232, 0.75)",
    textMuted: "rgba(231, 242, 232, 0.5)",
    accent: "#74cc98",
    danger: "#ff8a7a",
  },
  {
    name: "nordic-slate",
    label: "Nordic Slate",
    bgCanvas: "#0c1418",
    panel: "#152027",
    panelDeep: "#0f181d",
    border: "rgba(206, 222, 232, 0.15)",
    textMain: "#e6eef3",
    textSoft: "rgba(230, 238, 243, 0.75)",
    textMuted: "rgba(230, 238, 243, 0.5)",
    accent: "#7ab2d0",
    danger: "#ff8a7a",
  },
  {
    name: "porcelain-ink",
    label: "Porcelain",
    light: true,
    bgCanvas: "#f2efe6",
    panel: "#faf7ef",
    panelDeep: "#ece8dd",
    border: "rgba(31, 29, 24, 0.18)",
    textMain: "#1f1d18",
    textSoft: "rgba(31, 29, 24, 0.74)",
    textMuted: "rgba(31, 29, 24, 0.58)",
    accent: "#4a5d72",
    danger: "#a63226",
  },
];
