"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang";
import { PERSONAS } from "@/lib/content";
import { Kicker, PersonaDot, Reveal, SectionTitle } from "./ui";

type SpriteStatus = "running" | "waiting" | "idle";
type Costume = "wizard" | "builder" | "sleuth" | "chef";

/** Codex card's report cycle: run → "writing report…" → spoken quest report. */
type Phase = "run" | "write" | "report";
const PHASE_MS: Record<Phase, number> = { run: 4600, write: 1900, report: 6800 };
const NEXT_PHASE: Record<Phase, Phase> = { run: "write", write: "report", report: "run" };
const CHEER_MS = 2400;

const REPORT_TEXT = "Wired the CI pipeline — all 42 tests green.";

const HIGHLIGHT_GLYPHS = ["☻", "◔", "✎", "⇶", "◎", "▤"];

/** The animated deck sprite — a blob in the persona's colour wearing its cast
 *  costume, with pose and expression driven by status (mirrors the app). */
function DeckSprite({
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

function StatusDot({ status }: { status: SpriteStatus }) {
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

interface CardSpec {
  personaId: string;
  costume: Costume;
  label: string;
  model: string;
  delay: number;
}

const CARDS: CardSpec[] = [
  { personaId: "claude", costume: "wizard", label: "Refactor the token parser", model: "Opus 4.8", delay: 120 },
  { personaId: "codex", costume: "builder", label: "Wire the CI pipeline", model: "GPT-5.5", delay: 480 },
  { personaId: "grok", costume: "sleuth", label: "Hunt the flaky websocket", model: "Grok 4", delay: 300 },
  { personaId: "kimi", costume: "chef", label: "Summarize the RFC backlog", model: "K2.7", delay: 760 },
];

function DeckCardMock({
  spec,
  status,
  cheer,
  preview,
}: {
  spec: CardSpec;
  status: SpriteStatus;
  cheer?: boolean;
  preview: React.ReactNode;
}) {
  const persona = PERSONAS.find((p) => p.id === spec.personaId)!;
  return (
    <div className="group rounded-xl border border-hairline bg-panel-deep/60 p-3 transition-all hover:border-gold/45 hover:shadow-[0_0_26px_rgba(232,200,120,0.12)]">
      <div className="flex items-center gap-2">
        <StatusDot status={status} />
        <PersonaDot color={persona.color} monogram={persona.monogram} size={16} />
        <span className="truncate text-[11px] font-medium text-ivory-soft">{persona.name}</span>
        <span className="ml-auto shrink-0 rounded border border-hairline px-1.5 py-px font-mono text-[8.5px] text-ivory-muted">
          {spec.model}
        </span>
      </div>
      <div className="mt-2 flex items-start gap-2.5">
        <DeckSprite
          color={persona.color}
          costume={spec.costume}
          status={status}
          cheer={cheer}
          delay={spec.delay}
        />
        <div className="min-w-0 flex-1 pt-1">
          <p className="truncate font-display text-[13px] italic leading-snug text-ivory">
            {spec.label}
          </p>
          <div className="mt-1.5 min-h-[38px]">{preview}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-md border border-hairline bg-canvas/60 px-2.5 py-1.5">
        <span className="flex-1 truncate font-mono text-[9.5px] text-ivory-muted">
          Reply to this terminal…
        </span>
        <span className="font-mono text-[9px] text-gold-deep">⏎</span>
      </div>
    </div>
  );
}

function MonoPreview({ children }: { children: React.ReactNode }) {
  return <p className="truncate font-mono text-[9.5px] leading-relaxed text-ivory-muted">{children}</p>;
}

export default function DeckShowcase() {
  const { t } = useLang();

  // Codex card lifecycle: running → writing report… → quest report + cheer.
  const [phase, setPhase] = useState<Phase>("run");
  const [cheer, setCheer] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setPhase(NEXT_PHASE[phase]), PHASE_MS[phase]);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "report") return;
    setCheer(true);
    const id = setTimeout(() => setCheer(false), CHEER_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const codexStatus: SpriteStatus = phase === "report" ? "idle" : "running";
  const codexPreview =
    phase === "run" ? (
      <MonoPreview>$ pnpm test · running 42 specs…</MonoPreview>
    ) : phase === "write" ? (
      <p className="dk-writing font-mono text-[9.5px] text-gold-deep">✎ writing report…</p>
    ) : (
      <div className="dk-bubble relative rounded-lg rounded-bl-none border border-gold/40 bg-gold/10 px-2.5 py-1.5">
        <p className="text-[10px] leading-snug text-ivory">{REPORT_TEXT}</p>
        <span className="absolute -left-px bottom-[-5px] h-2.5 w-2.5 border-b border-l border-gold/40 bg-transparent [clip-path:polygon(0_0,0_100%,100%_0)]" />
      </div>
    );

  const running = phase === "report" ? 1 : 2;

  return (
    <section id="deck" className="relative py-28">
      {/* faint gold haze behind the deck band */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[60vh] w-[90vw] -translate-x-1/2 rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(ellipse at center, #e8c879, transparent 65%)" }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-5">
        <Reveal>
          <Kicker>{t.deck.kicker}</Kicker>
          <SectionTitle>{t.deck.title}</SectionTitle>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ivory-soft">{t.deck.body}</p>
        </Reveal>

        {/* ---- the deck band mock ---- */}
        <Reveal delay={120}>
          <div className="glass mt-12 overflow-hidden rounded-2xl">
            {/* header — title, live counts, model picker, deck actions */}
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
              <span className="font-display text-sm font-semibold text-gold">Session Deck</span>
              <span className="rounded-full border border-[#f2b34e]/40 bg-[#f2b34e]/10 px-2 py-px font-mono text-[9px] text-[#f2b34e]">
                1 waiting
              </span>
              <span className="rounded-full border border-[#57d98a]/40 bg-[#57d98a]/10 px-2 py-px font-mono text-[9px] text-[#57d98a]">
                {running} running
              </span>
              <span className="rounded-full border border-hairline px-2 py-px font-mono text-[9px] text-ivory-muted">
                4 panes
              </span>
              <span className="flex-1" />
              <span className="hidden items-center gap-1.5 rounded-md border border-hairline px-2 py-1 font-mono text-[9px] text-ivory-muted sm:flex">
                ⌬ Auto <span className="text-[7px]">▾</span>
              </span>
              <span className="hidden rounded-md border border-hairline px-2 py-1 font-mono text-[9px] text-ivory-muted sm:inline">
                ⚄
              </span>
              <span className="hidden rounded-md border border-hairline px-2 py-1 font-mono text-[9px] text-ivory-muted md:inline">
                ↻ Relabel all
              </span>
              <span className="rounded-md border border-hairline px-2 py-1 font-mono text-[9px] text-ivory-muted">
                ▤
              </span>
            </div>

            {/* broadcast bar */}
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
              <span className="rounded-full bg-gold/90 px-2.5 py-0.5 font-mono text-[9px] font-semibold text-canvas">
                All
              </span>
              <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[9px] text-ivory-muted">
                Idle
              </span>
              <span className="flex-1 truncate rounded-md border border-hairline bg-canvas/60 px-3 py-1.5 font-mono text-[9.5px] text-ivory-muted">
                Message all 4 terminals…
              </span>
              <span className="rounded-md bg-gold/20 px-2 py-1 font-mono text-[9px] text-gold">⏎</span>
            </div>

            {/* the cast */}
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
              <DeckCardMock
                spec={CARDS[0]}
                status="running"
                preview={<MonoPreview>✻ Editing src/parser/lexer.ts…</MonoPreview>}
              />
              <DeckCardMock spec={CARDS[1]} status={codexStatus} cheer={cheer} preview={codexPreview} />
              <DeckCardMock
                spec={CARDS[2]}
                status="waiting"
                preview={<MonoPreview>Allow network access to api.ws.dev? (y/n)</MonoPreview>}
              />
              <DeckCardMock
                spec={CARDS[3]}
                status="idle"
                preview={<MonoPreview>Idle — last run finished 12 min ago</MonoPreview>}
              />
            </div>
          </div>
          <p className="mt-4 text-center font-mono text-[10.5px] tracking-wider text-ivory-muted">
            {t.deck.spotlightNote}
          </p>
        </Reveal>

        {/* ---- highlights ---- */}
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.deck.highlights.map((h, i) => (
            <Reveal key={h.title} delay={i * 70}>
              <div className="h-full rounded-xl border border-hairline bg-panel/40 p-5 transition-colors hover:border-gold/35">
                <span className="font-mono text-lg text-gold-deep">{HIGHLIGHT_GLYPHS[i]}</span>
                <h3 className="mt-3 font-display text-xl font-semibold text-ivory">{h.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ivory-soft">{h.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={140}>
          <p className="mt-8 text-center text-sm text-ivory-muted">{t.deck.footnote}</p>
        </Reveal>
      </div>
    </section>
  );
}
