"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang";
import { PERSONAS } from "@/lib/content";
import { Kicker, Reveal, SectionTitle } from "./ui";

const ORBIT_S = 70;
const RADIUS = 150;

export default function PersonaConstellation() {
  const { lang, t } = useLang();
  const [selectedId, setSelectedId] = useState(PERSONAS[0].id);
  const selected = PERSONAS.find((p) => p.id === selectedId)!;

  return (
    <section id="personas" className="relative overflow-hidden py-28">
      {/* faint gold nebula behind the orbit */}
      <div
        className="pointer-events-none absolute left-[8%] top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(circle, rgba(232,200,120,0.4), transparent 65%)",
        }}
        aria-hidden
      />

      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <Kicker>{t.personas.kicker}</Kicker>
          <SectionTitle>{t.personas.title}</SectionTitle>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-ivory-soft sm:text-lg">
            {t.personas.body}
          </p>
        </Reveal>

        <div className="mt-14 grid items-center gap-14 lg:grid-cols-2">
          {/* ---- the orbit ---- */}
          <Reveal className="flex justify-center">
            <div
              className="relative"
              style={{ width: RADIUS * 2 + 90, height: RADIUS * 2 + 90 }}
            >
              {/* orbit ring */}
              <div
                className="absolute inset-[45px] rounded-full border border-dashed"
                style={{ borderColor: "rgba(232,200,120,0.25)" }}
              />
              {/* central SOUL orb */}
              <div
                className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                style={{
                  background:
                    "radial-gradient(circle at 35% 30%, #f6e3ae, #e8c879 45%, #6b5426 100%)",
                  boxShadow:
                    "0 0 60px rgba(232,200,120,0.45), inset 0 0 22px rgba(255,255,255,0.25)",
                  animation: "breathe 5s ease-in-out infinite",
                }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-canvas">
                  SOUL.md
                </span>
              </div>

              {/* rotating persona nodes */}
              <div
                className="absolute inset-0"
                style={{ animation: `orbit ${ORBIT_S}s linear infinite` }}
              >
                {PERSONAS.map((p, i) => {
                  const angle = i * 90 - 90;
                  const active = p.id === selectedId;
                  return (
                    <div
                      key={p.id}
                      className="absolute left-1/2 top-1/2"
                      style={{
                        transform: `rotate(${angle}deg) translateX(${RADIUS}px)`,
                      }}
                    >
                      <div style={{ transform: `rotate(${-angle}deg)` }}>
                        <div
                          style={{
                            animation: `counter-orbit ${ORBIT_S}s linear infinite`,
                          }}
                        >
                          <button
                            onClick={() => setSelectedId(p.id)}
                            aria-label={p.name}
                            className="flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-1.5 transition-transform hover:scale-110"
                            style={{ transform: "translate(-50%, -50%)" }}
                          >
                            <span
                              className="flex h-14 w-14 items-center justify-center rounded-full font-display text-xl font-bold transition-shadow"
                              style={{
                                background: `radial-gradient(circle at 32% 28%, ${p.color}, ${p.color}22 80%)`,
                                border: `1.5px solid ${active ? p.color : `${p.color}55`}`,
                                boxShadow: active
                                  ? `0 0 32px ${p.color}aa`
                                  : `0 0 10px ${p.color}33`,
                                color: "#0a0e1a",
                              }}
                            >
                              {p.monogram}
                            </span>
                            <span
                              className="whitespace-nowrap font-mono text-[10px] tracking-wider"
                              style={{
                                color: active
                                  ? p.color
                                  : "rgba(243,236,217,0.5)",
                              }}
                            >
                              {p.name}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Reveal>

          {/* ---- persona card ---- */}
          <Reveal delay={150}>
            <div
              key={selected.id}
              className="glass rounded-2xl p-7"
              style={{ borderColor: `${selected.color}44` }}
            >
              <div className="flex items-center gap-4">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full font-display text-lg font-bold"
                  style={{
                    background: `radial-gradient(circle at 32% 28%, ${selected.color}, ${selected.color}22 80%)`,
                    boxShadow: `0 0 22px ${selected.color}66`,
                    color: "#0a0e1a",
                  }}
                >
                  {selected.monogram}
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold text-ivory">
                    {selected.name}
                  </h3>
                  <p className="font-mono text-[11px] text-ivory-muted">
                    {t.personas.cliLabel}: {selected.cli} · {t.personas.modelLabel}:{" "}
                    {selected.model}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-ivory-soft">
                {selected.blurb[lang]}
              </p>

              <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.25em] text-ivory-muted">
                {t.personas.soulFiles}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {["SOUL.md", "MEMORY.md", "USER.md", "meta.json"].map((f) => (
                  <span
                    key={f}
                    className="rounded-md border border-hairline bg-panel-deep px-2.5 py-1 font-mono text-[11px] text-gold"
                  >
                    {f}
                  </span>
                ))}
              </div>

              <p className="mt-6 border-l-2 pl-4 text-sm italic leading-relaxed text-ivory-soft" style={{ borderColor: selected.color }}>
                {t.personas.dragHint}
              </p>
            </div>

            <div className="glass mt-5 rounded-2xl p-6">
              <h4 className="font-display text-xl font-semibold text-gold">
                {t.personas.perModel}
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-ivory-soft">
                {t.personas.perModelBody}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
