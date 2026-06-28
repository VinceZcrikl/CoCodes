import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { usePaletteStore } from "../../state/paletteStore";
import { xtermThemeForPalette } from "../../state/uiPalette";
import {
  PANEL_PALETTES,
  type PanelPaletteName,
  type AccentName,
} from "../../state/panelPalettes";
import { PERSONA_RESTART_EVENT } from "../../hooks/usePersonas";

/** Imperative handle the parent view uses to drive the terminal — composer
 *  injection calls `writeLine`. */
export interface ClaudeTerminalHandle {
  /** Inject a line into claude's stdin and submit it (appends CR). */
  writeLine: (text: string) => void;
  /** Inject text into claude's stdin WITHOUT submitting — lands in the input
   *  box so the user can add context before pressing Enter. Used by the
   *  screenshot button to drop the captured file path in. */
  insert: (text: string) => void;
  focus: () => void;
  /** Returns the currently selected text in the terminal (empty string when
   *  nothing is selected). Used by the relay feature to copy a selection to
   *  another pane's input. */
  getSelection: () => string;
}

interface Props {
  profileId: string;
  /** Claude conversation UUID this terminal binds to (`--session-id`). */
  claudeSessionId?: string;
  /** On the very first spawn of a forked pane, use this session ID instead of
   *  `claudeSessionId` so the fork starts with the source conversation history.
   *  After the first spawn this is ignored — the pane diverges under its own ID. */
  forkFromSessionId?: string;
  /** Working directory for the spawned claude process. null/absent → home dir.
   *  Read once at mount; use the `cd` injection path for mid-session changes. */
  cwd?: string | null;
  /** "claude" | "codex" | "grok" — which CLI binary to spawn. */
  cli?: string;
  /** True when this conversation already exists (a previously-started session
   *  being restored) — spawn with `--resume` instead of `--session-id` so the
   *  history comes back instead of erroring "already in use". Read once at mount. */
  resume?: boolean;
  /** Stable session key (pane id + conversation id). Lets the PTY survive a
   *  view remount (reload / HMR / reloadKey): on remount we reconnect to the
   *  still-running process and replay its output instead of killing + respawning. */
  terminalKey: string;
  /** Per-pane colour override. When set, this terminal's xterm theme uses it
   *  instead of the global palette. */
  paletteOverride?: { name: string; accent: string };
  /** Raised when the backend can't find the `cli` binary. */
  onMissingCli?: (message: string) => void;
  /** Raised after the PTY successfully spawns the CLI. */
  onOpened?: () => void;
  /** Raised when claude exits (or fails to spawn). */
  onExit?: (code: number | null) => void;
  /** Raised whenever this terminal gains keyboard focus. */
  onFocus?: () => void;
  /** Intercept key events before they reach the PTY. Return `false` to swallow. */
  onKeyEvent?: (e: KeyboardEvent) => boolean;
  /** Raised when the PTY output contains "already in use" — the caller should
   *  generate a new convId and remount this terminal to recover. */
  onSessionConflict?: () => void;
}

interface DataEvent {
  id: string;
  data: string; // base64 of raw PTY bytes
}
interface ExitEvent {
  id: string;
  code: number | null;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PTYs outlive a view remount. On unmount we schedule a close after a grace
 *  window; a remount with the same key cancels it (and reconnects via the
 *  backend's replay buffer), so a reload / HMR / reloadKey bump keeps the
 *  running task alive. A genuine pane close has no remount, so the close fires. */
const TERMINAL_CLOSE_GRACE_MS = 1500;
const pendingClose = new Map<string, number>();

function scheduleTerminalClose(key: string, id: string) {
  const existing = pendingClose.get(key);
  if (existing !== undefined) window.clearTimeout(existing);
  const t = window.setTimeout(() => {
    pendingClose.delete(key);
    void invoke("terminal_close", { id });
  }, TERMINAL_CLOSE_GRACE_MS);
  pendingClose.set(key, t);
}

function cancelTerminalClose(key: string) {
  const t = pendingClose.get(key);
  if (t !== undefined) {
    window.clearTimeout(t);
    pendingClose.delete(key);
  }
}

/** xterm.js surface bound to a Rust PTY running `claude`. The parent keys this
 *  component on profileId + session so switching tears down and respawns. */
const ClaudeTerminal = forwardRef<ClaudeTerminalHandle, Props>(
  function ClaudeTerminal(
    { profileId, claudeSessionId, forkFromSessionId, cwd, cli = "claude", resume,
      terminalKey, paletteOverride,
      onMissingCli, onOpened, onExit, onFocus, onKeyEvent, onSessionConflict },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const paletteName = usePaletteStore((s) => s.name);
    const accentName = usePaletteStore((s) => s.accent);
    const webglEnabled = usePaletteStore((s) => s.webglEnabled);
    // Track the current WebGL addon so we can dispose/reload it on toggle.
    const webglAddonRef = useRef<WebglAddon | null>(null);
    // Expose the current webglEnabled to the mount-time effect via ref.
    const webglEnabledRef = useRef(webglEnabled);
    webglEnabledRef.current = webglEnabled;
    // Per-pane override wins over the global palette for this terminal.
    const effPalette = (paletteOverride?.name ?? paletteName) as PanelPaletteName;
    const effAccent = (paletteOverride?.accent ?? accentName) as AccentName;

    // Keep the latest focus/key/conflict callbacks in refs so the mount-time
    // effect always calls the current version without being in its deps.
    const onFocusRef = useRef(onFocus);
    onFocusRef.current = onFocus;
    const onKeyEventRef = useRef(onKeyEvent);
    onKeyEventRef.current = onKeyEvent;
    const onSessionConflictRef = useRef(onSessionConflict);
    onSessionConflictRef.current = onSessionConflict;
    // Current persona for this pane, read by the once-registered restart
    // listener below without re-subscribing.
    const profileIdRef = useRef(profileId);
    profileIdRef.current = profileId;

    // Bumped to force a full respawn (e.g. after this pane's persona is edited).
    const [restartNonce, setRestartNonce] = useState(0);

    // When this pane's persona is saved, restart the CLI so the new SOUL / memory
    // / base-model takes effect. The running process baked the old prompt in, so
    // we kill it and remount — the remount re-resumes the same conversation with
    // a freshly-written persona file. Closing FIRST (not the graced close) avoids
    // a "session already in use" race against the resuming replacement.
    useEffect(() => {
      const onRestart = (e: Event) => {
        const id = (e as CustomEvent<{ id: string }>).detail?.id;
        if (!id || id !== profileIdRef.current) return;
        const sid = sessionIdRef.current;
        if (sid) {
          sessionIdRef.current = null; // stop the unmount cleanup re-closing it
          void invoke("terminal_close", { id: sid }).finally(() =>
            setRestartNonce((n) => n + 1),
          );
        } else {
          setRestartNonce((n) => n + 1);
        }
      };
      window.addEventListener(PERSONA_RESTART_EVENT, onRestart);
      return () => window.removeEventListener(PERSONA_RESTART_EVENT, onRestart);
    }, []);

    // Re-theme the live terminal when the palette / accent changes (no remount).
    useEffect(() => {
      if (termRef.current) {
        termRef.current.options.theme = xtermThemeForPalette(effPalette, effAccent);
      }
    }, [effPalette, effAccent]);

    useImperativeHandle(ref, () => ({
      writeLine: (text: string) => {
        const id = sessionIdRef.current;
        if (!id) return;
        // Claude Code's TUI buffers a fast injected paste and the submitting
        // carriage return as one chunk, so the line lands in the input box but
        // never sends. Write the text first, then deliver the Enter as a
        // separate, slightly delayed keystroke so the TUI registers a discrete
        // submit. The textarea-paste path may strip a leading `/`, so feed the
        // body without the CR, then CR alone.
        void invoke("terminal_write", { id, data: text }).then(() => {
          window.setTimeout(() => {
            const cur = sessionIdRef.current;
            if (cur) void invoke("terminal_write", { id: cur, data: "\r" });
          }, 30);
        });
      },
      insert: (text: string) => {
        const id = sessionIdRef.current;
        if (!id) return;
        void invoke("terminal_write", { id, data: text });
        termRef.current?.focus();
      },
      focus: () => termRef.current?.focus(),
      getSelection: () => termRef.current?.getSelection() ?? "",
    }));

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      // A remount within the grace window: cancel the pending close so the
      // backend keeps the live PTY and we reconnect to it below.
      cancelTerminalClose(terminalKey);

      let disposed = false;
      const cleanup: Array<() => void> = [];

      const term = new Terminal({
        allowProposedApi: true,
        convertEol: false,
        cursorBlink: true,
        fontFamily:
          '"SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
        fontSize: 13,
        // Integer line height keeps cells pixel-aligned — fractional values
        // (e.g. 1.15) make glyphs blurry on HiDPI WKWebView.
        lineHeight: 1,
        scrollback: 4000,
        theme: xtermThemeForPalette(effPalette, effAccent),
      });
      termRef.current = term;

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      const unicode = new Unicode11Addon();
      term.loadAddon(unicode);
      term.unicode.activeVersion = "11";

      // Intercept keys before they reach the PTY so the pane layout can run the
      // tmux-style prefix (split/close/focus). Returning false swallows the key.
      term.attachCustomKeyEventHandler((e) =>
        onKeyEventRef.current ? onKeyEventRef.current(e) : true,
      );

      term.open(host);

      // GPU-accelerated rendering via the WebGL addon — must load *after*
      // open() so it can attach to the live canvas. If the WebView ever drops
      // the GL context (the WKWebView failure mode), onContextLoss disposes the
      // addon and xterm transparently falls back to its DOM renderer, so a lost
      // context degrades instead of leaving a frozen/ghosted surface. A throw at
      // construction (no GL support at all) lands in the same DOM fallback.
      // Skipped entirely when the user has disabled WebGL effects.
      if (webglEnabledRef.current) {
        try {
          const webgl = new WebglAddon();
          webgl.onContextLoss(() => {
            webgl.dispose();
            webglAddonRef.current = null;
          });
          term.loadAddon(webgl);
          webglAddonRef.current = webgl;
        } catch {
          /* WebGL unavailable — DOM renderer stays active. */
        }
      }

      // Report focus so the layout can mark this the active pane. xterm's
      // textarea is the real focus target.
      const onFocusIn = () => onFocusRef.current?.();
      host.addEventListener("focusin", onFocusIn);
      cleanup.push(() => host.removeEventListener("focusin", onFocusIn));

      // Fix xterm's scrollBarWidth for WKWebView.
      // xterm detects scrollbar width via `viewport.offsetWidth - scrollArea.offsetWidth`
      // in its Viewport constructor (called during open). WKWebView uses overlay
      // scrollbars so that difference = 0, and xterm falls back to 15 px. FitAddon
      // then subtracts 15 px from availableWidth, wasting ~2 columns. Overriding to
      // our actual CSS scrollbar width (5 px) keeps the column calculation accurate
      // and ensures the scrollbar sits to the right of the last character, not on it.
      const CSS_SCROLLBAR_WIDTH = 5;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (term as any)._core.viewport.scrollBarWidth = CSS_SCROLLBAR_WIDTH;
      } catch { /* private API — safe to skip on future xterm versions */ }

      fit.fit(); // initial cols/rows for the PTY spawn below

      // Track the size the PTY currently believes it has so we only ever send
      // a resize when the cell grid genuinely changed. A burst of identical
      // resizes during a panel's open animation makes Claude Code's TUI
      // repaint its banner each time, stacking into duplicated headers.
      let lastCols = term.cols;
      let lastRows = term.rows;
      const pushResize = () => {
        const id = sessionIdRef.current;
        if (!id) return;
        // Suppress PTY resize during the startup grace window so Claude Code's
        // TUI finishes rendering its welcome banner before receiving a resize.
        // lastCols/lastRows are intentionally NOT updated here — the post-grace
        // doFit will compare against the spawn dimensions and send exactly one
        // corrective resize if layout drifted during startup.
        if (Date.now() - spawnedAt < SPAWN_GRACE_MS) return;
        if (term.cols === lastCols && term.rows === lastRows) return;
        lastCols = term.cols;
        lastRows = term.rows;
        void invoke("terminal_resize", { id, cols: term.cols, rows: term.rows });
      };

      // One settle refit after layout finishes. The first fit can measure a
      // pre-settle pane, leaving the grid too wide/tall so text spills past the
      // edge. Debounced so an open animation's intermediate frames collapse
      // into a single resize.
      let settleTimer = 0;
      // Set while windowStore.applyGeometry is in flight. CSS layout events
      // that fire during a window resize (e.g. sidebar collapsing) must not
      // trigger an intermediate fit — we wait for the confirmed 'terminus:refit'.
      let geometryTransitioning = false;
      let spawned = false;
      let spawnedAt = 0;
      const SPAWN_GRACE_MS = 1000;
      // How long after spawn we scan output for Claude's session-startup errors.
      // Those errors abort the process within ~1-2s of launch, so a short window
      // catches them — while ensuring ordinary conversation later (which may
      // legitimately contain phrases like "No conversation found with session
      // ID", e.g. when editing this very file) is NEVER treated as a control
      // signal that respawns the pane and drops history.
      const CONFLICT_SCAN_MS = 8000;

      const doFit = (delay: number) => {
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => {
          try {
            // Guard against transient mis-measurements: while a pane is being
            // split (or the layout is mid-animation) the host can momentarily
            // report a near-zero width, and FitAddon would resize the grid down
            // to 1-2 columns. In Claude's fullscreen TUI that doesn't reflow —
            // it garbles every line down the left edge. Skip clearly-bogus sizes
            // and wait for the settled measurement instead.
            const dims = fit.proposeDimensions();
            if (!dims || dims.cols < 10 || dims.rows < 3) {
              return;
            }
            if (dims.cols !== term.cols || dims.rows !== term.rows) {
              term.resize(dims.cols, dims.rows);
            }
          } catch {
            return;
          }
          if (!spawned) {
            // First settle: spawn the PTY with stable, post-animation dimensions.
            // Delaying spawn until layout is settled means Claude Code's TUI starts
            // at the correct column width and never receives a corrective resize for
            // the welcome banner — eliminating the duplicate-header stacking.
            spawned = true;
            lastCols = term.cols;
            lastRows = term.rows;
            // For a fork pane (not yet started), use the source session ID so
            // the fork inherits conversation history on its very first run.
            const spawnSessionId = forkFromSessionId ?? claudeSessionId;
            void invoke<{ id: string; replay: string | null }>("terminal_open", {
              profileId,
              cols: term.cols,
              rows: term.rows,
              claudeSessionId: spawnSessionId,
              // Only resume when reopening the pane's own existing conversation —
              // a fork's first spawn uses --session-id to branch from the source.
              resume: forkFromSessionId ? false : !!resume,
              cwd: cwd ?? null,
              cli,
              // Stable key → reconnect to a still-running PTY across remounts.
              key: terminalKey,
              // Light palette → tell the CLI's TUI to render dark-on-light via
              // COLORFGBG so its own theme detection picks light mode, instead
              // of painting an explicit dark background that ignores our xterm
              // background. (xterm's background alone can't override a TUI that
              // hard-paints dark cells.)
              light: !!PANEL_PALETTES[effPalette]?.light,
            })
              .then(({ id, replay }) => {
                if (disposed) {
                  // Unmounted mid-open: schedule a graced close (a remount
                  // cancels it). Don't kill outright — the task may continue.
                  scheduleTerminalClose(terminalKey, id);
                  return;
                }
                sessionIdRef.current = id;
                // Reconnecting to a live session: replay its buffered output so
                // the running task is visible instead of a blank terminal.
                if (replay) term.write(decodeBase64(replay));
                spawnedAt = Date.now();
                // After the grace window expires, run one final fit. By then
                // the welcome banner has rendered and any layout drift accumulated
                // during startup is flushed in a single clean resize.
                window.setTimeout(() => {
                  if (!disposed) doFit(50);
                }, SPAWN_GRACE_MS + 100);
                term.focus();
                onOpened?.();
              })
              .catch((e: unknown) => {
                const err = e as { kind?: string; message?: string } | string;
                if (typeof err === "object" && err?.kind === "CliNotFound") {
                  onMissingCli?.(err.message ?? `${cli} not found`);
                } else {
                  const msg =
                    typeof err === "string"
                      ? err
                      : (err?.message ?? JSON.stringify(err));
                  term.write(
                    `\r\n\x1b[31m[cocodes] failed to start ${cli}: ${msg}\x1b[0m\r\n`,
                  );
                }
              });
          } else {
            // Defer PTY resize notification by one frame so xterm finishes
            // re-rendering before Claude Code's TUI sees the new dimensions.
            requestAnimationFrame(pushResize);
          }
        }, delay);
      };

      const settle = () => {
        if (geometryTransitioning) return;
        doFit(140);
      };

      const onGeometryStart = () => {
        geometryTransitioning = true;
        window.clearTimeout(settleTimer);
      };
      const onRefit = () => {
        geometryTransitioning = false;
        // One frame after Tauri confirms the new window size, measure and sync.
        doFit(60);
      };
      window.addEventListener("terminus:geometry-start", onGeometryStart);
      window.addEventListener("terminus:refit", onRefit);
      cleanup.push(() => {
        window.removeEventListener("terminus:geometry-start", onGeometryStart);
        window.removeEventListener("terminus:refit", onRefit);
      });

      settle();
      cleanup.push(() => window.clearTimeout(settleTimer));

      // Relay keystrokes → PTY stdin.
      const onData = term.onData((data) => {
        const id = sessionIdRef.current;
        if (id) void invoke("terminal_write", { id, data });
      });
      cleanup.push(() => onData.dispose());

      // Subscribe to PTY output before opening so we don't drop the banner.
      // Also scan for two Claude Code session errors that both recover by
      // respawning the pane with a fresh conversation id:
      //   • "Session ID … is already in use" — a stale lock or duplicate id.
      //   • "No conversation found with session ID" — a `--resume` of a session
      //     that was marked started but never actually persisted by claude.
      // BOTH only occur at startup (claude aborts immediately), so we only scan
      // within CONFLICT_SCAN_MS of spawn. Scanning the whole session would let
      // ordinary conversation that merely MENTIONS these phrases (e.g. when you
      // ask claude about — or it edits — this terminal code) masquerade as a
      // real error and silently respawn the pane, dropping the conversation.
      // Patterns require the literal "Session ID"/"session ID" form so prose is
      // far less likely to match. The null guard also skips the ~300ms before
      // terminal_open resolves (when sessionIdRef isn't set yet).
      let conflictFired = false;
      void listen<DataEvent>("terminal://data", (ev) => {
        if (!sessionIdRef.current || ev.payload.id !== sessionIdRef.current) return;
        const bytes = decodeBase64(ev.payload.data);
        term.write(bytes);
        if (
          !conflictFired &&
          spawnedAt > 0 &&
          Date.now() - spawnedAt < CONFLICT_SCAN_MS
        ) {
          const text = new TextDecoder().decode(bytes);
          if (
            /Session ID \S+ is already in use/i.test(text) ||
            /No conversation found with session ID/i.test(text)
          ) {
            conflictFired = true;
            onSessionConflictRef.current?.();
          }
        }
      }).then((un) => {
        if (disposed) un();
        else cleanup.push(un);
      });

      void listen<ExitEvent>("terminal://exit", (ev) => {
        if (ev.payload.id !== sessionIdRef.current) return;
        term.write(`\r\n\x1b[2m[${cli} exited]\x1b[0m\r\n`);
        onExit?.(ev.payload.code);
      }).then((un) => {
        if (disposed) un();
        else cleanup.push(un);
      });

      // Reflow → debounced settle fit. Routing through the same `settle` timer
      // as startup means a resize animation's stream of intermediate frames
      // collapses into a single fit + resize once motion stops.
      const ro = new ResizeObserver(() => settle());
      ro.observe(host);
      cleanup.push(() => ro.disconnect());

      return () => {
        disposed = true;
        cleanup.forEach((run) => run());
        const id = sessionIdRef.current;
        sessionIdRef.current = null;
        // Schedule, don't kill: a remount within the grace window cancels this
        // and reconnects, so reloads/HMR keep the running task alive.
        if (id) scheduleTerminalClose(terminalKey, id);
        term.dispose();
        termRef.current = null;
      };
      // Callbacks are stable; resume is read once at mount on purpose, so
      // neither belongs in deps. A profile, session, or cli change remounts via
      // the parent's `key`. `restartNonce` bumps force a full respawn (persona
      // edited) — the prior PTY was already closed by the restart listener, so
      // terminal_open spawns fresh (re-resuming) with the updated persona file.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileId, claudeSessionId, restartNonce]);

    // Dynamically enable / disable the xterm WebGL addon when the user
    // toggles the setting. Disabling disposes the addon and explicitly loses
    // the WebGL context so the GPU process releases texture memory (glyph atlas
    // etc.) immediately rather than waiting for JS GC. Re-enabling loads a
    // fresh addon onto the live terminal.
    useEffect(() => {
      if (!webglEnabled) {
        const addon = webglAddonRef.current;
        webglAddonRef.current = null;

        // Capture GL context references before dispose() can remove their
        // canvases from the DOM, then call loseContext() after disposal so the
        // GPU process frees textures and framebuffers right away.
        const loseFns: Array<() => void> = [];
        if (hostRef.current) {
          hostRef.current.querySelectorAll("canvas").forEach((canvas) => {
            const gl =
              (canvas.getContext("webgl2") ??
                canvas.getContext("webgl")) as WebGLRenderingContext | null;
            const ext = gl?.getExtension("WEBGL_lose_context");
            if (ext) loseFns.push(() => ext.loseContext());
          });
        }

        addon?.dispose();
        loseFns.forEach((fn) => fn());

        // Prevent the DOM-renderer canvases from being promoted to GPU
        // compositor layers — saves the associated backing-store textures.
        if (hostRef.current) {
          hostRef.current.querySelectorAll("canvas").forEach((canvas) => {
            (canvas as HTMLCanvasElement).style.willChange = "auto";
          });
        }
      } else if (termRef.current && !webglAddonRef.current) {
        // Restore compositor hint so xterm's WebGL renderer can use it.
        if (hostRef.current) {
          hostRef.current.querySelectorAll("canvas").forEach((canvas) => {
            (canvas as HTMLCanvasElement).style.willChange = "";
          });
        }
        try {
          const webgl = new WebglAddon();
          webgl.onContextLoss(() => {
            webgl.dispose();
            webglAddonRef.current = null;
          });
          termRef.current.loadAddon(webgl);
          webglAddonRef.current = webgl;
        } catch { /* WebGL unavailable — DOM renderer stays active. */ }
      }
    }, [webglEnabled]);

    return <div className="claude-terminal-host" ref={hostRef} />;
  },
);

export default ClaudeTerminal;
