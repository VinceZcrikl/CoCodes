"use client";

export type SpriteStatus = "running" | "waiting" | "idle";
export type Costume = "wizard" | "builder" | "sleuth" | "chef";

/** The animated deck sprite — a blob in the persona's colour wearing its cast
 *  costume, with pose and expression driven by status (mirrors the app). */
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
          background: `radial-gradient(circle at 34% 28%, ${color}, ${color}66 82%)`,
          boxShadow: `0 0 14px ${color}33, inset 0 -4px 8px rgba(10,14,26,0.25)`,
          animationDelay: `${-delay}ms`,
        }}
      >
        {costume === "wizard" && <span className="dk-hat-wizard" aria-hidden />}
        {costume === "builder" && <span className="dk-hat-hard" aria-hidden />}
        {costume === "sleuth" && (
          <>
            <span className="dk-hat-sleuth" aria-hidden />
            <span className="dk-monocle" aria-hidden />
          </>
        )}
        {costume === "chef" && <span className="dk-toque" aria-hidden />}
        <span className="dk-eye l" />
        <span className="dk-eye r" />
        <span className="dk-mouth" />
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
