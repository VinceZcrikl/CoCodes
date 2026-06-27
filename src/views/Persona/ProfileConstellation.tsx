import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Pencil } from "lucide-react";
import {
  usePersonas,
  cliGroupKey,
  sortPersonasByCli,
  CLI_LABELS,
} from "../../hooks/usePersonas";
import { useModelActivity } from "../../hooks/useModelActivity";
import { useProfileStore } from "../../state/profileStore";
import PersonaAvatar, { personaColor } from "./PersonaAvatar";
import {
  setDraggingPersona,
  PERSONA_DROP_EVENT,
  type PersonaDropDetail,
} from "../../state/dragState";
import type { PersonaSummary } from "../../hooks/usePersonas";

interface Props {
  /** Model label of the active persona, shown in its brand-style pill. */
  activeModel?: string;
  /** Open the editor for an existing persona (clicking the active one). */
  onEdit: (id: string) => void;
  /** Open the editor to create a new persona (the trailing "+"). */
  onNew: () => void;
}

interface HoverState {
  id: string;
  x: number;
  y: number;
}

interface GhostState {
  persona: PersonaSummary;
  x: number;
  y: number;
}

/** Horizontal persona constellation — one avatar per persona, click to switch
 *  the active persona (injected into the terminal), plus a trailing "+" that
 *  opens the persona library. Hover reveals that persona's SOUL preview.
 *
 *  Avatars can be dragged (pointer events, not HTML5 DnD) onto split panes to
 *  rebind that pane to the persona's preferred CLI and profile. */
export default function ProfileConstellation({ activeModel, onEdit, onNew }: Props) {
  const { personas, get } = usePersonas();
  const activeId = useProfileStore((s) => s.activeProfileId);
  const setActive = useProfileStore((s) => s.setActiveProfile);
  // Live base-model pulse: blinks the indicator when the switched model is
  // actually used (Codex proxy request / Claude session launch).
  const activity = useModelActivity();
  const [hover, setHover] = useState<HoverState | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  // Full SOUL bodies, fetched lazily on first hover (the list summaries only
  // carry a 120-char preview). Keyed by persona id.
  const [souls, setSouls] = useState<Record<string, string>>({});

  const dragRef = useRef<{ persona: PersonaSummary; startX: number; startY: number } | null>(null);
  const didDragRef = useRef(false);

  const hovered = hover
    ? personas.find((p) => p.id === hover.id) ?? null
    : null;

  // Personas grouped by CLI so each kind sits together (Claude group first,
  // led by the default persona). Stable within a group: a persona keeps its
  // existing relative order, so newly created ones land beside their CLI's peers.
  const ordered = useMemo(() => sortPersonasByCli(personas), [personas]);

  // Invalidate the cached SOUL bodies whenever the persona list changes (an edit
  // anywhere emits `personas:changed` → refresh → new array). Without this, the
  // hover tooltip would keep showing a persona's pre-edit SOUL (or "No SOUL set"
  // if it was empty when first hovered). The next hover re-fetches the current one.
  useEffect(() => {
    setSouls({});
  }, [personas]);

  // Window-level pointer events so we track movement after leaving the button.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!didDragRef.current && Math.hypot(dx, dy) > 5) {
        didDragRef.current = true;
        setDraggingPersona({ id: d.persona.id, cli: d.persona.cli });
      }
      if (didDragRef.current) {
        setGhost({ persona: d.persona, x: e.clientX, y: e.clientY });
      }
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!didDragRef.current || !d) {
        didDragRef.current = false;
        setGhost(null);
        setDraggingPersona(null);
        return;
      }
      didDragRef.current = false;
      setGhost(null);
      setDraggingPersona(null);

      // Find the pane leaf under the release point.
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const paneEl = el?.closest("[data-pane-id]") as HTMLElement | null;
      if (paneEl?.dataset.paneId) {
        const detail: PersonaDropDetail = {
          paneId: paneEl.dataset.paneId,
          profileId: d.persona.id,
          cli: d.persona.cli,
        };
        window.dispatchEvent(new CustomEvent(PERSONA_DROP_EVENT, { detail }));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div className="window-chat-constellation" aria-label="Personas">
      <div className="window-chat-constellation-scroll">
        {ordered.map((p, idx) => {
          const active = p.id === activeId;
          // A thin divider whenever the CLI group changes from the previous cell.
          const newGroup =
            idx > 0 && cliGroupKey(ordered[idx - 1].cli) !== cliGroupKey(p.cli);
          return (
            <Fragment key={p.id}>
              {newGroup && (
                <span
                  className="window-chat-constellation-sep"
                  aria-hidden="true"
                />
              )}
            <button
              type="button"
              className={`window-chat-constellation-cell${active ? " active brand" : ""}`}
              style={{ ["--cell-accent" as string]: personaColor(p.id) }}
              title={active ? "Edit this persona" : undefined}
              onClick={() => {
                if (didDragRef.current) return;
                if (active) onEdit(p.id);
                else setActive(p.id);
              }}
              onMouseEnter={(e) => {
                if (dragRef.current) return;
                const r = e.currentTarget.getBoundingClientRect();
                setHover({ id: p.id, x: r.left + r.width / 2, y: r.bottom + 8 });
                // Lazily pull the full SOUL the first time this persona is hovered.
                if (souls[p.id] === undefined) {
                  void get(p.id)
                    .then((doc) =>
                      setSouls((m) => ({ ...m, [p.id]: doc.soul ?? "" })),
                    )
                    .catch(() => {});
                }
              }}
              onMouseLeave={() =>
                setHover((h) => (h?.id === p.id ? null : h))
              }
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                dragRef.current = { persona: p, startX: e.clientX, startY: e.clientY };
                didDragRef.current = false;
              }}
              aria-current={active ? "true" : undefined}
            >
              <span className="window-chat-constellation-avatar-wrap">
                <PersonaAvatar
                  id={p.id}
                  name={p.name}
                  avatar={p.avatar}
                  className="window-chat-constellation-avatar"
                />
                {active && (
                  <span className="window-chat-constellation-edit" aria-hidden="true">
                    <Pencil size={9} strokeWidth={2.5} />
                  </span>
                )}
              </span>
              {active ? (
                <span className="window-chat-constellation-brandmeta">
                  <span className="window-chat-constellation-brandname">{p.name}</span>
                  {activeModel && (
                    <span className="window-chat-constellation-brandmodel">
                      {activeModel}
                      {activity.live && activity.model === activeModel && (
                        <span
                          className="model-live-dot"
                          title={`${activeModel} is live — just used`}
                          aria-label="model active"
                        />
                      )}
                    </span>
                  )}
                </span>
              ) : (
                <span className="window-chat-constellation-label">{p.name}</span>
              )}
            </button>
            </Fragment>
          );
        })}

        <button
          type="button"
          className="window-chat-constellation-cell window-chat-constellation-add"
          onClick={onNew}
          title="New persona"
          aria-label="New persona"
        >
          <span className="window-chat-constellation-avatar-wrap">
            <span className="window-chat-constellation-add-icon">
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            </span>
          </span>
          <span className="window-chat-constellation-label">New</span>
        </button>
      </div>

      {/* Floating drag ghost — pointer-events:none so it doesn't block drops */}
      {ghost &&
        createPortal(
          <div
            className="persona-drag-ghost"
            style={{ left: ghost.x, top: ghost.y }}
            aria-hidden="true"
          >
            <PersonaAvatar
              id={ghost.persona.id}
              name={ghost.persona.name}
              avatar={ghost.persona.avatar}
              className="persona-drag-ghost-avatar"
            />
            <span className="persona-drag-ghost-label">{ghost.persona.cli}</span>
          </div>,
          document.body,
        )}

      {hovered && !ghost &&
        createPortal(
          <div
            className="window-chat-constellation-soul"
            role="tooltip"
            style={{
              left: Math.min(
                Math.max(hover?.x ?? 0, 10 + 160),
                window.innerWidth - 10 - 160,
              ),
              top: hover?.y,
            }}
          >
            <span className="window-chat-constellation-soul-name">
              {hovered.name}
              <span className="window-chat-constellation-soul-group">
                {CLI_LABELS[cliGroupKey(hovered.cli)] ?? cliGroupKey(hovered.cli)}
              </span>
            </span>
            <span className="window-chat-constellation-soul-body">
              {(souls[hovered.id] ?? hovered.soulPreview)?.trim() ||
                "No SOUL set — claude uses its default identity."}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
