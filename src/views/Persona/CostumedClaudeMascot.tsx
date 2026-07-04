import { ClaudeMascotShapes } from "./ClaudeMascot";

/** The characters the Claude Code mascot can play — indices mirror the Session
 *  Deck wardrobe (cos0–cos23); here each is drawn in SVG so avatars stay crisp
 *  at any size. 0–7 archetypes, 8–15 coding scenes, 16–23 practical roles. */
export const MASCOT_COSTUMES = [
  "cowboy",
  "wizard",
  "athlete",
  "scholar",
  "hero",
  "imp",
  "robot",
  "laureate",
  "detective",
  "builder",
  "astronaut",
  "scientist",
  "firefighter",
  "artist",
  "surgeon",
  "conductor",
  "writer",
  "teacher",
  "anchor",
  "editor",
  "explorer",
  "analyst",
  "pilot",
  "chef",
] as const;
export type MascotCostume = (typeof MASCOT_COSTUMES)[number];

export const COSTUME_LABELS: Record<MascotCostume, string> = {
  cowboy: "Cowboy",
  wizard: "Wizard",
  athlete: "Athlete",
  scholar: "Scholar",
  hero: "Hero",
  imp: "Imp",
  robot: "Robot",
  laureate: "Laureate",
  detective: "Detective",
  builder: "Builder",
  astronaut: "Astronaut",
  scientist: "Scientist",
  firefighter: "Firefighter",
  artist: "Artist",
  surgeon: "Surgeon",
  conductor: "Conductor",
  writer: "Writer",
  teacher: "Teacher",
  anchor: "News Anchor",
  editor: "Video Editor",
  explorer: "Explorer",
  analyst: "Analyst",
  pilot: "Pilot",
  chef: "Chef",
};

/** Costume props drawn behind the mascot (capes, quills and the like). */
function CostumeBack({ costume }: { costume: MascotCostume }) {
  switch (costume) {
    case "hero":
      // Crimson cape flaring out past the body's sides and bottom.
      return (
        <polygon
          points="7,9 25,9 27.5,24.5 22,23 16,24.5 10,23 4.5,24.5"
          fill="#a02828"
        />
      );
    case "writer":
      // A white quill tucked behind the head.
      return (
        <g transform="rotate(28 22.5 6)">
          <ellipse cx="22.5" cy="5" rx="1.7" ry="4.6" fill="#efece2" stroke="#cfc9ba" strokeWidth="0.4" />
          <rect x="22.1" y="9.4" width="0.9" height="2.6" fill="#8a8578" />
        </g>
      );
    default:
      return null;
  }
}

/** Costume props drawn in front of the mascot (hats, bands, specs, …).
 *  Geometry notes: head top y=6.5 · body x 5–27 · eye centres (12.7, 14.2) and
 *  (19.3, 14.2) in the 32-unit viewBox. */
function CostumeFront({ costume }: { costume: MascotCostume }) {
  switch (costume) {
    case "cowboy":
      return (
        <>
          <rect x="11.5" y="1.6" width="9" height="5.6" rx="1.8" fill="#8a5731" />
          <rect x="11.5" y="4.6" width="9" height="1.7" fill="#4c2b15" />
          <ellipse cx="16" cy="6.9" rx="9.5" ry="1.8" fill="#7a4a28" />
        </>
      );
    case "wizard":
      return (
        <>
          <polygon points="16,0.3 11.2,6.6 20.8,6.6" fill="#5b4a9e" />
          <rect x="9.6" y="6" width="12.8" height="1.7" rx="0.85" fill="#4a3b85" />
          <path
            d="M16 1.9 L16.55 3.15 L17.8 3.7 L16.55 4.25 L16 5.5 L15.45 4.25 L14.2 3.7 L15.45 3.15 Z"
            fill="#f6d77a"
          />
        </>
      );
    case "athlete":
      return (
        <>
          <rect x="5.5" y="8.2" width="21" height="2.7" rx="1.35" fill="#e0533d" />
          <rect x="7.2" y="8.9" width="3.6" height="1.3" rx="0.65" fill="#fff" opacity="0.5" />
        </>
      );
    case "scholar":
      return (
        <>
          <circle cx="12.7" cy="14.2" r="3.5" fill="rgba(255,255,255,0.08)" stroke="#20150f" strokeWidth="1.1" />
          <circle cx="19.3" cy="14.2" r="3.5" fill="rgba(255,255,255,0.08)" stroke="#20150f" strokeWidth="1.1" />
          <rect x="15.1" y="13.4" width="1.8" height="1" fill="#20150f" />
        </>
      );
    case "hero":
      return null; // the cape lives behind the body
    case "imp":
      return (
        <>
          <polygon points="10.2,7 12,1.6 13.9,7" fill="#e0604a" />
          <polygon points="18.1,7 20,1.6 21.8,7" fill="#e0604a" />
        </>
      );
    case "robot":
      return (
        <>
          <rect x="15.6" y="2.2" width="0.9" height="4.6" rx="0.45" fill="#9aa7b5" />
          <circle cx="16" cy="1.9" r="1.6" fill="#bcd8ef" stroke="#8fb7d8" strokeWidth="0.5" />
        </>
      );
    case "laureate":
      return (
        <g transform="rotate(-4 16 6.4)">
          <ellipse cx="16" cy="6.4" rx="8.6" ry="1.9" fill="none" stroke="#d8b34a" strokeWidth="1.4" />
          <ellipse cx="7.6" cy="5.9" rx="1.4" ry="0.9" fill="#d8b34a" transform="rotate(-28 7.6 5.9)" />
          <ellipse cx="24.4" cy="5.9" rx="1.4" ry="0.9" fill="#d8b34a" transform="rotate(28 24.4 5.9)" />
        </g>
      );
    case "detective":
      return (
        <>
          <rect x="5.5" y="6" width="4" height="2" rx="1" fill="#74593b" />
          <rect x="22.5" y="6" width="4" height="2" rx="1" fill="#74593b" />
          <rect x="9.5" y="3" width="13" height="4.2" rx="2" fill="#8a6d4a" />
          <circle cx="19.3" cy="14.2" r="3.4" fill="rgba(255,255,255,0.08)" stroke="#20150f" strokeWidth="1" />
          <rect x="21.7" y="17" width="1" height="3" rx="0.5" fill="#20150f" transform="rotate(-30 22.2 17)" />
        </>
      );
    case "builder":
      return (
        <>
          <rect x="7.5" y="6.2" width="17" height="2" rx="1" fill="#d9a32b" />
          <rect x="10.8" y="2" width="10.4" height="4.8" rx="2.4" fill="#eebd40" />
          <rect x="15.3" y="1.4" width="1.4" height="2.4" rx="0.6" fill="#c8992a" />
        </>
      );
    case "astronaut":
      return (
        <>
          <circle cx="16" cy="12" r="9.6" fill="rgba(180,210,255,0.10)" stroke="rgba(255,255,255,0.8)" strokeWidth="1.1" />
          <ellipse cx="11" cy="6.8" rx="2.4" ry="1.2" fill="rgba(255,255,255,0.35)" transform="rotate(-30 11 6.8)" />
        </>
      );
    case "scientist":
      return (
        <>
          <rect x="5" y="13.1" width="3.6" height="1.1" fill="#20150f" />
          <rect x="23.4" y="13.1" width="3.6" height="1.1" fill="#20150f" />
          <rect x="8.6" y="11.4" width="14.8" height="5.6" rx="2.4" fill="rgba(120,220,170,0.3)" stroke="#20150f" strokeWidth="0.9" />
        </>
      );
    case "firefighter":
      return (
        <>
          <rect x="7" y="6.4" width="18" height="2" rx="1" fill="#a32e23" />
          <rect x="9.7" y="2.4" width="12.6" height="4.8" rx="2.4" fill="#c9402f" />
          <rect x="14.9" y="3.4" width="2.2" height="2.6" rx="0.5" fill="#f2d16b" />
        </>
      );
    case "artist":
      return (
        <g transform="rotate(-10 14 4.8)">
          <ellipse cx="14" cy="4.8" rx="7.6" ry="2.5" fill="#a4548e" />
          <rect x="13.4" y="1.4" width="1.2" height="1.8" rx="0.5" fill="#7d3c6b" />
        </g>
      );
    case "surgeon":
      return (
        <>
          <rect x="9.6" y="3.2" width="12.8" height="4" rx="2" fill="#8fc7a8" />
          <rect x="21.6" y="5.6" width="3" height="1.8" rx="0.6" fill="#79ad90" transform="rotate(20 23 6.5)" />
          <circle cx="16" cy="9.7" r="1.7" fill="#e8c66a" stroke="#b89a3f" strokeWidth="0.5" />
          <circle cx="15.5" cy="9.2" r="0.5" fill="rgba(255,255,255,0.85)" />
        </>
      );
    case "conductor":
      return (
        <>
          <polygon points="12.4,18.4 15.1,19.8 12.4,21.2" fill="#1d1d24" />
          <polygon points="19.6,18.4 16.9,19.8 19.6,21.2" fill="#1d1d24" />
          <rect x="14.9" y="19" width="2.2" height="1.6" rx="0.4" fill="#1d1d24" />
          <g transform="rotate(35 24.5 5)">
            <rect x="24" y="1.4" width="1" height="7.2" rx="0.5" fill="#efe9dc" />
            <circle cx="24.5" cy="1.2" r="0.9" fill="#cfc7b4" />
          </g>
        </>
      );
    case "writer":
      return null; // the quill lives behind the head
    case "teacher":
      return (
        <>
          <rect x="12.4" y="5" width="7.2" height="2.6" rx="0.6" fill="#3a3a4a" />
          <polygon points="16,1.6 24.5,4.2 16,6.8 7.5,4.2" fill="#2c2c38" />
          <rect x="24.1" y="4.2" width="0.8" height="4" rx="0.4" fill="#d8b34a" />
          <circle cx="24.5" cy="8.6" r="0.9" fill="#d8b34a" />
        </>
      );
    case "anchor":
      return (
        <>
          <path d="M9.8 8.5 A7.4 7.4 0 0 1 22.2 8.5" fill="none" stroke="#3a3a44" strokeWidth="1.3" />
          <circle cx="22.4" cy="9.4" r="1.5" fill="#3a3a44" />
          <path d="M22.4 10.6 Q23 15 20.9 16.4" fill="none" stroke="#3a3a44" strokeWidth="0.8" />
          <circle cx="20.6" cy="16.8" r="1" fill="#3a3a44" />
          <rect x="14.9" y="20" width="2.2" height="1.6" rx="0.4" fill="#c23b2e" />
          <polygon points="15.1,21.6 16.9,21.6 16.5,25.8 16,26.4 15.5,25.8" fill="#a83227" />
        </>
      );
    case "editor":
      return (
        <>
          <path d="M8.6 10.5 A8 8 0 0 1 23.4 10.5" fill="none" stroke="#2f2f3a" strokeWidth="1.6" />
          <rect x="6.6" y="9.6" width="3.6" height="6" rx="1.6" fill="#2f2f3a" />
          <rect x="21.8" y="9.6" width="3.6" height="6" rx="1.6" fill="#2f2f3a" />
        </>
      );
    case "explorer":
      return (
        <>
          <ellipse cx="16" cy="7" rx="10.2" ry="2.1" fill="#d8c9a0" stroke="#b8a87e" strokeWidth="0.4" />
          <rect x="10.2" y="2.4" width="11.6" height="5" rx="2.5" fill="#e4d7b4" />
          <rect x="10.2" y="5.6" width="11.6" height="1.4" fill="#8a7a52" />
        </>
      );
    case "analyst":
      return (
        <>
          <rect x="5.6" y="9.2" width="3" height="1.2" fill="#2f7346" />
          <rect x="23.4" y="9.2" width="3" height="1.2" fill="#2f7346" />
          <rect x="8.4" y="8.6" width="15.2" height="2.8" rx="1.4" fill="#46aa64" opacity="0.95" />
        </>
      );
    case "pilot":
      return (
        <>
          <rect x="9.7" y="2.6" width="12.6" height="4.6" rx="2.2" fill="#f0f0f4" />
          <rect x="9.7" y="6" width="12.6" height="1.5" fill="#23232e" />
          <rect x="11.4" y="7.3" width="9.2" height="1.8" rx="0.9" fill="#23232e" />
          <circle cx="16" cy="4.6" r="1" fill="#d8b34a" />
        </>
      );
    case "chef":
      return (
        <>
          <circle cx="11.8" cy="3.8" r="2.4" fill="#f4f4f8" />
          <circle cx="16" cy="2.8" r="2.7" fill="#f4f4f8" />
          <circle cx="20.2" cy="3.8" r="2.4" fill="#f4f4f8" />
          <rect x="10.4" y="3.6" width="11.2" height="3.8" fill="#f4f4f8" />
          <rect x="10.8" y="6.7" width="10.4" height="1.5" rx="0.7" fill="#d8d8e2" />
        </>
      );
  }
}

/** The Claude mascot dressed as one of its characters — the base creature is
 *  untouched; the costume is layered behind (cape, quill) and in front (hats
 *  etc.). Used as persona avatars; the Session Deck draws the same wardrobe
 *  with CSS. */
export default function CostumedClaudeMascot({
  costume,
  className = "",
}: {
  costume: MascotCostume;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <CostumeBack costume={costume} />
      <ClaudeMascotShapes />
      <CostumeFront costume={costume} />
    </svg>
  );
}
