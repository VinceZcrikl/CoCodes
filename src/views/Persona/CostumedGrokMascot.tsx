import { useId } from "react";
import { GrokMascotShapes } from "./GrokMascot";

/** Grok's own cast — not Claude's wardrobe. Cosmic / build / vibe roles that
 *  fit the silver ring+slash creature and Grok Build's personality (fast,
 *  space-y, irreverent). Indices are free-form; Session Deck CSS costumes
 *  remain Claude's shared cos0–23 hash — these SVG variants are for persona
 *  avatars. */
export const GROK_COSTUMES = [
  // 0–7 cosmic
  "comet",
  "void",
  "satellite",
  "rocket",
  "orbit",
  "nova",
  "eclipse",
  "singularity",
  // 8–15 build
  "hacker",
  "architect",
  "debugger",
  "welder",
  "sprinter",
  "patcher",
  "stacker",
  "terminal",
  // 16–23 vibe
  "jester",
  "rebel",
  "oracle",
  "captain",
  "phantom",
  "racer",
  "chrome",
  "pioneer",
] as const;
export type GrokCostume = (typeof GROK_COSTUMES)[number];

export const GROK_COSTUME_LABELS: Record<GrokCostume, string> = {
  comet: "Comet",
  void: "Void",
  satellite: "Satellite",
  rocket: "Rocket",
  orbit: "Orbit",
  nova: "Nova",
  eclipse: "Eclipse",
  singularity: "Singularity",
  hacker: "Hacker",
  architect: "Architect",
  debugger: "Debugger",
  welder: "Welder",
  sprinter: "Sprinter",
  patcher: "Patcher",
  stacker: "Stacker",
  terminal: "Terminal",
  jester: "Jester",
  rebel: "Rebel",
  oracle: "Oracle",
  captain: "Captain",
  phantom: "Phantom",
  racer: "Racer",
  chrome: "Chrome",
  pioneer: "Pioneer",
};

/** Props drawn behind the Grok body (trails, cloaks, thrusters). */
function GrokCostumeBack({ costume }: { costume: GrokCostume }) {
  switch (costume) {
    case "comet":
      // Icy star-trail flaring behind the body.
      return (
        <g opacity="0.9">
          <ellipse cx="4.5" cy="14" rx="3.2" ry="1.1" fill="#9ec8ff" transform="rotate(-28 4.5 14)" />
          <ellipse cx="3.2" cy="17.5" rx="2.4" ry="0.85" fill="#c5dcff" transform="rotate(-28 3.2 17.5)" opacity="0.75" />
          <circle cx="2.2" cy="12.4" r="0.7" fill="#e8f2ff" />
          <circle cx="1.4" cy="19.2" r="0.5" fill="#e8f2ff" opacity="0.8" />
        </g>
      );
    case "void":
      // Deep hood/cloak swallowing the back.
      return (
        <path
          d="M6.5 8.5 Q5 7 6 4.5 Q16 2.2 26 4.5 Q27 7 25.5 8.5 L27 24 Q16 27 5 24 Z"
          fill="#1a1c24"
        />
      );
    case "rocket":
      // Side fins + rear thruster glow.
      return (
        <>
          <polygon points="4.5,11 7.2,13.5 7.2,17.5 4.5,20" fill="#7a8496" />
          <polygon points="27.5,11 24.8,13.5 24.8,17.5 27.5,20" fill="#7a8496" />
          <ellipse cx="16" cy="26.2" rx="3.2" ry="2.2" fill="#ff8a3d" opacity="0.85" />
          <ellipse cx="16" cy="26.6" rx="1.6" ry="1.3" fill="#ffe08a" />
        </>
      );
    case "phantom":
      // Translucent scarf trailing left.
      return (
        <path
          d="M6 12 Q2 14 1.5 18 Q2.5 20 5 19 Q4 16 6.5 14.5 Z"
          fill="#b8c0d4"
          opacity="0.55"
        />
      );
    case "pioneer":
      // Small trail-flag pole behind the right shoulder.
      return (
        <g transform="rotate(18 24 6)">
          <rect x="23.6" y="1.2" width="0.8" height="8" rx="0.4" fill="#c8cdd8" />
          <polygon points="24.4,1.4 29.2,2.8 24.4,4.4" fill="#e8a23a" />
        </g>
      );
    default:
      return null;
  }
}

/** Props drawn in front of the Grok body. Geometry: head top y≈6.5 · body
 *  x 5–27 · eye centres ≈(12, 13.9) and (20, 13.9). Keep the ring+slash face
 *  readable — hats sit above y=6.5, bands clear of the slash corridor. */
function GrokCostumeFront({ costume }: { costume: GrokCostume }) {
  switch (costume) {
    case "comet":
      return (
        <>
          <circle cx="16" cy="3.2" r="1.5" fill="#e8f2ff" />
          <circle cx="12.6" cy="4.4" r="0.7" fill="#b8d4ff" />
          <circle cx="19.5" cy="4.1" r="0.55" fill="#b8d4ff" />
          <path
            d="M16 1.4 L16.45 2.4 L17.5 2.75 L16.45 3.1 L16 4.1 L15.55 3.1 L14.5 2.75 L15.55 2.4 Z"
            fill="#fff"
          />
        </>
      );
    case "void":
      return (
        <>
          {/* hood rim framing the head */}
          <path
            d="M7 8.2 Q16 5.4 25 8.2"
            fill="none"
            stroke="#2a2e3a"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M8.2 8 Q16 5.8 23.8 8"
            fill="none"
            stroke="#12141a"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </>
      );
    case "satellite":
      return (
        <>
          <rect x="15.5" y="1.4" width="1" height="5.2" rx="0.5" fill="#9aa3b4" />
          <ellipse cx="16" cy="1.6" rx="4.6" ry="1.5" fill="#c5ccd8" stroke="#8a93a4" strokeWidth="0.5" />
          <ellipse cx="16" cy="1.6" rx="2.2" ry="0.7" fill="#6a7384" />
          <circle cx="20.8" cy="1.6" r="0.7" fill="#6ecbff" />
        </>
      );
    case "rocket":
      return (
        <>
          {/* nose cone cap */}
          <polygon points="16,0.4 11.4,6.6 20.6,6.6" fill="#d8dee8" />
          <rect x="11.4" y="6" width="9.2" height="1.5" rx="0.6" fill="#8a93a4" />
          <circle cx="16" cy="3.4" r="0.9" fill="#ff6b4a" />
        </>
      );
    case "orbit":
      return (
        <>
          <ellipse
            cx="16"
            cy="14"
            rx="12.4"
            ry="5.2"
            fill="none"
            stroke="#a8b4c8"
            strokeWidth="1.15"
            opacity="0.9"
            transform="rotate(-18 16 14)"
          />
          <circle cx="26.2" cy="10.6" r="1.15" fill="#e8f0ff" />
          <circle cx="5.6" cy="17.2" r="0.7" fill="#9ec0e8" opacity="0.85" />
        </>
      );
    case "nova":
      return (
        <>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <rect
              key={deg}
              x="15.5"
              y="0.6"
              width="1"
              height="4.2"
              rx="0.5"
              fill="#f0d48a"
              transform={`rotate(${deg} 16 6.5)`}
              opacity="0.9"
            />
          ))}
          <circle cx="16" cy="6.5" r="1.6" fill="#fff4c8" />
          <circle cx="16" cy="6.5" r="0.7" fill="#f0c060" />
        </>
      );
    case "eclipse":
      return (
        <>
          <circle cx="16" cy="4.2" r="3.1" fill="#e8ecf4" />
          <circle cx="17.6" cy="3.6" r="2.7" fill="#15151b" />
          <circle cx="13.2" cy="2.4" r="0.45" fill="#c8d0e0" />
          <circle cx="20.4" cy="5.8" r="0.35" fill="#c8d0e0" opacity="0.8" />
        </>
      );
    case "singularity":
      return (
        <>
          <circle cx="16" cy="3.8" r="3.4" fill="none" stroke="#8a93a8" strokeWidth="0.7" opacity="0.7" />
          <circle cx="16" cy="3.8" r="2.2" fill="none" stroke="#c0c8d8" strokeWidth="0.85" />
          <circle cx="16" cy="3.8" r="1.1" fill="#12141a" />
          <circle cx="16" cy="3.8" r="0.4" fill="#f0f1f6" />
        </>
      );
    case "hacker":
      return (
        <>
          {/* visor bar across the eyes, leaves slash readable */}
          <rect x="8.2" y="11.6" width="15.6" height="3.4" rx="1.2" fill="#0e1016" opacity="0.92" />
          <rect x="9" y="12.2" width="5.2" height="1.1" rx="0.4" fill="#3dff9a" opacity="0.75" />
          <rect x="17.8" y="12.2" width="5.2" height="1.1" rx="0.4" fill="#3dff9a" opacity="0.75" />
          <rect x="6.4" y="10.8" width="2" height="5" rx="0.8" fill="#2a2e38" />
          <rect x="23.6" y="10.8" width="2" height="5" rx="0.8" fill="#2a2e38" />
        </>
      );
    case "architect":
      return (
        <>
          {/* folded blueprint crown + T-square accent */}
          <rect x="8.5" y="3.2" width="15" height="3.8" rx="0.6" fill="#3d6ea8" />
          <path d="M9.2 4.2 H22.2 M9.2 5.2 H20 M9.2 6.2 H21" stroke="#9ec4ef" strokeWidth="0.45" opacity="0.8" />
          <rect x="22.8" y="1.6" width="0.9" height="7.2" rx="0.4" fill="#c8cdd6" />
          <rect x="20.2" y="1.6" width="5.6" height="0.9" rx="0.4" fill="#c8cdd6" />
        </>
      );
    case "debugger":
      return (
        <>
          {/* hex-bug antenna + one-lens loop (not Claude's monocle pair) */}
          <circle cx="12.2" cy="2.4" r="1.3" fill="#6ecb7a" />
          <circle cx="19.8" cy="2.4" r="1.3" fill="#6ecb7a" />
          <rect x="11.8" y="3.4" width="0.8" height="3.4" rx="0.4" fill="#4a9a56" />
          <rect x="19.4" y="3.4" width="0.8" height="3.4" rx="0.4" fill="#4a9a56" />
          <circle cx="20.2" cy="14" r="3.6" fill="rgba(255,255,255,0.06)" stroke="#1a1c22" strokeWidth="1.05" />
          <rect x="22.8" y="16.6" width="1.1" height="3.2" rx="0.5" fill="#1a1c22" transform="rotate(-35 23.3 18)" />
        </>
      );
    case "welder":
      return (
        <>
          <rect x="8.4" y="8.8" width="15.2" height="7.2" rx="2" fill="#2c3038" />
          <rect x="9.6" y="10" width="12.8" height="4.6" rx="1.2" fill="#1a1c22" />
          <rect x="10.4" y="10.8" width="4.4" height="3" rx="0.6" fill="#f0a020" opacity="0.85" />
          <rect x="17.2" y="10.8" width="4.4" height="3" rx="0.6" fill="#f0a020" opacity="0.85" />
          <circle cx="24.8" cy="7.2" r="0.55" fill="#ffe08a" />
          <circle cx="26.2" cy="9" r="0.4" fill="#ff8a3d" />
          <circle cx="23.6" cy="5.8" r="0.35" fill="#fff" />
        </>
      );
    case "sprinter":
      return (
        <>
          {/* horizontal speed bars — different geometry from the face slash */}
          <rect x="4.2" y="10.2" width="6.4" height="1.3" rx="0.65" fill="#5ce1e6" opacity="0.9" />
          <rect x="3.4" y="13.4" width="5.2" height="1.1" rx="0.55" fill="#5ce1e6" opacity="0.65" />
          <rect x="4.8" y="16.4" width="4.4" height="1.1" rx="0.55" fill="#5ce1e6" opacity="0.45" />
          <rect x="11" y="2.4" width="10" height="3.6" rx="1.8" fill="#1e222c" />
          <rect x="12.2" y="3.2" width="3.2" height="1.1" rx="0.5" fill="#5ce1e6" />
        </>
      );
    case "patcher":
      return (
        <>
          {/* bandage patch + tiny wrench */}
          <rect x="20.4" y="16.4" width="5.2" height="2.6" rx="0.6" fill="#efe6c8" transform="rotate(-22 23 17.7)" />
          <rect x="21.2" y="17.2" width="3.6" height="0.55" fill="#c8b88a" transform="rotate(-22 23 17.5)" />
          <g transform="rotate(40 7.5 8)">
            <rect x="6.6" y="4.2" width="1.1" height="6.4" rx="0.5" fill="#9aa3b4" />
            <circle cx="7.15" cy="4" r="1.4" fill="none" stroke="#9aa3b4" strokeWidth="0.9" />
          </g>
        </>
      );
    case "stacker":
      return (
        <>
          <rect x="11.2" y="4.4" width="9.6" height="2.2" rx="0.5" fill="#6f8fd4" />
          <rect x="12.2" y="2.4" width="7.6" height="2.2" rx="0.5" fill="#8aa6e8" />
          <rect x="13.2" y="0.5" width="5.6" height="2.1" rx="0.5" fill="#a8c0f4" />
        </>
      );
    case "terminal":
      return (
        <>
          <rect x="8" y="10.6" width="16" height="6.2" rx="1.4" fill="#0c120e" stroke="#1e2a22" strokeWidth="0.7" />
          <rect x="9.2" y="11.6" width="13.6" height="4.2" rx="0.7" fill="#0a1a10" />
          {/* tiny prompt glyphs */}
          <path d="M10.4 13.2 L11.6 14.2 L10.4 15.2" stroke="#3dff9a" strokeWidth="0.7" strokeLinecap="round" fill="none" />
          <rect x="12.6" y="14.5" width="3.2" height="0.7" rx="0.3" fill="#3dff9a" opacity="0.85" />
          <rect x="16.4" y="12.4" width="0.7" height="2.8" rx="0.3" fill="#3dff9a" opacity="0.55" />
        </>
      );
    case "jester":
      return (
        <>
          {/* asymmetric silver/black bells — witty, not a purple wizard hat */}
          <polygon points="10.5,7 7.2,1.6 13.2,5.8" fill="#1a1c24" />
          <polygon points="21.5,7 24.8,1.6 18.8,5.8" fill="#d8dee8" />
          <circle cx="7.2" cy="1.4" r="1.15" fill="#e8a23a" />
          <circle cx="24.8" cy="1.4" r="1.15" fill="#e8a23a" />
          <rect x="12.4" y="5.6" width="7.2" height="1.6" rx="0.7" fill="#2a2e38" />
        </>
      );
    case "rebel":
      return (
        <>
          <path d="M6.5 10.5 Q16 6.8 25.5 10.5 L24.2 13.2 Q16 10.2 7.8 13.2 Z" fill="#c23b2e" />
          <polygon points="16,1.2 17.2,4.2 20.4,4.4 18,6.5 18.7,9.6 16,8 13.3,9.6 14,6.5 11.6,4.4 14.8,4.2 Z" fill="#f0f1f6" />
        </>
      );
    case "oracle":
      return (
        <>
          <circle cx="16" cy="2.8" r="2.4" fill="none" stroke="#b8a0e8" strokeWidth="0.9" />
          <circle cx="16" cy="2.8" r="1.2" fill="#6a4db8" />
          <circle cx="15.5" cy="2.3" r="0.4" fill="#e8dcff" />
          <rect x="15.6" y="5" width="0.8" height="1.8" rx="0.4" fill="#9a88c8" />
          {/* side runes */}
          <circle cx="6.4" cy="12" r="0.55" fill="#b8a0e8" opacity="0.7" />
          <circle cx="25.6" cy="12" r="0.55" fill="#b8a0e8" opacity="0.7" />
        </>
      );
    case "captain":
      return (
        <>
          <rect x="9.4" y="2.2" width="13.2" height="4.4" rx="1.4" fill="#2a2e38" />
          <rect x="8" y="5.6" width="16" height="1.7" rx="0.7" fill="#1a1c24" />
          <polygon points="9.4,2.4 16,0.3 22.6,2.4" fill="#3a3e48" />
          <circle cx="16" cy="3.6" r="1" fill="#e8c66a" />
          <circle cx="16" cy="3.6" r="0.35" fill="#fff4c8" />
        </>
      );
    case "phantom":
      return (
        <>
          {/* soft veil over upper face */}
          <path
            d="M7.5 9.2 Q16 7.4 24.5 9.2 L23.5 12.4 Q16 10.8 8.5 12.4 Z"
            fill="#d0d6e4"
            opacity="0.45"
          />
          <circle cx="25.4" cy="8.2" r="0.6" fill="#e8ecf4" opacity="0.7" />
        </>
      );
    case "racer":
      return (
        <>
          <ellipse cx="16" cy="9.5" rx="10.2" ry="7.4" fill="#1e222c" />
          <ellipse cx="16" cy="10.2" rx="7.6" ry="4.8" fill="#0e1016" />
          <rect x="9.2" y="9.2" width="5.6" height="2.4" rx="0.8" fill="#5ce1e6" opacity="0.8" />
          <rect x="17.2" y="9.2" width="5.6" height="2.4" rx="0.8" fill="#5ce1e6" opacity="0.8" />
          <rect x="13.6" y="3.4" width="4.8" height="1.4" rx="0.6" fill="#e8a23a" />
        </>
      );
    case "chrome":
      return (
        <>
          {/* mirror band — reflective strip, not scholar glasses */}
          <rect x="6.2" y="10.4" width="19.6" height="4.8" rx="2.2" fill="#c8d0dc" />
          <rect x="7" y="11.1" width="18" height="3.2" rx="1.5" fill="#e8eef6" />
          <rect x="8" y="11.5" width="6" height="1.2" rx="0.5" fill="#fff" opacity="0.7" />
          <rect x="5" y="11.8" width="2" height="2" rx="0.5" fill="#9aa3b4" />
          <rect x="25" y="11.8" width="2" height="2" rx="0.5" fill="#9aa3b4" />
        </>
      );
    case "pioneer":
      return (
        <>
          <ellipse cx="16" cy="6.6" rx="10" ry="2" fill="#c4b896" />
          <rect x="10.6" y="2.2" width="10.8" height="4.6" rx="2.2" fill="#d8c9a0" />
          <rect x="10.6" y="5.4" width="10.8" height="1.3" fill="#6a5a38" />
          {/* signal pin */}
          <circle cx="22.4" cy="3.6" r="0.9" fill="#3dff9a" />
        </>
      );
    default:
      return null;
  }
}

/** The Grok mascot in one of its own characters — base creature (ring + slash)
 *  is untouched; costume layers sit behind and in front. */
export default function CostumedGrokMascot({
  costume,
  className = "",
}: {
  costume: GrokCostume;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gradId = `grokSkin-${uid}`;
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="8"
          y1="6"
          x2="26"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#c8ceda" />
          <stop offset="0.55" stopColor="#9aa2b2" />
          <stop offset="1" stopColor="#7a8292" />
        </linearGradient>
      </defs>
      <GrokCostumeBack costume={costume} />
      <GrokMascotShapes skinPaint={`var(--mascot-base, url(#${gradId}))`} />
      <GrokCostumeFront costume={costume} />
    </svg>
  );
}
