import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { usePaletteStore } from "../../state/paletteStore";
import {
  PANEL_PALETTES,
  PANEL_PALETTE_ORDER,
  PANEL_ACCENTS,
  PANEL_ACCENT_ORDER,
  resolveAccentColor,
  type PanelPalette,
  type PanelPaletteName,
  type AccentName,
} from "../../state/panelPalettes";

interface Props {
  onClose: () => void;
  /** Controlled mode (per-pane recolour). Omit → drives the global palette
   *  store (the whole-panel picker). */
  value?: { name: PanelPaletteName; accent: AccentName };
  onPalette?: (name: PanelPaletteName) => void;
  onAccent?: (accent: AccentName) => void;
  /** When set, shows a "reset to default" action (clears the pane override). */
  onReset?: () => void;
}

/** A single palette swatch — a mini mock of the panel: surface card, a couple
 *  of text lines and an accent dot, so the user previews the real scheme. */
function Swatch({
  palette,
  active,
  onSelect,
}: {
  palette: PanelPalette;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`palette-swatch${active ? " active" : ""}`}
      onClick={onSelect}
      title={palette.label}
      aria-pressed={active}
      style={{
        ["--sw-canvas" as string]: palette.bgCanvas,
        ["--sw-panel" as string]: palette.panel,
        ["--sw-border" as string]: palette.border,
        ["--sw-text" as string]: palette.textMain,
        ["--sw-muted" as string]: palette.textMuted,
        ["--sw-accent" as string]: palette.accent,
      }}
    >
      <span className="palette-swatch-preview" aria-hidden="true">
        <span className="palette-swatch-bar palette-swatch-bar-wide" />
        <span className="palette-swatch-bar palette-swatch-bar-narrow" />
        <span className="palette-swatch-dot" />
        {active && (
          <span className="palette-swatch-check">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="palette-swatch-label">{palette.label}</span>
    </button>
  );
}

/** The colour-palette popover anchored under the top-right palette button.
 *  Pure preset picker: click a curated scheme to re-skin the whole panel
 *  (surface / borders / text / accent). Closes on outside-click or Escape. */
export default function PalettePanel({
  onClose,
  value,
  onPalette,
  onAccent,
  onReset,
}: Props) {
  const gName = usePaletteStore((s) => s.name);
  const gSetPalette = usePaletteStore((s) => s.setPalette);
  const gAccent = usePaletteStore((s) => s.accent);
  const gSetAccent = usePaletteStore((s) => s.setAccent);
  const ref = useRef<HTMLDivElement>(null);

  // Controlled (per-pane) when `value` is supplied, else the global store.
  const perPane = value !== undefined;
  const active = value?.name ?? gName;
  const activeAccent = value?.accent ?? gAccent;
  const setPalette = onPalette ?? gSetPalette;
  const setAccent = onAccent ?? gSetAccent;

  // "Auto" previews the current base palette's own accent.
  const accentPreview = (name: AccentName): string =>
    PANEL_ACCENTS[name].color ?? resolveAccentColor(PANEL_PALETTES[active], "auto");

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer the mousedown listener a tick so the opening click doesn't
    // immediately close the panel.
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDown);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="palette-popover" ref={ref} role="dialog" aria-label="Panel palette">
      <div className="palette-popover-head">
        <span className="palette-popover-title">
          {perPane ? "This terminal" : "Panel palette"}
        </span>
        <span className="palette-popover-sub">
          {perPane ? "Recolour just this pane" : "Pick a scheme for the whole panel"}
        </span>
        {onReset && (
          <button type="button" className="palette-reset" onClick={onReset}>
            Reset to default
          </button>
        )}
      </div>
      <div className="palette-grid">
        {PANEL_PALETTE_ORDER.map((name) => (
          <Swatch
            key={name}
            palette={PANEL_PALETTES[name]}
            active={name === active}
            onSelect={() => setPalette(name)}
          />
        ))}
      </div>

      <div className="palette-popover-head palette-popover-head-accent">
        <span className="palette-popover-title">Accent</span>
        <span className="palette-popover-sub">Borders, links &amp; cursor tint</span>
      </div>
      <div className="palette-accents">
        {PANEL_ACCENT_ORDER.map((name) => {
          const isActive = name === activeAccent;
          return (
            <button
              key={name}
              type="button"
              className={`palette-accent${isActive ? " active" : ""}${
                name === "auto" ? " is-auto" : ""
              }`}
              onClick={() => setAccent(name)}
              title={PANEL_ACCENTS[name].label}
              aria-pressed={isActive}
              style={{ ["--ac" as string]: accentPreview(name) }}
            >
              {isActive && (
                <span className="palette-accent-check">
                  <Check size={10} strokeWidth={3.5} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
