# Open Terminus

A terminal-native desktop cockpit for AI coding CLIs. Open Terminus embeds the
**live CLI terminal** (not a config switcher, not a TUI), layers persona /
instruction injection and visual session management on top, and is built to
host *many* CLIs — Claude Code first, then Codex, Gemini, Grok, Kimi — each on
its own tab.

> **Status: Phase 0.** A standalone Tauri 2 app that embeds the real `claude`
> CLI in an xterm.js terminal, with per-profile persona injection and a
> per-session sidebar. The multi-CLI registry and provider switching land in
> later phases (see the roadmap).

## What works today

- **Live embedded terminal** — `claude` runs in a real PTY (via `portable-pty`),
  rendered through xterm.js. Cross-platform: macOS / Windows (`claude.cmd`) /
  Linux.
- **Composer injection** — type in the composer; each line is injected into
  claude's stdin and submitted.
- **Resumable sessions** — each sidebar session maps to a distinct claude
  conversation (`--session-id` / `--resume`).
- **Persona injection** — per-profile `SOUL.md` / `MEMORY.md` / `USER.md` under
  `~/.openterminus/personas/<profile>/` are folded into
  `--append-system-prompt-file`.
- **Subscription auth** — never sets `ANTHROPIC_API_KEY`; claude uses your
  `/login` OAuth credentials in `~/.claude`.

## Prerequisites

- **Node ≥ 18** and **Rust** (stable) with the Tauri 2 toolchain.
- **Claude Code** on your PATH: `npm i -g @anthropic-ai/claude-code`
  (the app shows an install card if it can't find it).

## Develop

```bash
npm install
npm run tauri dev      # Vite (1420) + Tauri shell
```

Frontend-only iteration: `npm run dev`. Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`.

## Build

```bash
npm run tauri build
```

## Layout

```
src/                       React/TS frontend
  views/Cockpit/           tab shell — one tab per CLI
  views/Claude/            Claude tab: terminal + sidebar + composer
  hooks/useClaudeSessions  per-profile session store (localStorage)
src-tauri/src/
  terminal.rs              PTY engine — spawn / write / resize / close
  persona.rs               app-owned persona loader (~/.openterminus)
```

## Roadmap

- **Phase 1** — polished sessions + persona editor.
- **Phase 2** — per-tab provider/model switching (no global config clobber).
- **Phase 3** — `CliSpec` registry; add Codex / Gemini / Kimi / Grok tabs.
- **Phase 4** — utilities: screenshot, voice, MCP, skills.

## License

MIT.
