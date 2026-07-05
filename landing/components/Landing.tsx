"use client";

import { LangProvider } from "@/lib/lang";
import Nav from "./Nav";
import Hero from "./Hero";
import LiveCliStrip from "./LiveCliStrip";
import DeckShowcase from "./DeckShowcase";
import PersonaConstellation from "./PersonaConstellation";
import DelegationDemo from "./DelegationDemo";
import ProviderGrid from "./ProviderGrid";
import ThemeGallery from "./ThemeGallery";
import FeatureBento from "./FeatureBento";
import DownloadCta from "./DownloadCta";
import Footer from "./Footer";

export default function Landing() {
  return (
    <LangProvider>
      <Nav />
      <main>
        <Hero />
        <LiveCliStrip />
        <DeckShowcase />
        <PersonaConstellation />
        <DelegationDemo />
        <ProviderGrid />
        <ThemeGallery />
        <FeatureBento />
        <DownloadCta />
      </main>
      <Footer />
    </LangProvider>
  );
}
