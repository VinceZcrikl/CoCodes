/** Kimi Code mark — Moonshot's "K" paired with a crescent moon (Kimi's lunar
 *  motif) and the brand's bright-blue accent dot. Drawn on the shared dark
 *  avatar disc like the Claude/Codex/Grok marks, so it reads as one family. */
export default function KimiMascot({ className = "" }: { className?: string }) {
  const INK = "#f4f5f8";   // the white "K"
  const MOON = "#cdd2da";  // moonlight grey
  const DISC = "#15151b";  // matches the avatar disc — carves the crescent
  const BLUE = "#3d9bff";  // Kimi's accent dot
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* crescent moon, right side: a lit disc with an offset bite taken out */}
      <circle cx="21.8" cy="15.6" r="5" fill={MOON} />
      <circle cx="24.4" cy="13.2" r="4.5" fill={DISC} />

      {/* bold geometric "K", left side */}
      <g stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="10" y1="8.4" x2="10" y2="23.6" />
        <line x1="10" y1="16" x2="16.6" y2="8.6" />
        <line x1="10" y1="16" x2="16.6" y2="23.4" />
      </g>

      {/* the signature accent dot, riding the K's upper shoulder */}
      <circle cx="18.4" cy="9.2" r="1.85" fill={BLUE} />
    </svg>
  );
}
