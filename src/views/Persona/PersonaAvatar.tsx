import ClaudeMascot from "./ClaudeMascot";
import CodexMascot from "./CodexMascot";
import GrokMascot from "./GrokMascot";
import KimiMascot from "./KimiMascot";
import CostumedClaudeMascot, {
  MASCOT_COSTUMES,
  type MascotCostume,
} from "./CostumedClaudeMascot";

/** Special avatar values that render a built-in mascot SVG rather than an image
 *  or emoji. Stored literally in meta.json as e.g. "__mascot:claude__". */
export const MASCOT_SENTINEL = {
  claude: "__mascot:claude__",
  codex:  "__mascot:codex__",
  grok:   "__mascot:grok__",
  kimi:   "__mascot:kimi__",
} as const;

/** Sentinel for a costumed Claude mascot, e.g. "__mascot:claude:cowboy__". */
export function costumeSentinel(costume: MascotCostume): string {
  return `__mascot:claude:${costume}__`;
}

/** The costume encoded in an avatar value, if it is a costume sentinel. */
function costumeOf(v: string): MascotCostume | null {
  const m = /^__mascot:claude:([a-z]+)__$/.exec(v);
  if (m && (MASCOT_COSTUMES as readonly string[]).includes(m[1])) {
    return m[1] as MascotCostume;
  }
  return null;
}

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
function mascotKind(
  id: string,
  v: string,
): "claude" | "codex" | "grok" | "kimi" | null {
  if (v === MASCOT_SENTINEL.claude) return "claude";
  if (v === MASCOT_SENTINEL.codex) return "codex";
  if (v === MASCOT_SENTINEL.grok) return "grok";
  if (v === MASCOT_SENTINEL.kimi) return "kimi";
  if (v) return null; // a custom image/emoji takes precedence
  if (id === "default" || id === "claude") return "claude";
  if (id === "codex") return "codex";
  if (id === "grok") return "grok";
  if (id === "kimi") return "kimi";
  return null;
}

const MASCOT_SVG = {
  claude: ClaudeMascot,
  codex: CodexMascot,
  grok: GrokMascot,
  kimi: KimiMascot,
} as const;

/** A persona avatar. Renders, in order of preference: a custom image, a custom
 *  emoji, the Claude mascot (for the default persona), or a tinted initial. */
export default function PersonaAvatar({ id, name, avatar, className = "" }: Props) {
  const v = (avatar ?? "").trim();

  const costume = costumeOf(v);
  if (costume) {
    return (
      <span className={`persona-avatar persona-avatar-mascot ${className}`} aria-hidden="true">
        <CostumedClaudeMascot costume={costume} className="persona-mascot-svg" />
      </span>
    );
  }

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
