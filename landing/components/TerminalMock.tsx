"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONAS } from "@/lib/content";
import { PersonaDot, TrafficLights } from "./ui";
import { DeckSprite, StatusDot, type Costume, type SpriteStatus } from "./DeckSprite";

interface ScriptLine {
  pane: 0 | 1;
  text: string;
  color?: string; // tailwind-free inline colour
  prefix?: string;
  prefixColor?: string;
}

const SCRIPT: ScriptLine[] = [
  { pane: 0, prefix: "$", prefixColor: "#e8c879", text: " claude --resume 42a7f" },
  { pane: 0, prefix: "✻", prefixColor: "#e8c879", text: " Claude Code · Opus 4.8 — session restored" },
  { pane: 0, prefix: "›", prefixColor: "#f3ecd9", text: " refactor the auth flow, then hand the build tuning to Codex" },
  { pane: 0, prefix: "●", prefixColor: "#74cc98", text: " Editing src/auth/token-cache.ts … done", color: "rgba(243,236,217,0.78)" },
  { pane: 0, prefix: "◇", prefixColor: "#9aa6f5", text: " [TASK→codex] profile the build, trim cold start [/TASK]", color: "#9aa6f5" },
  { pane: 1, prefix: "✦", prefixColor: "#c4cad2", text: " Codex · GPT-5.5 — task received from Claude" },
  { pane: 1, prefix: "●", prefixColor: "#74cc98", text: " cold start 4.1s → 1.8s · vite config patched", color: "rgba(243,236,217,0.78)" },
  { pane: 0, prefix: "↩", prefixColor: "#74cc98", text: " [Agent response from Codex]: build tuned, 2.3s saved", color: "#74cc98" },
  { pane: 0, prefix: "✓", prefixColor: "#e8c879", text: " 4 files changed · tests green · ready to commit", color: "#e8c879" },
];

const TYPE_MS = 26;
const LINE_PAUSE_MS = 420;
const LOOP_PAUSE_MS = 5200;

/** Third split — Grok hunting a flaky test, parked on an approval prompt. */
const GROK_LINES: ScriptLine[] = [
  { pane: 0, prefix: "▲", prefixColor: "#9aa6f5", text: " ws reconnect probe #3 — flaky under load", color: "rgba(243,236,217,0.6)" },
  { pane: 0, prefix: "?", prefixColor: "#f2b34e", text: " Allow network access to api.ws.dev? (y/n)", color: "#f2b34e" },
];

interface DeckSpec {
  persona: number; // index into PERSONAS
  costume: Costume;
  label: string;
}

const DECK: DeckSpec[] = [
  { persona: 0, costume: "wizard", label: "Refactor the auth flow" },
  { persona: 1, costume: "builder", label: "Trim the build cold start" },
  { persona: 2, costume: "sleuth", label: "Hunt the flaky websocket" },
];

function DeckMiniCard({
  spec,
  status,
  cheer,
  delay,
}: {
  spec: DeckSpec;
  status: SpriteStatus;
  cheer?: boolean;
  delay: number;
}) {
  const persona = PERSONAS[spec.persona];
  return (
    <div className="flex min-w-[210px] items-center gap-2.5 rounded-lg border border-hairline bg-panel-deep/60 px-3 py-1.5 sm:min-w-0">
      <DeckSprite
        color={persona.color}
        costume={spec.costume}
        status={status}
        cheer={cheer}
        delay={delay}
      />
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <StatusDot status={status} />
          <PersonaDot color={persona.color} monogram={persona.monogram} size={14} />
          <span className="truncate text-[10px] font-medium text-ivory-soft">{persona.name}</span>
        </div>
        <p className="mt-0.5 truncate font-display text-[12px] italic leading-snug text-ivory">
          {spec.label}
        </p>
      </div>
    </div>
  );
}

export default function TerminalMock() {
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const line = SCRIPT[lineIdx];
    if (!line) {
      timer.current = setTimeout(() => {
        setLineIdx(0);
        setCharIdx(0);
      }, LOOP_PAUSE_MS);
      return () => clearTimeout(timer.current!);
    }
    if (charIdx < line.text.length) {
      timer.current = setTimeout(
        () => setCharIdx((c) => c + 2),
        TYPE_MS,
      );
    } else {
      timer.current = setTimeout(() => {
        setLineIdx((i) => i + 1);
        setCharIdx(0);
      }, LINE_PAUSE_MS);
    }
    return () => clearTimeout(timer.current!);
  }, [lineIdx, charIdx]);

  const renderPane = (pane: 0 | 1) => {
    const lines: { line: ScriptLine; text: string; live: boolean }[] = [];
    SCRIPT.forEach((line, i) => {
      if (line.pane !== pane) return;
      if (i < lineIdx) lines.push({ line, text: line.text, live: false });
      else if (i === lineIdx)
        lines.push({ line, text: line.text.slice(0, charIdx), live: true });
    });
    return lines;
  };

  const activePane = SCRIPT[Math.min(lineIdx, SCRIPT.length - 1)]?.pane ?? 0;

  // Deck moods track the script: Claude cheers when the run lands, Codex wakes
  // for its delegated task then dozes off, Grok is stuck on an approval prompt.
  const claudeDone = lineIdx >= 8;
  const codexBusy = lineIdx >= 5 && lineIdx < 7;
  const codexDone = lineIdx >= 7;
  const statuses: { status: SpriteStatus; cheer: boolean }[] = [
    { status: claudeDone ? "idle" : "running", cheer: claudeDone },
    { status: codexBusy ? "running" : "idle", cheer: codexDone },
    { status: "waiting", cheer: false },
  ];
  const runningCount = statuses.filter((s) => s.status === "running").length;

  const paneHeader = (idx: number, active: boolean) => (
    <div className="mb-3 flex items-center gap-2 text-[10.5px] uppercase tracking-widest text-ivory-muted">
      <PersonaDot color={PERSONAS[idx].color} monogram={PERSONAS[idx].monogram} size={16} />
      {PERSONAS[idx].name} · {PERSONAS[idx].model}
      {active && (
        <span
          className="ml-auto h-1.5 w-1.5 rounded-full"
          style={{
            background: PERSONAS[idx].color,
            boxShadow: `0 0 8px ${PERSONAS[idx].color}`,
            animation: "breathe 1.6s ease-in-out infinite",
          }}
        />
      )}
    </div>
  );

  const renderLines = (lines: { line: ScriptLine; text: string; live: boolean }[]) =>
    lines.map(({ line, text, live }, i) => (
      <div key={i} className="whitespace-pre-wrap break-words">
        {line.prefix && (
          <span style={{ color: line.prefixColor }}>{line.prefix}</span>
        )}
        <span style={{ color: line.color ?? "#f3ecd9" }}>{text}</span>
        {live && (
          <span
            className="ml-0.5 inline-block h-3.5 w-[7px] translate-y-0.5 bg-gold"
            style={{ animation: "blink 1s step-end infinite" }}
          />
        )}
      </div>
    ));

  return (
    <div
      className="glass light-border relative mx-auto w-full max-w-4xl rounded-2xl shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]"
      style={{ animation: "float-slow 9s ease-in-out infinite" }}
    >
      {/* title bar */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <TrafficLights />
        <div className="flex items-center gap-2 font-mono text-[11px] text-ivory-muted">
          <span className="hidden sm:inline">CoCodes — cockpit</span>
        </div>
        {/* persona constellation row */}
        <div className="flex items-center gap-2">
          {PERSONAS.map((p, i) => (
            <PersonaDot
              key={p.id}
              color={p.color}
              monogram={p.monogram}
              size={22}
              active={i === (activePane === 0 ? 0 : 1)}
            />
          ))}
        </div>
      </div>

      {/* split panes — Claude full-height, Codex + Grok stacked */}
      <div className="grid min-h-[300px] grid-cols-1 sm:grid-cols-2">
        <div className="flex flex-col border-b border-hairline p-4 font-mono text-[12.5px] leading-relaxed sm:min-h-[300px] sm:border-b-0 sm:border-r">
          {paneHeader(0, activePane === 0)}
          {renderLines(renderPane(0))}
        </div>
        <div className="flex flex-col">
          <div className="flex flex-1 flex-col border-b border-hairline p-4 font-mono text-[12.5px] leading-relaxed sm:min-h-[150px]">
            {paneHeader(1, activePane === 1)}
            {renderLines(renderPane(1))}
          </div>
          <div className="flex flex-1 flex-col p-4 font-mono text-[12.5px] leading-relaxed sm:min-h-[150px]">
            {paneHeader(2, false)}
            {renderLines(GROK_LINES.map((line) => ({ line, text: line.text, live: false })))}
          </div>
        </div>
      </div>

      {/* Session Deck band — one card per split, moods synced to the run */}
      <div className="border-t border-hairline">
        <div className="flex items-center gap-2 px-4 pt-2.5">
          <span className="font-display text-[12px] font-semibold text-gold">Session Deck</span>
          <span className="rounded-full border border-[#f2b34e]/40 bg-[#f2b34e]/10 px-2 py-px font-mono text-[8.5px] text-[#f2b34e]">
            1 waiting
          </span>
          <span className="rounded-full border border-[#57d98a]/40 bg-[#57d98a]/10 px-2 py-px font-mono text-[8.5px] text-[#57d98a]">
            {runningCount} running
          </span>
          <span className="hidden rounded-full border border-hairline px-2 py-px font-mono text-[8.5px] text-ivory-muted sm:inline">
            3 panes
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto p-2.5 sm:grid sm:grid-cols-3 sm:overflow-visible">
          {DECK.map((spec, i) => (
            <DeckMiniCard
              key={spec.persona}
              spec={spec}
              status={statuses[i].status}
              cheer={statuses[i].cheer}
              delay={i * 340}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
