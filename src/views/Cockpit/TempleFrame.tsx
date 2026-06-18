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

/** A small laurel sprig — Apollo's victory laurel. A curved stem with paired
 *  leaves alternating up its length, drawn for the left flank; CSS mirrors it
 *  for the right so the pair embraces the wordmark like a half-wreath. */
function LaurelSprig({ className }: { className?: string }) {
  const P0: [number, number] = [11, 26.5]; // base (bottom)
  const P1: [number, number] = [5.5, 13]; // bows outward
  const P2: [number, number] = [9.5, 2]; // tip
  const at = (t: number): [number, number] => {
    const m = 1 - t;
    return [
      m * m * P0[0] + 2 * m * t * P1[0] + t * t * P2[0],
      m * m * P0[1] + 2 * m * t * P1[1] + t * t * P2[1],
    ];
  };
  const angAt = (t: number): number => {
    const m = 1 - t;
    const dx = 2 * m * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]);
    const dy = 2 * m * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };
  const leaves = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const t = 0.1 + (i / (N - 1)) * 0.82;
    const [sx, sy] = at(t);
    const splay = angAt(t) + (i % 2 === 0 ? -1 : 1) * 46; // alternate sides
    const cx = sx + Math.cos((splay * Math.PI) / 180) * 3.6;
    const cy = sy + Math.sin((splay * Math.PI) / 180) * 3.6;
    leaves.push(
      <ellipse
        key={i}
        cx={cx.toFixed(1)}
        cy={cy.toFixed(1)}
        rx="3.6"
        ry="1.4"
        fill={GOLD}
        opacity="0.9"
        transform={`rotate(${splay.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`}
      />,
    );
  }
  return (
    <svg className={className} viewBox="0 0 22 28" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path
        d={`M${P0[0]} ${P0[1]} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`}
        stroke={GOLD}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.78"
      />
      {leaves}
      <circle cx={P0[0]} cy={P0[1] - 0.5} r="1.1" fill="#f6e3a0" />
    </svg>
  );
}

/** The CoCodes wordmark — a gilded display-serif logotype flanked by laurel
 *  sprigs (Greek victory laurel). The two camelCase capitals are brighter and a
 *  touch larger so the "Co · Codes" rhythm reads as a crafted mark, closed by a
 *  thin terminal caret. Laurels sit only at the outer ends — well clear of the
 *  letters — so the word stays fully legible. Centred on the header divider. */
function Wordmark({ className }: { className?: string }) {
  return (
    <div className={className} role="img" aria-label="CoCodes">
      <LaurelSprig className="cc-laurel cc-laurel-left" />
      <span className="cc-cap">C</span>
      <span className="cc-low">o</span>
      <span className="cc-cap">C</span>
      <span className="cc-low">odes</span>
      <span className="cc-caret" aria-hidden="true" />
      <LaurelSprig className="cc-laurel cc-laurel-right" />
    </div>
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
      <Wordmark className="cocodes-wordmark" />
      <Constellation className="theoi-constellation" />
    </div>
  );
}
