import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Tauri 2 + React dev config. Pinned to port 1422 because `tauri.conf.json`
// hard-codes `devUrl: http://localhost:1422` — without `strictPort` Vite
// silently falls back to 5173 and `tauri dev` hangs waiting for the frontend.
// (1420/1421 are left free so this can run alongside the hermes-orb dev server,
// which pins 1420.)
export default defineConfig(async () => ({
  plugins: [react()],
  // Keep Rust/Cargo errors visible — don't let Vite wipe the terminal.
  clearScreen: false,
  server: {
    port: 1422,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1423 } : undefined,
    watch: {
      // cargo-tauri has its own Rust watcher; nesting one here would thrash.
      ignored: ["**/src-tauri/**"],
    },
  },
}));
