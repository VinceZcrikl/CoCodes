import ClaudeMascot from "./ClaudeMascot";
import CodexMascot from "./CodexMascot";
import GrokMascot from "./GrokMascot";

/** Special avatar values that render a built-in mascot SVG rather than an image
 *  or emoji. Stored literally in meta.json as e.g. "__mascot:claude__". */
export const MASCOT_SENTINEL = {
  claude: "__mascot:claude__",
  codex:  "__mascot:codex__",
  grok:   "__mascot:grok__",
} as const;

/** Stable accent palette for persona avatars (mirrors orb's member palette). */
const PALETTE = [
  "#5dd6c5",
  "#ffd700",
  "#a78bfa",
  "#f97316",
  "#7fd1a6",
  "#f9a8d4",
  "#6fb3d2",
  "#c39ac9",
  "#e06c75",
  "#86e2da",
];

/** Pick a stable colour for a persona by hashing its id. */
export function personaColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function isImage(v: string): boolean {
  return (
    v.startsWith("data:image/") ||
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("/") ||
    v.startsWith("file:")
  );
}

interface Props {
  id: string;
  name: string;
  /** A data URL / URL (image) or an emoji. Empty → mascot (default persona) or
   *  a tinted initial. */
  avatar?: string;
  className?: string;
}

/** Which built-in mascot (if any) this avatar resolves to. */
function mascotKind(id: string, v: string): "claude" | "codex" | "grok" | null {
  if (v === MASCOT_SENTINEL.claude) return "claude";
  if (v === MASCOT_SENTINEL.codex) return "codex";
  if (v === MASCOT_SENTINEL.grok) return "grok";
  if (v) return null; // a custom image/emoji takes precedence
  if (id === "default" || id === "claude") return "claude";
  if (id === "codex") return "codex";
  if (id === "grok") return "grok";
  return null;
}

const MASCOT_SVG = {
  claude: ClaudeMascot,
  codex: CodexMascot,
  grok: GrokMascot,
} as const;

/** A persona avatar. Renders, in order of preference: a custom image, a custom
 *  emoji, the Claude mascot (for the default persona), or a tinted initial. */
export default function PersonaAvatar({ id, name, avatar, className = "" }: Props) {
  const v = (avatar ?? "").trim();

  const kind = mascotKind(id, v);
  if (kind) {
    const Mascot = MASCOT_SVG[kind];
    return (
      <span className={`persona-avatar persona-avatar-mascot ${className}`} aria-hidden="true">
        <Mascot className="persona-mascot-svg" />
      </span>
    );
  }

  if (v && isImage(v)) {
    return (
      <span className={`persona-avatar persona-avatar-img ${className}`}>
        <img src={v} alt={name} draggable={false} />
      </span>
    );
  }

  if (v) {
    // Emoji / short text avatar.
    return (
      <span className={`persona-avatar persona-avatar-emoji ${className}`} aria-hidden="true">
        {v}
      </span>
    );
  }

  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <span
      className={`persona-avatar ${className}`}
      style={{ ["--persona-color" as string]: personaColor(id) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
