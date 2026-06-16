/** Theoi logo — the three CLI marks fused: a trefoil of glowing orbs in
 *  Claude's terracotta, Codex's blue-violet and Grok's silver, converging on a
 *  gold terminal prompt. "Many AI CLIs meeting in one terminal", in the app's
 *  black-gold palette. Doubles as the app avatar.
 *
 *  Pass `framed` to render the rounded-square app-icon tile; omit it for a bare
 *  mark (e.g. inline in the header). */
export default function AppLogo({
  className = "",
  framed = false,
}: {
  className?: string;
  framed?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Each orb: bright centre fading to transparent so overlaps blend. */}
        <radialGradient id="otOrbClaude">
          <stop offset="0" stopColor="#f0b591" />
          <stop offset="0.55" stopColor="#cc785c" stopOpacity="0.92" />
          <stop offset="1" stopColor="#cc785c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="otOrbCodex">
          <stop offset="0" stopColor="#a9c2ff" />
          <stop offset="0.55" stopColor="#6f86f5" stopOpacity="0.92" />
          <stop offset="1" stopColor="#6f86f5" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="otOrbGrok">
          <stop offset="0" stopColor="#f6f8fc" />
          <stop offset="0.55" stopColor="#b6bccb" stopOpacity="0.92" />
          <stop offset="1" stopColor="#b6bccb" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="otSeat">
          <stop offset="0" stopColor="#0e0e14" stopOpacity="0.62" />
          <stop offset="1" stopColor="#0e0e14" stopOpacity="0" />
        </radialGradient>
      </defs>

      {framed && (
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="12"
          fill="#0f0f15"
          stroke="#c8a24a"
          strokeWidth="1.4"
          strokeOpacity="0.85"
        />
      )}

      {/* Trefoil of CLI orbs — Codex (top), Claude (lower-left), Grok (lower-right) */}
      <circle cx="24" cy="15.5" r="12.6" fill="url(#otOrbCodex)" />
      <circle cx="16.6" cy="28.2" r="12.6" fill="url(#otOrbClaude)" />
      <circle cx="31.4" cy="28.2" r="12.6" fill="url(#otOrbGrok)" />

      {/* Darken the convergence so the gold prompt reads */}
      <circle cx="24" cy="23.5" r="10" fill="url(#otSeat)" />

      {/* Gold terminal prompt — the unifying "terminus" */}
      <path
        d="M20.4 19.4 L25.9 23.7 L20.4 28"
        stroke="#ffd54a"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27.4 27.4 L31.6 27.4"
        stroke="#ffd54a"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
