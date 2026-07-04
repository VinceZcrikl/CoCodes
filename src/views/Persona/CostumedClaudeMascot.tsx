import { ClaudeMascotShapes } from "./ClaudeMascot";

/** The eight characters the Claude Code mascot can play. Mirrors the Session
 *  Deck wardrobe (cos0–cos7); here each is drawn in SVG so avatars stay crisp
 *  at any size. */
export const MASCOT_COSTUMES = [
  "cowboy",
  "wizard",
  "athlete",
  "scholar",
  "hero",
  "imp",
  "robot",
  "laureate",
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
};

/** Costume props drawn behind the mascot (capes and the like). */
function CostumeBack({ costume }: { costume: MascotCostume }) {
  if (costume === "hero") {
    // Crimson cape flaring out past the body's sides and bottom.
    return (
      <polygon
        points="7,9 25,9 27.5,24.5 22,23 16,24.5 10,23 4.5,24.5"
        fill="#a02828"
      />
    );
  }
  return null;
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
  }
}

/** The Claude mascot dressed as one of its eight characters — the base creature
 *  is untouched; the costume is layered behind (cape) and in front (hats etc.).
 *  Used as persona avatars; the Session Deck draws the same wardrobe with CSS. */
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
