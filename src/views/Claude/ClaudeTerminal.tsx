import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { useThemeStore } from "../../state/themeStore";
import { xtermThemeForTheme } from "../../state/uiPalette";

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

/** xterm.js surface bound to a Rust PTY running `claude`. The parent keys this
 *  component on profileId + session so switching tears down and respawns. */
const ClaudeTerminal = forwardRef<ClaudeTerminalHandle, Props>(
  function ClaudeTerminal(
    { profileId, claudeSessionId, forkFromSessionId, cwd, cli = "claude",
      onMissingCli, onOpened, onExit, onFocus, onKeyEvent, onSessionConflict },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const themeName = useThemeStore((s) => s.name);

    // Keep the latest focus/key/conflict callbacks in refs so the mount-time
    // effect always calls the current version without being in its deps.
    const onFocusRef = useRef(onFocus);
    onFocusRef.current = onFocus;
    const onKeyEventRef = useRef(onKeyEvent);
    onKeyEventRef.current = onKeyEvent;
    const onSessionConflictRef = useRef(onSessionConflict);
    onSessionConflictRef.current = onSessionConflict;

    // Re-theme the live terminal when the cockpit theme changes (no remount).
    useEffect(() => {
      if (termRef.current) {
        termRef.current.options.theme = xtermThemeForTheme(themeName);
      }
    }, [themeName]);

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
        theme: xtermThemeForTheme(useThemeStore.getState().name),
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

      // DOM renderer only (no WebGL): the WebGL addon ghosts/flickers under
      // macOS WKWebView, which is what we're rendering inside.
      term.open(host);

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

      const doFit = (delay: number) => {
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => {
          try {
            fit.fit();
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
            void invoke<string>("terminal_open", {
              profileId,
              cols: term.cols,
              rows: term.rows,
              claudeSessionId: spawnSessionId,
              cwd: cwd ?? null,
              cli,
            })
              .then((id) => {
                if (disposed) {
                  void invoke("terminal_close", { id });
                  return;
                }
                sessionIdRef.current = id;
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
                    `\r\n\x1b[31m[openterminus] failed to start ${cli}: ${msg}\x1b[0m\r\n`,
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
      // Also scan for Claude Code's session-lock error to auto-recover from stale locks.
      // Pattern is intentionally narrow: Node.js EADDRINUSE also contains "is already in use"
      // (e.g. "address already in use :::3000") and would fire false positives. We require
      // the word "Session" or "session-id" nearby so only Claude Code's own conflict message
      // triggers a respawn. The null guard prevents the ~300ms startup window (before
      // terminal_open resolves and sessionIdRef is set) from processing other terminals' data.
      let conflictFired = false;
      void listen<DataEvent>("terminal://data", (ev) => {
        if (!sessionIdRef.current || ev.payload.id !== sessionIdRef.current) return;
        const bytes = decodeBase64(ev.payload.data);
        term.write(bytes);
        if (!conflictFired) {
          const text = new TextDecoder().decode(bytes);
          if (/[Ss]ession.*is already in use|is already in use.*session/i.test(text)) {
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
        term.write("\r\n\x1b[2m[claude exited]\x1b[0m\r\n");
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
        if (id) void invoke("terminal_close", { id });
        term.dispose();
        termRef.current = null;
      };
      // Callbacks are stable; resume is read once at mount on purpose, so
      // neither belongs in deps. A profile, session, or cli change remounts via
      // the parent's `key`.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileId, claudeSessionId]);

    return <div className="claude-terminal-host" ref={hostRef} />;
  },
);

export default ClaudeTerminal;
