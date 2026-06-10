/** OpenAI Codex pixel-art mascot — same structure as ClaudeMascot,
 *  in OpenAI's emerald-green palette. */
export default function CodexMascot({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* legs */}
      <rect x="9"    y="20" width="4.4" height="6" rx="1.6" fill="#047857" />
      <rect x="18.6" y="20" width="4.4" height="6" rx="1.6" fill="#047857" />
      {/* body */}
      <rect x="5" y="6.5" width="22" height="15.5" rx="4.5" fill="#059669" />
      {/* subtle top sheen */}
      <rect x="7.5" y="8.5" width="17" height="3" rx="1.5" fill="#6ee7b7" opacity="0.55" />
      {/* eyes */}
      <rect x="11"   y="11.5" width="3.4" height="5.4" rx="1.7" fill="#022c22" />
      <rect x="17.6" y="11.5" width="3.4" height="5.4" rx="1.7" fill="#022c22" />
    </svg>
  );
}
