/** Theoi · Olympus frame — a refined gold-leaf hairline edging the panel, with
 *  small palmette corner flourishes, a star medallion on the header divider, and
 *  a faint gold constellation in the lower body. Premium-minimal Greek; rendered
 *  as a pointer-events-none overlay so it never blocks the terminal. */

const GOLD = "#e3c47e";

/** A small anthemion/palmette: gold petals fanning diagonally inward from a base
 *  scroll. Drawn for the top-left corner; CSS mirrors it into the other three. */
function Palmette({ className }: { className?: string }) {
  const bx = 5;
  const by = 5;
  const petals = [];
  const N = 5;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1) - 0.5;
    const ang = 45 + t * 112; // fan ±56° about the inward diagonal
    const a = (ang * Math.PI) / 180;
    const cx = bx + Math.cos(a) * 9;
    const cy = by + Math.sin(a) * 9;
    petals.push(
      <ellipse
        key={i}
        cx={cx.toFixed(1)}
        cy={cy.toFixed(1)}
        rx="5"
        ry="1.7"
        fill={GOLD}
        opacity="0.92"
        transform={`rotate(${ang.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`}
      />,
    );
  }
  return (
    <svg className={className} viewBox="0 0 26 26" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      {petals}
      <circle cx={bx} cy={by} r="2" fill="#15151b" stroke={GOLD} strokeWidth="1" />
      <circle cx={bx} cy={by} r="0.8" fill={GOLD} />
    </svg>
  );
}

/** An eight-point gold star for the centre of the header divider. */
function StarMedallion({ className }: { className?: string }) {
  const c = 11;
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * 22.5 * Math.PI) / 180;
    const r = i % 2 === 0 ? 10 : 3.4;
    pts.push(`${(c + r * Math.sin(a)).toFixed(1)},${(c - r * Math.cos(a)).toFixed(1)}`);
  }
  return (
    <svg className={className} viewBox="0 0 22 22" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <polygon points={pts.join(" ")} fill={GOLD} opacity="0.95" />
      <circle cx={c} cy={c} r="1.7" fill="#15151b" />
      <circle cx={c} cy={c} r="0.9" fill="#f6e3a0" />
    </svg>
  );
}

/** A faint gold constellation (stars + connecting lines) for the lower body. */
function Constellation({ className }: { className?: string }) {
  const stars: [number, number][] = [
    [16, 88], [42, 66], [72, 76], [102, 50], [136, 36], [90, 24], [118, 94], [150, 70], [60, 30], [28, 48],
  ];
  const links: [number, number][] = [
    [9, 8], [8, 1], [1, 2], [2, 3], [3, 4], [3, 5], [2, 6], [4, 7], [0, 1],
  ];
  return (
    <svg className={className} viewBox="0 0 170 110" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g stroke={GOLD} strokeWidth="0.7" opacity="0.45">
        {links.map(([a, b], i) => (
          <line key={i} x1={stars[a][0]} y1={stars[a][1]} x2={stars[b][0]} y2={stars[b][1]} />
        ))}
      </g>
      {stars.map((s, i) => (
        <g key={i}>
          <circle cx={s[0]} cy={s[1]} r={i % 3 === 0 ? 4.8 : 3.4} fill={GOLD} opacity="0.16" />
          <circle cx={s[0]} cy={s[1]} r={i % 3 === 0 ? 2.2 : 1.5} fill={GOLD} />
        </g>
      ))}
    </svg>
  );
}

export default function TempleFrame() {
  return (
    <div className="theoi-temple" aria-hidden="true">
      <span className="theoi-goldframe" />
      <Palmette className="theoi-palmette theoi-palmette-tl" />
      <Palmette className="theoi-palmette theoi-palmette-tr" />
      <Palmette className="theoi-palmette theoi-palmette-bl" />
      <Palmette className="theoi-palmette theoi-palmette-br" />
      <StarMedallion className="theoi-header-star" />
      <Constellation className="theoi-constellation" />
    </div>
  );
}
