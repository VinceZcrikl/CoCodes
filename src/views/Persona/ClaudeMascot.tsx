/** The Claude Code "little monster" — a clay/terracotta creature, the default
 *  persona's avatar. A friendly approximation of the terminal welcome sprite.
 *
 *  Skin colours are CSS-variable driven with the terracotta as fallback, so a
 *  themed context (the Session Deck sprite) can re-tint the creature to match
 *  its terminal's palette while every other usage keeps the classic clay look. */
export default function ClaudeMascot({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* legs */}
      <rect x="9" y="20" width="4.4" height="6" rx="1.6" style={{ fill: "var(--mascot-deep, #a85b43)" }} />
      <rect x="18.6" y="20" width="4.4" height="6" rx="1.6" style={{ fill: "var(--mascot-deep, #a85b43)" }} />
      {/* body */}
      <rect x="5" y="6.5" width="22" height="15.5" rx="4.5" style={{ fill: "var(--mascot-base, #cc785c)" }} />
      {/* subtle top sheen */}
      <rect x="7.5" y="8.5" width="17" height="3" rx="1.5" opacity="0.6" style={{ fill: "var(--mascot-sheen, #dd8e74)" }} />
      {/* eyes */}
      <rect x="11" y="11.5" width="3.4" height="5.4" rx="1.7" fill="#2b1a14" />
      <rect x="17.6" y="11.5" width="3.4" height="5.4" rx="1.7" fill="#2b1a14" />
    </svg>
  );
}
