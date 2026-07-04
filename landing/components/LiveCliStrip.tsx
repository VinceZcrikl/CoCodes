"use client";

import { useLang } from "@/lib/lang";
import { Kicker, Reveal, SectionTitle } from "./ui";

export default function LiveCliStrip() {
  const { t } = useLang();

  return (
    <section id="features" className="relative mx-auto max-w-6xl px-5 py-28">
      <Reveal>
        <Kicker>{t.live.kicker}</Kicker>
        <SectionTitle>{t.live.title}</SectionTitle>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-ivory-soft sm:text-lg">
          {t.live.body}
        </p>
      </Reveal>

      <div className="mt-12 grid gap-5 sm:grid-cols-3">
        {t.live.cards.map((card, i) => (
          <Reveal key={card.tag} delay={i * 120}>
            <div className="glass group h-full rounded-xl p-6 transition-all duration-500 hover:border-gold/40 hover:shadow-[0_0_40px_rgba(232,200,120,0.08)]">
              <span className="inline-block rounded-md border border-hairline bg-panel-deep px-2.5 py-1 font-mono text-[11px] text-gold">
                {card.tag}
              </span>
              <h3 className="mt-4 font-display text-2xl font-semibold text-ivory">
                {card.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ivory-soft">
                {card.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
