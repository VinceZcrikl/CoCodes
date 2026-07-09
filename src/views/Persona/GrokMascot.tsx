import { useId } from "react";

/** The Grok "little creature" — Claude/Codex's third sibling: same body plan
 *  (rounded body, oval eyes, stubby legs, top sheen) wearing the Grok Build
 *  mark as its face. The body is a cool silver-graphite rounded square; a
 *  open ring stroke traces the mark's rounded-square frame, and a bold
 *  diagonal slash cuts clean through it (the logo's signature stroke), with
 *  sparkle tips poking past the body at both ends.
 *
 *  Skin colours are CSS-variable driven (--mascot-base/deep/sheen) with the
 *  silver as fallback, so a themed context (the Session Deck sprite)
 *  re-tints it exactly like the Claude/Codex creatures. Untinted, the body
 *  falls back to a cool silver gradient (a var() fallback may be a url()).
 *
 *  `skinPaint` is the fill used for the body and the ring-gap carve. Pass a
 *  unique `url(#id)` from the parent when a gradient <defs> is in scope. */
export function GrokMascotShapes({
  skinPaint = "var(--mascot-base, #9aa2b2)",
}: {
  skinPaint?: string;
} = {}) {
  // Mark ink (ring + slash + sparkles). When deck-tinted, sheen rides the
  // persona colour; untinted it stays the logo's cool white.
  const ink = "var(--mascot-sheen, #f0f1f6)";

  return (
    <>
      {/* legs */}
      <rect x="9" y="20" width="4.4" height="6" rx="1.6" style={{ fill: "var(--mascot-deep, #6e7484)" }} />
      <rect x="18.6" y="20" width="4.4" height="6" rx="1.6" style={{ fill: "var(--mascot-deep, #6e7484)" }} />

      {/* body — rounded square, the solid mass behind the mark's open ring */}
      <rect x="5" y="6.5" width="22" height="15.5" rx="5.5" style={{ fill: skinPaint }} />

      {/* top sheen */}
      <rect x="7.5" y="8.5" width="17" height="3" rx="1.5" opacity="0.45" style={{ fill: ink }} />

      {/* ── Grok mark, worn as the face ───────────────────────────────
          Ring geometry mirrors the original avatar: a rounded-square stroke
          with a diagonal gap, then the bold slash sitting in that gap. */}

      {/* open ring — inset so it reads on the body, same proportions as the
          logo's rounded-square frame */}
      <rect
        x="7.2"
        y="8.4"
        width="17.6"
        height="12.2"
        rx="4.4"
        fill="none"
        stroke={ink}
        strokeWidth="1.7"
        opacity="0.95"
      />

      {/* carve a clean diagonal gap through the ring (top-right ↔ bottom-left),
          same trick as the original mark using the disc background */}
      <line
        x1="23.6"
        y1="7.2"
        x2="8.4"
        y2="21.8"
        stroke={skinPaint}
        strokeWidth="4.2"
        strokeLinecap="round"
      />

      {/* the bold slash in the gap, poking just past the body — the mark's
          instantly-recognizable stroke */}
      <line
        x1="24.2"
        y1="6.4"
        x2="7.8"
        y2="22.4"
        stroke={ink}
        strokeWidth="2.15"
        strokeLinecap="round"
      />

      {/* corner sparkles — the slash's tapered extensions, like the logo */}
      <circle cx="25.1" cy="5.5" r="1.05" style={{ fill: ink }} />
      <circle cx="6.9" cy="23.3" r="1.05" style={{ fill: ink }} />

      {/* eyes — family-standard ovals, sitting inside the open ring, clear of
          the slash corridor */}
      <rect x="10.4" y="11.3" width="3.2" height="5.2" rx="1.6" fill="#12141a" />
      <rect x="18.4" y="11.3" width="3.2" height="5.2" rx="1.6" fill="#12141a" />
    </>
  );
}

export default function GrokMascot({ className = "" }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `grokSkin-${uid}`;
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="8"
          y1="6"
          x2="26"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#c8ceda" />
          <stop offset="0.55" stopColor="#9aa2b2" />
          <stop offset="1" stopColor="#7a8292" />
        </linearGradient>
      </defs>
      <GrokMascotShapes skinPaint={`var(--mascot-base, url(#${gradId}))`} />
    </svg>
  );
}
