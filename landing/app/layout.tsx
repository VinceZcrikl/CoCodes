import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "CoCodes — Agent coding cockpit",
  description:
    "A terminal-native desktop home for your AI coding CLIs. Claude Code, Codex, Grok and Kimi run live inside real pseudo-terminals — with personas, split panes and multi-agent delegation on top.",
  icons: { icon: "/icon.png" },
  openGraph: {
    title: "CoCodes — Agent coding cockpit",
    description:
      "Live embedded AI coding CLIs, swappable personas, tmux-style panes, multi-agent delegation. macOS · Windows · Linux.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${cormorant.variable} ${inter.variable} ${jetbrains.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
