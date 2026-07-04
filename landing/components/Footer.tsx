"use client";

import { useLang } from "@/lib/lang";
import { GITHUB_URL } from "@/lib/content";
import { GitHubIcon, LaurelIcon } from "./ui";

export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <LaurelIcon size={20} color="#d0a76f" />
          <span className="font-display text-lg font-semibold text-gold-deep">
            CoCodes
          </span>
          <span className="text-sm text-ivory-muted">— {t.footer.tagline}</span>
        </div>
        <div className="flex items-center gap-5 text-sm text-ivory-muted">
          <span>{t.footer.license}</span>
          <span className="hidden sm:inline">{t.footer.built}</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-gold"
          >
            <GitHubIcon size={16} />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
