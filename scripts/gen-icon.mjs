// Renders the Theoi app logo (the framed AppLogo) to a 1024×1024 PNG,
// the single source `tauri icon` expands into every platform icon.
//
//   npm i -D @resvg/resvg-js   (already a devDependency)
//   node scripts/gen-icon.mjs
//   npx tauri icon scripts/.icon-source.png -o src-tauri/icons
//
// Keep the artwork below in sync with src/views/Cockpit/AppLogo.tsx (framed).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const svg = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="otOrbClaude">
      <stop offset="0" stop-color="#f0b591"/>
      <stop offset="0.55" stop-color="#cc785c" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#cc785c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="otOrbCodex">
      <stop offset="0" stop-color="#a9c2ff"/>
      <stop offset="0.55" stop-color="#6f86f5" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#6f86f5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="otOrbGrok">
      <stop offset="0" stop-color="#f6f8fc"/>
      <stop offset="0.55" stop-color="#b6bccb" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#b6bccb" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="otSeat">
      <stop offset="0" stop-color="#0e0e14" stop-opacity="0.62"/>
      <stop offset="1" stop-color="#0e0e14" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- full-bleed rounded tile + gold rim -->
  <rect x="0" y="0" width="48" height="48" rx="11" fill="#0f0f15"/>
  <rect x="1.6" y="1.6" width="44.8" height="44.8" rx="9.4" fill="none"
        stroke="#c8a24a" stroke-width="1.2" stroke-opacity="0.8"/>

  <!-- trefoil of CLI orbs -->
  <circle cx="24" cy="15.5" r="12.6" fill="url(#otOrbCodex)"/>
  <circle cx="16.6" cy="28.2" r="12.6" fill="url(#otOrbClaude)"/>
  <circle cx="31.4" cy="28.2" r="12.6" fill="url(#otOrbGrok)"/>

  <!-- darken the convergence so the gold prompt reads -->
  <circle cx="24" cy="23.5" r="10" fill="url(#otSeat)"/>

  <!-- gold terminal prompt -->
  <path d="M20.4 19.4 L25.9 23.7 L20.4 28" stroke="#ffd54a" stroke-width="2.8"
        fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M27.4 27.4 L31.6 27.4" stroke="#ffd54a" stroke-width="2.8"
        fill="none" stroke-linecap="round"/>
</svg>`;

const out = join(dirname(fileURLToPath(import.meta.url)), ".icon-source.png");
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } })
  .render()
  .asPng();
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
