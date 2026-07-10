import path from "path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    // `next dev` and `next build` cannot safely share the same output folder.
    // Keeping development chunks separate prevents a production build from
    // invalidating the live server's webpack manifest.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    outputFileTracingRoot: path.join(__dirname),
  };
}
