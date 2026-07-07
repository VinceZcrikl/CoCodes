"use client";

export type SpriteStatus = "running" | "waiting" | "idle";
export type Costume = "wizard" | "builder" | "sleuth" | "chef";

/** The real Claude Code mascot's raw shapes (32-unit viewBox), copied verbatim
 *  from src/views/Persona/ClaudeMascot.tsx so the landing page's deck sprites
 *  are the same creature as the shipping app, not a lookalike. */
function MascotShapes() {
  return (
    <>
      <rect x="9" y="20" width="4.4" height="6" rx="1.6" style={{ fill: "var(--mascot-deep, #a85b43)" }} />
      <rect x="18.6" y="20" width="4.4" height="6" rx="1.6" style={{ fill: "var(--mascot-deep, #a85b43)" }} />
      <rect x="5" y="6.5" width="22" height="15.5" rx="4.5" style={{ fill: "var(--mascot-base, #cc785c)" }} />
      <rect x="7.5" y="8.5" width="17" height="3" rx="1.5" opacity="0.6" style={{ fill: "var(--mascot-sheen, #dd8e74)" }} />
      <rect x="11" y="11.5" width="3.4" height="5.4" rx="1.7" fill="#2b1a14" />
      <rect x="17.6" y="11.5" width="3.4" height="5.4" rx="1.7" fill="#2b1a14" />
    </>
  );
}

/** The animated deck sprite — the real Claude Code mascot re-tinted to the
 *  persona's colour and dressed in its cast costume, pose driven by status
 *  (mirrors src/views/Claude/SessionDeck.tsx's DeckSprite). */
export function DeckSprite({
  color,
  costume,
  status,
  cheer,
  delay,
}: {
  color: string;
  costume: Costume;
  status: SpriteStatus;
  cheer?: boolean;
  delay: number;
}) {
  return (
    <div className={`dk-sprite ${status}${cheer ? " cheer" : ""}`}>
      <div
        className="dk-body"
        style={{
          ["--mascot-base" as string]: color,
          ["--mascot-deep" as string]: `color-mix(in srgb, #000 28%, ${color})`,
          ["--mascot-sheen" as string]: `color-mix(in srgb, #fff 30%, ${color})`,
          filter: `drop-shadow(0 3px 8px ${color}66)`,
          animationDelay: `${-delay}ms`,
        }}
      >
        <svg className="dk-mascot-svg" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <MascotShapes />
        </svg>
        {costume === "wizard" && <span className="dk-hat-wizard" aria-hidden />}
        {costume === "builder" && <span className="dk-hat-hard" aria-hidden />}
        {costume === "sleuth" && (
          <>
            <span className="dk-hat-sleuth" aria-hidden />
            <span className="dk-monocle" aria-hidden />
          </>
        )}
        {costume === "chef" && <span className="dk-toque" aria-hidden />}
        {status === "idle" && !cheer && <span className="dk-eyes shut" aria-hidden><i className="l" /><i className="r" /></span>}
        {status === "waiting" && <span className="dk-eyes plead" aria-hidden><i className="l" /><i className="r" /></span>}
        {cheer && <span className="dk-eyes happy" aria-hidden><i className="l" /><i className="r" /></span>}
        {status === "running" && costume === "wizard" && (
          <>
            <span className="dk-spark-i" style={{ top: -4, left: -8 }}>✦</span>
            <span className="dk-spark-i" style={{ top: 2, right: -9, animationDelay: "-0.7s" }}>✦</span>
          </>
        )}
        {status === "running" && costume === "builder" && <span className="dk-sweat-drop" aria-hidden />}
      </div>
      {status === "idle" && !cheer && (
        <>
          <span className="dk-zzz-i">z</span>
          <span className="dk-zzz-i" style={{ animationDelay: "-1.3s", right: -8, fontSize: 9 }}>z</span>
        </>
      )}
      {status === "waiting" && <span className="dk-alert-badge" aria-hidden>!</span>}
      {cheer && (
        <>
          <span className="dk-sparkle-i" style={{ top: -6, left: 0 }}>✧</span>
          <span className="dk-sparkle-i" style={{ top: -10, right: 4, animationDelay: "-0.4s" }}>✦</span>
          <span className="dk-sparkle-i" style={{ top: 6, right: -6, animationDelay: "-0.8s" }}>✧</span>
        </>
      )}
    </div>
  );
}

export function StatusDot({ status }: { status: SpriteStatus }) {
  const color =
    status === "running" ? "#57d98a" : status === "waiting" ? "#f2b34e" : "rgba(243,236,217,0.28)";
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{
        background: color,
        boxShadow: status !== "idle" ? `0 0 7px ${color}` : "none",
        animation: status === "running" ? "breathe 1.6s ease-in-out infinite" : "none",
      }}
    />
  );
}
