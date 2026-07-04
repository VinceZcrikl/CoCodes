"use client";

import { useLang } from "@/lib/lang";
import { PERSONAS } from "@/lib/content";
import { Kicker, PersonaDot, Reveal, SectionTitle } from "./ui";

export default function DelegationDemo() {
  const { t } = useLang();
  const claude = PERSONAS[0];
  const codex = PERSONAS[1];

  return (
    <section className="mx-auto max-w-6xl px-5 py-28">
      <Reveal>
        <Kicker>{t.delegation.kicker}</Kicker>
        <SectionTitle>{t.delegation.title}</SectionTitle>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-ivory-soft sm:text-lg">
          {t.delegation.body}
        </p>
      </Reveal>

      {/* animated route diagram */}
      <Reveal delay={120}>
        <div className="glass relative mt-12 overflow-hidden rounded-2xl p-6 sm:p-10">
          <div className="relative flex items-center justify-between gap-6">
            {/* Claude pane */}
            <div className="glass w-[38%] min-w-[130px] rounded-xl border-gold/20 p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ivory-muted">
                <PersonaDot color={claude.color} monogram={claude.monogram} size={16} />
                <span className="truncate">{claude.name}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-4/5 rounded bg-ivory/15" />
                <div className="h-1.5 w-3/5 rounded bg-ivory/15" />
                <div className="h-1.5 w-2/3 rounded" style={{ background: `${claude.color}55` }} />
              </div>
            </div>

            {/* route line */}
            <div className="relative h-px flex-1" aria-hidden>
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "repeating-linear-gradient(90deg, rgba(232,200,120,0.5) 0 6px, transparent 6px 12px)",
                }}
              />
              <span
                className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold"
                style={{
                  color: "#9aa6f5",
                  borderColor: "#9aa6f566",
                  background: "rgba(10,14,26,0.9)",
                  boxShadow: "0 0 18px rgba(154,166,245,0.35)",
                  animation: "task-travel 4.5s ease-in-out infinite",
                }}
              >
                [TASK→codex]
              </span>
            </div>

            {/* Codex pane */}
            <div className="glass w-[38%] min-w-[130px] rounded-xl p-4" style={{ borderColor: `${codex.color}33` }}>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ivory-muted">
                <PersonaDot color={codex.color} monogram={codex.monogram} size={16} />
                <span className="truncate">{codex.name}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-2/3 rounded" style={{ background: `${codex.color}44` }} />
                <div className="h-1.5 w-4/5 rounded bg-ivory/15" />
                <div className="h-1.5 w-1/2 rounded bg-ivory/15" />
              </div>
            </div>
          </div>

          <p className="mt-6 text-center font-mono text-[11px] text-[#74cc98]">
            ↩ [Agent response from Codex]
          </p>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {t.delegation.steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 120}>
            <div className="h-full rounded-xl border border-hairline p-6">
              <span className="font-display text-4xl font-semibold text-gold/40">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-display text-xl font-semibold text-ivory">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ivory-soft">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={200}>
        <p className="mt-8 max-w-3xl text-sm italic leading-relaxed text-ivory-muted">
          {t.delegation.paneNote}
        </p>
      </Reveal>
    </section>
  );
}
