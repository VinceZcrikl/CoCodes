"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang";
import { PALETTES } from "@/lib/palettes";
import { Kicker, Reveal, SectionTitle } from "./ui";

export default function ThemeGallery() {
  const { t } = useLang();
  const [active, setActive] = useState(PALETTES[0]);

  return (
    <section id="themes" className="mx-auto max-w-6xl px-5 py-28">
      <Reveal>
        <Kicker>{t.themes.kicker}</Kicker>
        <SectionTitle>{t.themes.title}</SectionTitle>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-ivory-soft sm:text-lg">
          {t.themes.body}
        </p>
      </Reveal>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* swatches */}
        <Reveal>
          <p className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.25em] text-ivory-muted">
            {t.themes.tryHint} ↓
          </p>
          <div className="grid grid-cols-2 gap-3">
            {PALETTES.map((p) => {
              const isActive = p.name === active.name;
              return (
                <button
                  key={p.name}
                  onClick={() => setActive(p)}
                  className="group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-300"
                  style={{
                    borderColor: isActive ? p.accent : "rgba(232,200,120,0.12)",
                    background: isActive ? "rgba(18,26,46,0.75)" : "transparent",
                    boxShadow: isActive ? `0 0 24px ${p.accent}22` : "none",
                  }}
                >
                  <span
                    className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border"
                    style={{ background: p.bgCanvas, borderColor: p.border }}
                  >
                    <span
                      className="absolute inset-x-1 bottom-1 top-3 rounded-[3px]"
                      style={{ background: p.panel }}
                    />
                    <span
                      className="absolute left-2 top-1 h-1 w-4 rounded-full"
                      style={{ background: p.accent }}
                    />
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block truncate text-[13px] font-medium"
                      style={{ color: isActive ? p.accent : "#f3ecd9" }}
                    >
                      {p.label}
                    </span>
                    <span className="flex items-center gap-1.5 pt-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                      <span className="font-mono text-[9.5px] text-ivory-muted">
                        {p.accent}
                      </span>
                      {p.light && (
                        <span className="rounded-full border border-hairline px-1.5 font-mono text-[8.5px] uppercase text-ivory-muted">
                          {t.themes.lightBadge}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-6 max-w-md text-sm italic leading-relaxed text-ivory-muted">
            ⚽ {t.themes.seasonal}
          </p>
        </Reveal>

        {/* live re-skinned mock pane */}
        <Reveal delay={150}>
          <div
            className="overflow-hidden rounded-2xl border shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] transition-colors duration-700"
            style={{ background: active.bgCanvas, borderColor: active.border }}
          >
            {/* window chrome */}
            <div
              className="flex items-center justify-between border-b px-4 py-2.5 transition-colors duration-700"
              style={{ borderColor: active.border, background: active.panel }}
            >
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2.5 w-2.5 rounded-full transition-colors duration-700"
                    style={{ background: i === 0 ? active.danger : `${active.accent}${i === 1 ? "88" : "cc"}` }}
                  />
                ))}
              </div>
              <span
                className="font-display text-sm font-semibold transition-colors duration-700"
                style={{ color: active.accent }}
              >
                {active.label}
              </span>
            </div>

            {/* pane body */}
            <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              {/* sidebar mock */}
              <div
                className="space-y-2 border-r p-4 transition-colors duration-700 max-sm:hidden"
                style={{ borderColor: active.border, background: active.panelDeep }}
              >
                {["Session", "Explore", "Git"].map((tab, i) => (
                  <div
                    key={tab}
                    className="rounded-md px-3 py-2 font-mono text-[11px] transition-colors duration-700"
                    style={{
                      background: i === 0 ? active.panel : "transparent",
                      color: i === 0 ? active.accent : active.textMuted,
                      border: `1px solid ${i === 0 ? active.border : "transparent"}`,
                    }}
                  >
                    {tab}
                  </div>
                ))}
                <div className="space-y-1.5 pt-2">
                  {[80, 62, 71].map((w, i) => (
                    <div
                      key={i}
                      className="h-1.5 rounded transition-colors duration-700"
                      style={{ width: `${w}%`, background: `${active.accent}26` }}
                    />
                  ))}
                </div>
              </div>

              {/* terminal mock */}
              <div
                className="p-5 font-mono text-[12px] leading-relaxed transition-colors duration-700"
                style={{ background: active.bgCanvas }}
              >
                <p style={{ color: active.accent }}>✻ CoCodes · panel palette</p>
                <p style={{ color: active.textMain }}>
                  <span style={{ color: active.accent }}>$</span> claude
                </p>
                <p style={{ color: active.textSoft }}>
                  › give this pane the “{active.label}” look
                </p>
                <p style={{ color: active.textMuted }}>
                  ● canvas {active.bgCanvas} · accent {active.accent}
                </p>
                <p style={{ color: active.textSoft }}>
                  ✓ re-skinned — surfaces, text ramp, cursor, HUD
                </p>
                <p style={{ color: active.danger }}>✗ danger reads as {active.danger}</p>
                <p className="pt-1" style={{ color: active.textMain }}>
                  <span
                    className="inline-block h-3.5 w-[7px] translate-y-0.5"
                    style={{ background: active.accent, animation: "blink 1s step-end infinite" }}
                  />
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
