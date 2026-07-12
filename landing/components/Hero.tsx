"use client";

import { useLang } from "@/lib/lang";
import { RELEASES_URL, STATS } from "@/lib/content";
import TerminalMock from "./TerminalMock";

/** Deterministic pseudo-random star field (stable across SSR/hydration). */
const STARS = Array.from({ length: 90 }, (_, i) => {
  const x = ((i * 37 + 11) % 100) + ((i * 7) % 10) / 10;
  const y = ((i * 53 + 29) % 100) + ((i * 3) % 10) / 10;
  const size = 1 + ((i * 13) % 3) * 0.7;
  const dur = 2.5 + ((i * 17) % 40) / 10;
  const delay = ((i * 23) % 50) / 10;
  const gold = i % 4 === 0;
  return { x, y, size, dur, delay, gold };
});

export default function Hero() {
  const { t } = useLang();

  return (
    <section id="top" className="relative overflow-hidden pb-24 pt-36 sm:pt-44">
      {/* star field */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {STARS.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              background: s.gold ? "#e8c879" : "#f3ecd9",
              animation: `twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
        {/* olympian glow */}
        <div
          className="absolute left-1/2 top-[-20%] h-[60vh] w-[90vw] -translate-x-1/2 rounded-full opacity-25"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(232,200,120,0.55), rgba(232,200,120,0.08) 45%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 text-center">
        <p className="mb-6 inline-block rounded-full border border-hairline px-4 py-1.5 font-mono text-[11px] tracking-widest text-ivory-muted">
          {t.hero.badge}
        </p>

        <h1 className="font-display text-6xl font-semibold leading-[1.04] tracking-tight sm:text-7xl md:text-8xl">
          <span className="block text-ivory">{t.hero.title1}</span>
          <span className="gold-shimmer block italic">{t.hero.title2}</span>
        </h1>

        <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-ivory-soft sm:text-lg">
          {t.hero.subtitle}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-2.5 rounded-full bg-gold px-8 py-3.5 text-base font-semibold text-canvas transition-all hover:bg-[#f2d68c] hover:shadow-[0_0_40px_rgba(232,200,120,0.4)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M11.182 3.61c-.633.043-1.36.44-1.788.962-.39.472-.727 1.174-.6 1.86.692.021 1.407-.393 1.82-.925.386-.494.679-1.19.568-1.897ZM13.8 10.62c-.02-1.917 1.564-2.837 1.635-2.882-.89-1.302-2.276-1.48-2.77-1.5-1.18-.12-2.302.694-2.9.694-.596 0-1.52-.677-2.5-.658-1.286.02-2.472.747-3.134 1.898-1.336 2.318-.342 5.75.96 7.632.636.92 1.394 1.954 2.39 1.917.958-.038 1.32-.62 2.478-.62 1.157 0 1.483.62 2.498.6 1.032-.019 1.686-.938 2.318-1.862.728-1.068 1.028-2.102 1.045-2.155-.023-.01-2.005-.77-2.02-3.064Z" />
            </svg>
            {t.hero.downloadMac}
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-hairline px-8 py-3.5 text-base text-ivory-soft transition-all hover:border-gold/50 hover:text-gold"
          >
            {t.hero.downloadOther}
          </a>
        </div>

        <p className="mt-5 font-mono text-[11px] tracking-wider text-ivory-muted">
          {t.hero.platforms}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-[11px] tracking-wider text-ivory-muted">
          <span>
            <span className="text-gold">{STATS.releases}</span> {t.hero.statsReleases}
          </span>
          <span>
            <span className="text-gold">{STATS.installerDownloads}</span> {t.hero.statsDownloads}
          </span>
          <span>
            <span className="text-gold">{STATS.stars}</span> {t.hero.statsStars}
          </span>
        </div>

        <div className="mt-16">
          <TerminalMock />
        </div>

        <a
          href="#features"
          className="mt-14 inline-flex flex-col items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-ivory-muted transition-colors hover:text-gold"
        >
          {t.hero.scrollHint}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </a>
      </div>
    </section>
  );
}
