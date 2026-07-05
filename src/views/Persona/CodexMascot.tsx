/** The Codex "little creature" — the Claude mascot's sibling: same body plan
 *  (rounded body, oval eyes, stubby legs, top sheen) wearing Codex's identity
 *  instead of clay — glassy blue→violet skin, a three-petal blossom crown
 *  (echoing the six-lobe Codex mark), and a white ❯_ prompt on its belly.
 *
 *  Skin colours are CSS-variable driven (--mascot-base/deep/sheen) with the
 *  blue-violet as fallback, so a themed context (the Session Deck sprite)
 *  re-tints it exactly like the Claude creature. Untinted, the body falls back
 *  to a glassy gradient (a var() fallback may be a url() paint server). */
export default function CodexMascot({ className = "" }: { className?: string }) {
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
          id="codexSkin"
          x1="8"
          y1="6"
          x2="26"
          y2="23"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#6f79ea" />
          <stop offset="1" stopColor="#5a4fd4" />
        </linearGradient>
      </defs>

      {/* three-petal blossom crown */}
      <ellipse
        cx="10.9" cy="5.7" rx="1.9" ry="2.9" opacity="0.9"
        transform="rotate(-38 10.9 5.7)"
        style={{ fill: "var(--mascot-sheen, #9a9df2)" }}
      />
      <ellipse
        cx="21.1" cy="5.7" rx="1.9" ry="2.9" opacity="0.9"
        transform="rotate(38 21.1 5.7)"
        style={{ fill: "var(--mascot-sheen, #9a9df2)" }}
      />
      <ellipse cx="16" cy="4.3" rx="2" ry="3.1" style={{ fill: "var(--mascot-sheen, #9a9df2)" }} />

      {/* legs */}
      <rect x="9" y="20" width="4.4" height="6" rx="1.6" style={{ fill: "var(--mascot-deep, #4a4aa8)" }} />
      <rect x="18.6" y="20" width="4.4" height="6" rx="1.6" style={{ fill: "var(--mascot-deep, #4a4aa8)" }} />

      {/* body — softer corners than Claude's; glassy gradient until themed */}
      <rect x="5" y="6.5" width="22" height="15.5" rx="6.5" style={{ fill: "var(--mascot-base, url(#codexSkin))" }} />

      {/* top sheen */}
      <rect x="7.5" y="8.5" width="17" height="3" rx="1.5" opacity="0.5" style={{ fill: "var(--mascot-sheen, #9a9df2)" }} />

      {/* eyes — family-standard ovals, blue-black */}
      <rect x="11" y="11.5" width="3.4" height="5.4" rx="1.7" fill="#141428" />
      <rect x="17.6" y="11.5" width="3.4" height="5.4" rx="1.7" fill="#141428" />

      {/* belly mark — the terminal prompt ❯_ */}
      <path
        d="M13.2 17.4 L15.3 18.8 L13.2 20.2"
        stroke="#fff"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.92"
      />
      <rect x="16.4" y="19.2" width="2.4" height="1.15" rx="0.55" fill="#fff" opacity="0.85" />
    </svg>
  );
}
