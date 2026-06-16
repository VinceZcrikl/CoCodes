# Theoi

> **Agent coding cockpit** — a terminal-native desktop home for your AI coding CLIs.

Theoi runs the **real** AI coding CLIs (Claude Code, Codex, Grok, Kimi Code) inside live
pseudo-terminals and gives them a cockpit: switchable personas, per-tab model providers,
tmux-style split panes, and keep-alive sessions — all in one frameless, frosted-glass window.
Nothing is re-implemented or proxied; you drive the actual CLI, with a layer of orchestration
on top.

## The name

**Theoi** (Greek *θεοί*, "the gods") is a pantheon. That's the idea: you don't run a single
assistant — you preside over a *pantheon of AI agents*. Each persona is a distinct mind you
summon (Claude, Codex, Grok, Kimi…), each with its own SOUL, memory and voice, arrayed like a
constellation you command from one cockpit. You're the mortal at the terminal; Theoi is where
the gods convene to do the work.

## Highlights

- **Live embedded CLIs, not a wrapper.** Each CLI runs in a true PTY (`portable-pty`) rendered
  through a WebGL xterm.js surface. What you see is the real `claude` / `codex` / `grok` / `kimi`
  process — Theoi just hosts and orchestrates it. Missing a CLI? An install card shows the exact
  command.

- **A constellation of personas.** Every persona carries its own `SOUL.md` / `MEMORY.md` / `USER.md`,
  injected into the CLI via `--append-system-prompt-file` (or full *replace* mode). Switch personas
  from a row of custom mascot avatars; edit identity, memory, avatar and preferred CLI in a built-in
  editor.

- **tmux-style split panes.** Split any pane horizontally or vertically, zoom one to focus, relay a
  selection into the next pane, and assign a *different* persona or CLI per pane by drag-and-drop —
  then delegate work across CLIs, pane to pane.

- **Per-persona model providers.** Point a persona's Claude at any Anthropic-compatible endpoint with
  one click — **DeepSeek, Kimi, Zhipu GLM, StepFun** presets are prefilled from each vendor's docs, so
  you only paste a key. Tokens live in `~/.theoi/.env` and are never echoed back.

- **Keep-alive, resumable sessions.** PTYs survive view remounts and reloads (reconnect + replay
  buffer), so a running task is never interrupted by the UI. Each session maps to a distinct
  conversation (`--session-id` / `--resume`) with its own sidebar entry.

- **Composer injection.** Drive the terminal from a chat-like box — each line is piped straight into
  the CLI's stdin and submitted.

- **Designer theming.** Nine curated panel palettes with a *separable accent axis*, per-pane recolour,
  and light/dark-aware terminal ramps — plus a seasonal **"Trionda Night"** World Cup 2026 theme with
  ambient motion and a goal-celebration.

- **Built-in utilities.** One-tap screenshot capture (the path drops into your prompt), a read-only
  **Git** panel (status / log / commit), a floating shell window, and a command palette.

- **Subscription auth, no API key.** The default Claude path never sets `ANTHROPIC_API_KEY`; it uses
  your existing `/login` OAuth credentials in `~/.claude`.

- **Native desktop polish.** Frameless frosted-glass frame, runtime dock icon, and a compact mini
  mode. Cross-platform: **macOS / Windows / Linux**.

## Tech stack

- **Shell** — [Tauri 2](https://tauri.app) (Rust core + system WebView), frameless transparent window
  (`macos-private-api`).
- **Frontend** — React 18 + TypeScript, [Vite](https://vitejs.dev), [zustand](https://github.com/pmndrs/zustand)
  for state, [xterm.js](https://xtermjs.org) (WebGL + fit / web-links / unicode11 addons) for the
  terminals, [lucide-react](https://lucide.dev) icons, [ogl](https://github.com/oframe/ogl) for the
  WebGL persona orb, and hand-rolled CSS (no UI framework).
- **Backend (Rust)** — [`portable-pty`](https://github.com/wez/wezterm) PTY engine, `serde`/`serde_json`,
  `tracing`, `dirs`, `base64`, `getrandom`, `rfd` native dialogs; macOS integration via
  `objc2` / AppKit (dock icon, window enumeration), and `xcap` / `arboard` / `image` for the
  non-macOS screenshot path.
- **CLIs hosted** — Claude Code, Codex, Grok, Kimi Code (Gemini is wired, off by default).

## Getting started

**Prerequisites:** Node ≥ 18, Rust (stable, ≥ 1.77) with the Tauri 2 toolchain, and at least one
coding CLI on your `PATH` (e.g. `npm i -g @anthropic-ai/claude-code`).

```bash
npm install
npm run tauri dev      # Vite (1422) + the Tauri shell
```

Frontend-only iteration: `npm run dev`. Production bundle: `npm run tauri build`.

App state lives under `~/.theoi/` (personas, `providers.json`, secret `.env`); Web-UI prefs are in
`localStorage` under the `theoi:` prefix.

## License

MIT.
