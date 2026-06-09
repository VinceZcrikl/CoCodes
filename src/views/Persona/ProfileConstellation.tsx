import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { usePersonas } from "../../hooks/usePersonas";
import { useProfileStore } from "../../state/profileStore";
import PersonaAvatar, { personaColor } from "./PersonaAvatar";

interface Props {
  /** Opens the persona library (create / edit / delete). */
  onManage: () => void;
}

interface HoverState {
  id: string;
  x: number;
  y: number;
}

/** Horizontal persona constellation — one avatar per persona, click to switch
 *  the active persona (injected into the terminal), plus a trailing "+" that
 *  opens the persona library. Hover reveals that persona's SOUL preview. Ported
 *  from orb's ProfileConstellation. */
export default function ProfileConstellation({ onManage }: Props) {
  const { personas } = usePersonas();
  const activeId = useProfileStore((s) => s.activeProfileId);
  const setActive = useProfileStore((s) => s.setActiveProfile);
  const [hover, setHover] = useState<HoverState | null>(null);

  const hovered = hover
    ? personas.find((p) => p.id === hover.id) ?? null
    : null;

  return (
    <div className="window-chat-constellation" aria-label="Personas">
      <div className="window-chat-constellation-scroll">
        {personas.map((p) => {
          const active = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              className={`window-chat-constellation-cell${active ? " active" : ""}`}
              style={{ ["--cell-accent" as string]: personaColor(p.id) }}
              onClick={() => setActive(p.id)}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHover({ id: p.id, x: r.left + r.width / 2, y: r.bottom + 8 });
              }}
              onMouseLeave={() =>
                setHover((h) => (h?.id === p.id ? null : h))
              }
              aria-current={active ? "true" : undefined}
            >
              <span className="window-chat-constellation-avatar-wrap">
                <PersonaAvatar
                  id={p.id}
                  name={p.name}
                  avatar={p.avatar}
                  className="window-chat-constellation-avatar"
                />
              </span>
              <span className="window-chat-constellation-label">{p.name}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="window-chat-constellation-cell window-chat-constellation-add"
          onClick={onManage}
          title="Manage personas"
          aria-label="Manage personas"
        >
          <span className="window-chat-constellation-avatar-wrap">
            <span className="window-chat-constellation-add-icon">
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            </span>
          </span>
          <span className="window-chat-constellation-label">New</span>
        </button>
      </div>

      {hovered &&
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
            </span>
            <span className="window-chat-constellation-soul-body">
              {hovered.soulPreview?.trim() ||
                "No SOUL set — claude uses its default identity."}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
