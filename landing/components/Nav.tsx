"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang";
import { GITHUB_URL, RELEASES_URL } from "@/lib/content";
import { GitHubIcon, LaurelIcon } from "./ui";

export default function Nav() {
  const { lang, setLang, t } = useLang();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#features", label: t.nav.features },
    { href: "#deck", label: t.nav.deck },
    { href: "#personas", label: t.nav.personas },
    { href: "#themes", label: t.nav.themes },
    { href: "#download", label: t.nav.download },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled ? "glass border-b border-hairline py-3" : "border-b border-transparent py-5"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2.5">
          <LaurelIcon size={26} />
          <span className="gold-shimmer font-display text-2xl font-semibold tracking-wide">
            CoCodes
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-ivory-soft transition-colors hover:text-gold"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-full border border-hairline text-xs font-medium">
            {(["en", "zh"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1.5 transition-colors ${
                  lang === l
                    ? "bg-gold/90 text-canvas"
                    : "text-ivory-muted hover:text-ivory"
                }`}
              >
                {l === "en" ? "EN" : "中"}
              </button>
            ))}
          </div>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-2 rounded-full border border-hairline px-4 py-1.5 text-sm text-ivory-soft transition-all hover:border-gold/50 hover:text-gold sm:flex"
          >
            <GitHubIcon size={15} />
            {t.nav.github}
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-canvas transition-all hover:bg-[#f2d68c] hover:shadow-[0_0_24px_rgba(232,200,120,0.35)]"
          >
            {t.nav.download}
          </a>
        </div>
      </nav>
    </header>
  );
}
