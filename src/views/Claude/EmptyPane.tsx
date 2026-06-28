import { useEffect, useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import {
  usePersonas,
  cliGroupKey,
  sortPersonasByCli,
  CLI_LABELS,
} from "../../hooks/usePersonas";
import PersonaAvatar, { personaColor } from "../Persona/PersonaAvatar";
import RingIcon from "../Cockpit/RingIcon";
import { THEME_DECOR } from "../../state/themeDecor";
import type { PanelPaletteName } from "../../state/panelPalettes";

/** The empty state shown in a freshly-split pane that hasn't been bound to a
 *  persona yet. Invites the user to fill it — either by dragging an existing
 *  persona avatar onto it (handled by the parent pane's drop target) or by
 *  clicking the big add button, which opens a card-based persona picker.
 *
 *  Single-select: picking a card binds this pane to that persona's CLI + profile
 *  (the parent's `onPick` calls assignPaneProfile, which spawns the terminal). */
export default function EmptyPane({
  palette,
  dropActive,
  onPick,
}: {
  /** The pane's effective panel palette — drives the ring motif + accent so the
   *  empty state matches the surrounding theme. */
  palette: PanelPaletteName;
  /** True while a persona avatar is being dragged over this pane. */
  dropActive: boolean;
  /** Bind this pane to the chosen persona (profileId + its preferred CLI). */
  onPick: (profileId: string, cli: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const decor = THEME_DECOR[palette];

  return (
    <div className={`empty-pane${dropActive ? " drop-active" : ""}`}>
      {/* Soft themed motif drifting in the backdrop. */}
      <div className="empty-pane-aura" aria-hidden="true">
        <RingIcon kind={decor.ringIcon} className="empty-pane-aura-ring" />
      </div>

      {dropActive ? (
        <div className="empty-pane-drop-hint" aria-hidden="true">
          <PlusBurst />
          <span className="empty-pane-drop-text">Release to summon</span>
        </div>
      ) : (
        <div className="empty-pane-invite">
          <button
            type="button"
            className="empty-pane-add"
            onClick={() => setPicking(true)}
            aria-label="Choose a persona for this pane"
          >
            <span className="empty-pane-add-orb">
              <Plus size={22} strokeWidth={2.25} />
            </span>
            <span className="empty-pane-add-pulse" aria-hidden="true" />
          </button>
          <span className="empty-pane-title">An empty terminal awaits</span>
          <span className="empty-pane-hint">
            Drag a persona here, or click to choose one
          </span>
        </div>
      )}

      {picking && (
        <PersonaPicker
          onClose={() => setPicking(false)}
          onPick={(id, cli) => {
            setPicking(false);
            onPick(id, cli);
          }}
        />
      )}
    </div>
  );
}

/** A small animated plus that "lands" — used as the release indicator. */
function PlusBurst() {
  return (
    <span className="empty-pane-burst">
      <Plus size={30} strokeWidth={2.25} />
    </span>
  );
}

/** The card-based persona chooser. Personas show as cards (avatar · name · soul
 *  preview · CLI badge); single-click selects + fills the pane. */
function PersonaPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (profileId: string, cli: string) => void;
}) {
  const { personas } = usePersonas();
  const ordered = useMemo(() => sortPersonasByCli(personas), [personas]);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  return (
    <div className="persona-picker-backdrop" onClick={onClose}>
      <div
        className="persona-picker"
        role="dialog"
        aria-label="Choose a persona"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="persona-picker-head">
          <Sparkles size={14} strokeWidth={1.75} className="persona-picker-spark" />
          <span className="persona-picker-title">Summon a persona</span>
        </header>
        <div className="persona-picker-grid">
          {ordered.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="persona-card"
              style={{
                ["--card-accent" as string]: personaColor(p.id),
                ["--card-i" as string]: String(i),
              }}
              onClick={() => onPick(p.id, p.cli)}
            >
              <span className="persona-card-avatar-wrap">
                <PersonaAvatar
                  id={p.id}
                  name={p.name}
                  avatar={p.avatar}
                  className="persona-card-avatar"
                />
              </span>
              <span className="persona-card-meta">
                <span className="persona-card-name">{p.name}</span>
                <span className="persona-card-soul">
                  {p.soulPreview?.trim() || "Default identity"}
                </span>
              </span>
              <span className="persona-card-cli">
                {CLI_LABELS[cliGroupKey(p.cli)] ?? cliGroupKey(p.cli)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
