"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang";
import { GITHUB_URL, RELEASES_URL } from "@/lib/content";
import { LaurelIcon, Reveal } from "./ui";

const CLONE_CMD = "git clone https://github.com/VinceZcrikl/CoCodes && cd CoCodes && npm i && npm run tauri dev";

export default function DownloadCta() {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(CLONE_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section id="download" className="relative overflow-hidden py-32">
      {/* rising gold glow */}
      <div
        className="pointer-events-none absolute bottom-[-40%] left-1/2 h-[70vh] w-[100vw] -translate-x-1/2 rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(232,200,120,0.6), transparent 65%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-3xl px-5 text-center">
        <Reveal>
          <div className="mb-6 flex justify-center">
            <LaurelIcon size={52} />
          </div>
          <h2 className="font-display text-5xl font-semibold leading-tight sm:text-6xl">
            <span className="gold-shimmer">{t.cta.title}</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ivory-soft">
            {t.cta.body}
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-gold px-10 py-4 text-lg font-semibold text-canvas transition-all hover:bg-[#f2d68c] hover:shadow-[0_0_50px_rgba(232,200,120,0.45)]"
            >
              {t.cta.download}
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ivory-muted underline-offset-4 transition-colors hover:text-gold hover:underline"
            >
              {t.cta.orBuild} ↗
            </a>
          </div>

          <button
            onClick={copy}
            className="glass mt-8 inline-flex max-w-full items-center gap-3 rounded-xl px-5 py-3.5 text-left font-mono text-[12px] text-ivory-soft transition-all hover:border-gold/40"
          >
            <span className="text-gold">$</span>
            <span className="truncate">{CLONE_CMD}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-widest text-ivory-muted">
              {copied ? "✓ copied" : "copy"}
            </span>
          </button>

          <p className="mt-4 font-mono text-[10.5px] tracking-wider text-ivory-muted">
            {t.cta.requirements}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
