"use client";

import { useLang } from "@/lib/lang";
import { Kicker, Reveal, SectionTitle } from "./ui";

const CLIS = [
  { name: "Claude Code", model: "Opus 4.8", color: "#e8c879", ready: true },
  { name: "Codex", model: "GPT-5.5", color: "#c4cad2", ready: true },
  { name: "Grok", model: "Grok 4", color: "#9aa6f5", ready: true },
  { name: "Kimi Code", model: "Kimi K2.7", color: "#74cc98", ready: true },
  { name: "Gemini", model: "Gemini 2.5 Pro", color: "#7ab2d0", ready: false },
];

const PRESETS = [
  "Moonshot Kimi",
  "Zhipu GLM",
  "StepFun",
  "DeepSeek",
  "Ollama · local",
  "LM Studio · local",
];

export default function ProviderGrid() {
  const { t } = useLang();

  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <Kicker>{t.providers.kicker}</Kicker>
          <SectionTitle>{t.providers.title}</SectionTitle>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-ivory-soft sm:text-lg">
            {t.providers.body}
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {CLIS.map((cli, i) => (
            <Reveal key={cli.name} delay={i * 90}>
              <div
                className={`glass group h-full rounded-xl p-5 text-center transition-all duration-500 ${
                  cli.ready ? "hover:-translate-y-1" : "opacity-60"
                }`}
                style={{ borderColor: `${cli.color}2e` }}
              >
                <span
                  className="mx-auto flex h-11 w-11 items-center justify-center rounded-full font-display text-lg font-bold"
                  style={{
                    background: `radial-gradient(circle at 32% 28%, ${cli.color}, ${cli.color}22 80%)`,
                    boxShadow: `0 0 16px ${cli.color}44`,
                    color: "#0a0e1a",
                  }}
                >
                  {cli.name[0]}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold text-ivory">
                  {cli.name}
                </h3>
                <p className="font-mono text-[10.5px] text-ivory-muted">{cli.model}</p>
                <span
                  className="mt-3 inline-block rounded-full px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-widest"
                  style={{
                    color: cli.ready ? "#74cc98" : "rgba(243,236,217,0.5)",
                    border: `1px solid ${cli.ready ? "#74cc9855" : "rgba(243,236,217,0.2)"}`,
                  }}
                >
                  {cli.ready ? t.providers.ready : t.providers.soon}
                </span>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <Reveal delay={100}>
            <div className="glass h-full rounded-2xl p-7">
              <h3 className="font-display text-2xl font-semibold text-gold">
                {t.providers.presetsTitle}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ivory-soft">
                {t.providers.presetsBody}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <span
                    key={p}
                    className="rounded-full border border-hairline bg-panel-deep px-3.5 py-1.5 font-mono text-[11px] text-ivory-soft"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="glass light-border h-full rounded-2xl p-7">
              <h3 className="font-display text-2xl font-semibold text-gold">
                {t.providers.authTitle}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ivory-soft">
                {t.providers.authBody}
              </p>
              <div className="mt-5 rounded-lg bg-panel-deep p-4 font-mono text-[12px] leading-relaxed">
                <p className="text-ivory-muted"># the ticket is your subscription</p>
                <p className="text-ivory-soft">
                  <span className="text-gold">$</span> claude /login
                </p>
                <p className="text-[#74cc98]">✓ OAuth credentials · ~/.claude</p>
                <p className="text-ivory-muted line-through opacity-60">
                  export ANTHROPIC_API_KEY=…
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
