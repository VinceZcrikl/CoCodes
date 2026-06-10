/** xAI Grok pixel-art mascot — same structure as ClaudeMascot, violet palette.
 *  The scattered dot crown above the head is Grok's signature visual motif. */
export default function GrokMascot({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* dot-matrix crown — Grok's signature motif */}
      <circle cx="12"  cy="4.5" r="1.5" fill="#c4b5fd" />
      <circle cx="16"  cy="3.0" r="1.2" fill="#c4b5fd" opacity="0.8" />
      <circle cx="20"  cy="4.5" r="1.5" fill="#c4b5fd" opacity="0.6" />

      {/* legs */}
      <rect x="9"    y="20" width="4.4" height="6" rx="1.6" fill="#5b21b6" />
      <rect x="18.6" y="20" width="4.4" height="6" rx="1.6" fill="#5b21b6" />
      {/* body */}
      <rect x="5" y="6.5" width="22" height="15.5" rx="4.5" fill="#7c3aed" />
      {/* subtle top sheen */}
      <rect x="7.5" y="8.5" width="17" height="3" rx="1.5" fill="#c4b5fd" opacity="0.4" />
      {/* eyes */}
      <rect x="11"   y="11.5" width="3.4" height="5.4" rx="1.7" fill="#1e0a3c" />
      <rect x="17.6" y="11.5" width="3.4" height="5.4" rx="1.7" fill="#1e0a3c" />
    </svg>
  );
}
