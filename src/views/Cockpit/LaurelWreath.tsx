import { useId } from "react";

/** The CoCodes · Olympus palette button's golden laurel wreath — two symmetric
 *  branches of leaves rising from a tie at the bottom up both sides, open at the
 *  top, ringing the glowing orb (the "divine spark"). Built on the same 32×32
 *  grid as the mascots/Trionda ball so it drops into the disc styling, with
 *  useId()-namespaced gradient so multiple instances (header + every pane) don't
 *  collide on one def. */
export default function LaurelWreath({ className = "" }: { className?: string }) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const grad = `laurel-${uid}`;

  const CX = 16;
  const CY = 16;
  const R_STEM = 11.3;
  const R_LEAF = 12.2;

  // Point on a circle, angle in degrees measured clockwise from the top.
  const pt = (r: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
  };

  // Leaf angles down each side; the gap at the very top (±28°) frames the orb,
  // and the branches stop short of the bottom (±164°) where the tie sits.
  const ANGLES = [30, 52, 74, 96, 118, 140, 160];

  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1c8" />
          <stop offset="52%" stopColor="#f0d98a" />
          <stop offset="100%" stopColor="#c99a3e" />
        </linearGradient>
      </defs>

      {/* right branch (s = 1) and left branch (s = -1, mirrored) */}
      {[1, -1].map((s) => {
        const [sx, sy] = pt(R_STEM, s * 30);
        const [ex, ey] = pt(R_STEM, s * 160);
        const sweep = s > 0 ? 1 : 0;
        return (
          <g key={s}>
            <path
              d={`M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R_STEM} ${R_STEM} 0 0 ${sweep} ${ex.toFixed(2)} ${ey.toFixed(2)}`}
              stroke={`url(#${grad})`}
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
              opacity="0.95"
            />
            {ANGLES.map((deg, i) => {
              const ang = s * deg;
              const [lx, ly] = pt(R_LEAF, ang);
              // Leaf long axis fans outward along the branch.
              const rot = ang + s * 40;
              return (
                <ellipse
                  key={i}
                  cx={lx.toFixed(2)}
                  cy={ly.toFixed(2)}
                  rx="3.0"
                  ry="1.5"
                  fill={`url(#${grad})`}
                  stroke="rgba(38, 25, 4, 0.34)"
                  strokeWidth="0.4"
                  transform={`rotate(${rot.toFixed(1)} ${lx.toFixed(2)} ${ly.toFixed(2)})`}
                />
              );
            })}
          </g>
        );
      })}

      {/* tie / berry where the two branches meet at the bottom */}
      <circle cx={CX} cy={CY + R_STEM} r="1.5" fill={`url(#${grad})`} stroke="rgba(38, 25, 4, 0.34)" strokeWidth="0.4" />
    </svg>
  );
}
