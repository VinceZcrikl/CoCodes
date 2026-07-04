"use client";

import { useLang } from "@/lib/lang";
import { Kicker, Reveal, SectionTitle } from "./ui";

/** Small inline glyphs, one per bento card (index-aligned with content items). */
const GLYPHS = ["▦", "◫", "⎇", "⌁", "✂", "⌘K", "❯_", "◉", "✦"];

/** Asymmetric spans for the bento grid (index-aligned with content items). */
const SPANS = [
  "sm:col-span-2",
  "",
  "",
  "",
  "",
  "sm:col-span-2 lg:col-span-1",
  "",
  "",
  "sm:col-span-2 lg:col-span-1",
];

export default function FeatureBento() {
  const { t } = useLang();

  return (
    <section className="mx-auto max-w-6xl px-5 py-28">
      <Reveal>
        <Kicker>{t.bento.kicker}</Kicker>
        <SectionTitle>{t.bento.title}</SectionTitle>
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {t.bento.items.map((item, i) => (
          <Reveal key={item.title} delay={(i % 3) * 100} className={SPANS[i]}>
            <div className="glass group h-full rounded-xl p-6 transition-all duration-500 hover:-translate-y-0.5 hover:border-gold/35">
              <span className="font-mono text-lg text-gold/70 transition-colors group-hover:text-gold">
                {GLYPHS[i]}
              </span>
              <h3 className="mt-3 font-display text-xl font-semibold text-ivory">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ivory-soft">
                {item.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
