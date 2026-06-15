import { useId } from "react";

/** The World Cup palette button's soccer ball. A classic Telstar — white sphere,
 *  black central pentagon, five seams out to five rim pentagons — chosen because
 *  it reads instantly as a *football* even at 15–22px (the official 2026 Trionda
 *  ball's abstract panels turn to mush that small). A thin trophy-gold rim is the
 *  2026 nod. Built on the 32×32 mascot grid so it drops into the disc styling. */
export default function TriondaBall({ className = "" }: { className?: string }) {
  // Multiple balls render at once (header + every pane button); namespace the
  // gradient/clip ids so the instances don't share (and collide on) one def.
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const sphere = `ball-sphere-${uid}`;
  const shade = `ball-shade-${uid}`;
  const clip = `ball-clip-${uid}`;

  const INK = "#16171d"; // near-black pentagons + seams
  const GOLD = "#e8b23a"; // trophy-gold rim nod

  // Central pentagon (point-up) + the top rim pentagon (point-in); the other
  // four of each are the same shape rotated 72° about the centre.
  const PENT = "16,11.8 19.99,14.70 18.47,19.40 13.53,19.40 12.01,14.70";
  const RIM = "16,6.1 13.81,4.51 14.65,1.94 17.35,1.94 18.19,4.51";
  const spokes = [0, 1, 2, 3, 4];

  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={sphere} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f1f3f7" />
          <stop offset="100%" stopColor="#dde1ea" />
        </radialGradient>
        <radialGradient id={shade} cx="0.36" cy="0.30" r="0.85">
          <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(10,14,30,0.22)" />
        </radialGradient>
        <clipPath id={clip}>
          <circle cx="16" cy="16" r="14.5" />
        </clipPath>
      </defs>

      {/* white sphere + depth */}
      <circle cx="16" cy="16" r="14.5" fill={`url(#${sphere})`} />
      <circle cx="16" cy="16" r="14.5" fill={`url(#${shade})`} />

      {/* the Telstar pattern (clipped to the sphere) */}
      <g clipPath={`url(#${clip})`}>
        {spokes.map((i) => (
          <line
            key={`seam${i}`}
            x1="16"
            y1="11.8"
            x2="16"
            y2="6.1"
            stroke={INK}
            strokeWidth="1.1"
            strokeLinecap="round"
            transform={`rotate(${i * 72} 16 16)`}
          />
        ))}
        {spokes.map((i) => (
          <polygon
            key={`rim${i}`}
            points={RIM}
            fill={INK}
            transform={`rotate(${i * 72} 16 16)`}
          />
        ))}
        <polygon points={PENT} fill={INK} />
      </g>

      {/* trophy-gold rim — the 2026 nod */}
      <circle cx="16" cy="16" r="14.2" fill="none" stroke={GOLD} strokeWidth="0.9" />
      {/* crisp outer edge */}
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(10,14,30,0.22)" strokeWidth="0.6" />
    </svg>
  );
}
