"use client";

import type { CSSProperties, ReactNode } from "react";
import { useInView } from "@/lib/useInView";

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "reveal-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.3em] text-gold-deep">
      <span className="inline-block h-px w-8 bg-gold-deep/60" />
      {children}
    </p>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-4xl font-semibold leading-tight text-ivory sm:text-5xl">
      {children}
    </h2>
  );
}

/** Simplified laurel wreath mark — the app's Olympus identity. */
export function LaurelIcon({
  size = 28,
  color = "#e8c879",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="15" r="6.5" stroke={color} strokeWidth="1.4" />
      <circle cx="16" cy="15" r="2" fill={color} />
      {/* left branch */}
      <path
        d="M9 26c-3-2.5-5-6.5-5-11C4 10 6 6 9 4"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* right branch */}
      <path
        d="M23 26c3-2.5 5-6.5 5-11 0-5-2-9-5-11"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {[
        [6.2, 21.5, -35],
        [4.9, 16.5, -15],
        [5.3, 11, 10],
        [7, 6.6, 35],
      ].map(([x, y, r], i) => (
        <ellipse
          key={`l${i}`}
          cx={x}
          cy={y}
          rx="2.1"
          ry="0.9"
          fill={color}
          opacity="0.85"
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
      {[
        [25.8, 21.5, 35],
        [27.1, 16.5, 15],
        [26.7, 11, -10],
        [25, 6.6, -35],
      ].map(([x, y, r], i) => (
        <ellipse
          key={`r${i}`}
          cx={x}
          cy={y}
          rx="2.1"
          ry="0.9"
          fill={color}
          opacity="0.85"
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
    </svg>
  );
}

export function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Traffic-light dots for the frosted window mock. */
export function TrafficLights() {
  return (
    <div className="flex gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
    </div>
  );
}

/** Small circular persona avatar with a glow in its persona colour. */
export function PersonaDot({
  color,
  monogram,
  size = 26,
  active = false,
}: {
  color: string;
  monogram: string;
  size?: number;
  active?: boolean;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: `radial-gradient(circle at 32% 28%, ${color}, ${color}22 78%)`,
    boxShadow: active
      ? `0 0 ${size / 1.6}px ${color}88, inset 0 0 4px rgba(255,255,255,.35)`
      : `0 0 6px ${color}33`,
    border: `1px solid ${color}66`,
    color: "#0a0e1a",
    fontSize: size * 0.42,
  };
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-display font-bold"
      style={style}
    >
      {monogram}
    </span>
  );
}
