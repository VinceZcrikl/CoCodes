/** Codex mark — a glassy blue→violet blossom with a white terminal prompt cut
 *  into it, identifying the Codex CLI alongside the Claude/Grok marks. */
export default function CodexMascot({ className = "" }: { className?: string }) {
  // Petal centres of a 6-lobe blossom around (16,16).
  const petals: Array<[number, number]> = [
    [22, 16],
    [19, 21.2],
    [13, 21.2],
    [10, 16],
    [13, 10.8],
    [19, 10.8],
  ];
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* userSpaceOnUse → one continuous gradient across all the petals */}
        <linearGradient
          id="codexGrad"
          x1="6"
          y1="5"
          x2="26"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#7ea6ff" />
          <stop offset="0.55" stopColor="#6f86f5" />
          <stop offset="1" stopColor="#9070f0" />
        </linearGradient>
        <radialGradient id="codexGlass" cx="0.36" cy="0.3" r="0.72">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* blossom body — overlapping petals share the gradient seamlessly */}
      <circle cx="16" cy="16" r="7.4" fill="url(#codexGrad)" />
      {petals.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="5.6" fill="url(#codexGrad)" />
      ))}

      {/* glassy top-left highlight */}
      <ellipse cx="13" cy="12" rx="10" ry="8" fill="url(#codexGlass)" />

      {/* terminal prompt — chevron + dash */}
      <path
        d="M12.8 12.4 L16.6 16 L12.8 19.6"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 18.7 L22 18.7"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
