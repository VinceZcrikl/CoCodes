/** xAI Grok mark — the provider's identifying logo (used to label the Grok CLI,
 *  the way the Claude/Codex mascots label theirs). A monochrome rounded-square
 *  ring "opened" by a bold diagonal slash that extends to corner sparkles —
 *  Grok's instantly-recognizable geometry. */
export default function GrokMascot({ className = "" }: { className?: string }) {
  const FG = "#f0f1f6";
  const BG = "#15151b"; // matches the avatar disc — used to carve the ring gap
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* rounded-square ring */}
      <rect
        x="6.5"
        y="6.5"
        width="19"
        height="19"
        rx="6.5"
        fill="none"
        stroke={FG}
        strokeWidth="2.3"
      />
      {/* carve a clean diagonal gap through the ring (top-right ↔ bottom-left) */}
      <line
        x1="27.6"
        y1="4.4"
        x2="4.4"
        y2="27.6"
        stroke={BG}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* the bold slash sitting in the gap, poking just past the ring */}
      <line
        x1="26.4"
        y1="5.6"
        x2="5.6"
        y2="26.4"
        stroke={FG}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* corner sparkles — the diagonal's tapered extensions */}
      <circle cx="28.7" cy="3.3" r="1.05" fill={FG} />
      <circle cx="3.3" cy="28.7" r="1.05" fill={FG} />
    </svg>
  );
}
