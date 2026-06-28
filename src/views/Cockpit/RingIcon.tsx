import { useId, type ReactNode } from "react";
import LaurelWreath from "./LaurelWreath";
import TriondaBall from "./TriondaBall";
import type { RingIconKind } from "../../state/themeDecor";

/** The signature glyph ringing the orb in a palette button. Olympus uses a
 *  golden laurel and World Cup the Trionda ball; every other theme gets a small
 *  motif echoing its name (tide ripple, brass compass, star orbit, ivy, snow…).
 *
 *  Each motif is drawn on the same 32×32 grid as the laurel/ball so it drops
 *  into the disc styling unchanged, with a useId()-namespaced gradient so the
 *  many instances (header + every pane) never collide on one def. Colours come
 *  from `currentColor` (the button's accent), so each ring re-tints per theme. */
export default function RingIcon({
  kind,
  className = "",
}: {
  kind: RingIconKind;
  className?: string;
}) {
  if (kind === "laurel") return <LaurelWreath className={className} />;
  if (kind === "ball") return <TriondaBall className={className} />;

  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const grad = `ring-${uid}`;

  // A point on a circle centred at (16,16), angle clockwise from the top.
  const pt = (r: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [16 + r * Math.sin(a), 16 - r * Math.cos(a)];
  };

  const svg = (children: ReactNode, defs?: ReactNode) => (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.62" />
        </linearGradient>
        {defs}
      </defs>
      {children}
    </svg>
  );

  const stroke = `url(#${grad})`;

  switch (kind) {
    /* Deep Teal — concentric tide ripples opening at the bottom. */
    case "ripple":
      return svg(
        <g stroke={stroke} strokeLinecap="round" fill="none">
          {[13, 10.5, 8].map((r, i) => (
            <path
              key={i}
              d={`M ${pt(r, -150)[0].toFixed(2)} ${pt(r, -150)[1].toFixed(2)} A ${r} ${r} 0 1 1 ${pt(r, 150)[0].toFixed(2)} ${pt(r, 150)[1].toFixed(2)}`}
              strokeWidth={1.2 - i * 0.18}
              opacity={0.95 - i * 0.18}
            />
          ))}
        </g>,
      );

    /* Obsidian Gold — a brass compass ring with cardinal ticks + a needle. */
    case "compass":
      return svg(
        <g stroke={stroke} fill={stroke}>
          <circle cx="16" cy="16" r="12.5" strokeWidth="1.2" fill="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
            const r1 = i % 2 === 0 ? 9.5 : 10.6;
            const [x1, y1] = pt(r1, deg);
            const [x2, y2] = pt(12.5, deg);
            return (
              <line
                key={deg}
                x1={x1.toFixed(2)}
                y1={y1.toFixed(2)}
                x2={x2.toFixed(2)}
                y2={y2.toFixed(2)}
                strokeWidth={i % 2 === 0 ? 1.1 : 0.7}
              />
            );
          })}
          <path
            d="M16 7 L18 16 L16 25 L14 16 Z"
            strokeWidth="0.5"
            opacity="0.92"
          />
        </g>,
      );

    /* Graphite — a precise concentric tick ring, architectural + restrained. */
    case "tick":
      return svg(
        <g stroke={stroke} fill="none">
          <circle cx="16" cy="16" r="12.5" strokeWidth="0.9" />
          {Array.from({ length: 24 }, (_, i) => {
            const deg = (i * 360) / 24;
            const long = i % 6 === 0;
            const [x1, y1] = pt(long ? 9.8 : 11.2, deg);
            const [x2, y2] = pt(12.5, deg);
            return (
              <line
                key={i}
                x1={x1.toFixed(2)}
                y1={y1.toFixed(2)}
                x2={x2.toFixed(2)}
                y2={y2.toFixed(2)}
                strokeWidth={long ? 1 : 0.55}
                opacity={long ? 0.95 : 0.6}
              />
            );
          })}
        </g>,
      );

    /* Midnight Indigo — an elliptical star orbit with a planet + compass stars. */
    case "orbit":
      return svg(
        <g stroke={stroke} fill={stroke}>
          <ellipse
            cx="16"
            cy="16"
            rx="12.5"
            ry="6.6"
            strokeWidth="1"
            fill="none"
            transform="rotate(-28 16 16)"
          />
          <circle cx="6" cy="11.6" r="1.5" />
          {[
            [25, 22, 1.5],
            [10, 6, 0.9],
            [24, 8, 0.9],
            [22, 26, 0.7],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r} />
              <circle cx={x} cy={y} r={(r as number) * 2.4} opacity="0.18" />
            </g>
          ))}
        </g>,
      );

    /* Burgundy — a grapevine tendril curling up both sides with small grapes. */
    case "vine":
      return svg(
        <g stroke={stroke} fill={stroke}>
          {[1, -1].map((s) => {
            const [sx, sy] = pt(11.5, s * 28);
            const [ex, ey] = pt(11.5, s * 158);
            const sweep = s > 0 ? 1 : 0;
            return (
              <g key={s}>
                <path
                  d={`M ${sx.toFixed(2)} ${sy.toFixed(2)} A 11.5 11.5 0 0 ${sweep} ${ex.toFixed(2)} ${ey.toFixed(2)}`}
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.95"
                />
                {[58, 96, 134].map((deg, i) => {
                  const [gx, gy] = pt(12.2, s * deg);
                  return <circle key={i} cx={gx.toFixed(2)} cy={gy.toFixed(2)} r="1.5" />;
                })}
              </g>
            );
          })}
          <circle cx="16" cy="27.5" r="1.4" />
        </g>,
      );

    /* Forest Jade — a ring of ivy leaves rising from a stem on both sides. */
    case "ivy":
      return svg(
        <g fill={stroke} stroke={stroke}>
          {[1, -1].map((s) => {
            const [sx, sy] = pt(11.5, s * 30);
            const [ex, ey] = pt(11.5, s * 158);
            const sweep = s > 0 ? 1 : 0;
            return (
              <g key={s}>
                <path
                  d={`M ${sx.toFixed(2)} ${sy.toFixed(2)} A 11.5 11.5 0 0 ${sweep} ${ex.toFixed(2)} ${ey.toFixed(2)}`}
                  strokeWidth="1"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.9"
                />
                {[44, 78, 112, 146].map((deg, i) => {
                  const [lx, ly] = pt(12.4, s * deg);
                  const rot = s * deg + s * 36;
                  return (
                    <path
                      key={i}
                      d={`M ${lx.toFixed(2)} ${ly.toFixed(2)} m -2.4 0 q 2.4 -2.6 4.8 0 q -2.4 2.6 -4.8 0 Z`}
                      transform={`rotate(${rot.toFixed(1)} ${lx.toFixed(2)} ${ly.toFixed(2)})`}
                      stroke="none"
                    />
                  );
                })}
              </g>
            );
          })}
        </g>,
      );

    /* Nordic Slate — a six-fold snowflake. */
    case "snowflake":
      return svg(
        <g stroke={stroke} strokeLinecap="round" fill="none">
          {[0, 60, 120].map((deg) => {
            const [x1, y1] = pt(12, deg);
            const [x2, y2] = pt(12, deg + 180);
            return (
              <g key={deg}>
                <line
                  x1={x1.toFixed(2)}
                  y1={y1.toFixed(2)}
                  x2={x2.toFixed(2)}
                  y2={y2.toFixed(2)}
                  strokeWidth="1.1"
                />
                {[7.5, 11].map((r, i) => {
                  const [bx, by] = pt(r, deg);
                  const [bx2, by2] = pt(r - 2.6, deg + 26);
                  const [bx3, by3] = pt(r - 2.6, deg - 26);
                  const [tx, ty] = pt(r, deg + 180);
                  const [tx2, ty2] = pt(r - 2.6, deg + 180 + 26);
                  const [tx3, ty3] = pt(r - 2.6, deg + 180 - 26);
                  return (
                    <g key={i} strokeWidth="0.7" opacity="0.9">
                      <line x1={bx.toFixed(2)} y1={by.toFixed(2)} x2={bx2.toFixed(2)} y2={by2.toFixed(2)} />
                      <line x1={bx.toFixed(2)} y1={by.toFixed(2)} x2={bx3.toFixed(2)} y2={by3.toFixed(2)} />
                      <line x1={tx.toFixed(2)} y1={ty.toFixed(2)} x2={tx2.toFixed(2)} y2={ty2.toFixed(2)} />
                      <line x1={tx.toFixed(2)} y1={ty.toFixed(2)} x2={tx3.toFixed(2)} y2={ty3.toFixed(2)} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>,
      );

    /* Porcelain — an ink seal: a soft brushed ring with a small inner mark. */
    case "seal":
      return svg(
        <g stroke={stroke} fill="none">
          <circle cx="16" cy="16" r="12.2" strokeWidth="1.8" opacity="0.9" />
          <circle cx="16" cy="16" r="12.2" strokeWidth="0.5" strokeDasharray="1 3" opacity="0.5" />
          <path
            d="M12 12 h8 M16 12 v8 M12 20 h8"
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>,
      );

    default:
      return svg(<circle cx="16" cy="16" r="12" stroke={stroke} strokeWidth="1.2" fill="none" />);
  }
}
