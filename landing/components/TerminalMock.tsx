"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONAS } from "@/lib/content";
import { PersonaDot, TrafficLights } from "./ui";

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

      {/* split panes */}
      <div className="grid min-h-[300px] grid-cols-1 sm:grid-cols-2">
        {([0, 1] as const).map((pane) => (
          <div
            key={pane}
            className={`flex flex-col p-4 font-mono text-[12.5px] leading-relaxed sm:min-h-[300px] ${
              pane === 0 ? "border-b border-hairline sm:border-b-0 sm:border-r" : ""
            }`}
          >
            <div className="mb-3 flex items-center gap-2 text-[10.5px] uppercase tracking-widest text-ivory-muted">
              <PersonaDot
                color={PERSONAS[pane].color}
                monogram={PERSONAS[pane].monogram}
                size={16}
              />
              {PERSONAS[pane].name} · {PERSONAS[pane].model}
              {activePane === pane && (
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full"
                  style={{
                    background: PERSONAS[pane].color,
                    boxShadow: `0 0 8px ${PERSONAS[pane].color}`,
                    animation: "breathe 1.6s ease-in-out infinite",
                  }}
                />
              )}
            </div>
            {renderPane(pane).map(({ line, text, live }, i) => (
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
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
