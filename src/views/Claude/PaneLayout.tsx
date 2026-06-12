import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import ClaudeTerminal, { type ClaudeTerminalHandle } from "./ClaudeTerminal";
import { SplitSquareHorizontal, SplitSquareVertical, X, Send, Maximize2, Minimize2 } from "lucide-react";
import { INJECT_PANE_EVENT, type InjectPaneDetail } from "../../state/delegationMonitor";
import {
  findPane,
  forEachPane,
  type LayoutNode,
  type PaneNode,
  type SplitNode,
} from "../../hooks/useClaudeSessions";
import { draggingPersona } from "../../state/dragState";
import { personaColor } from "../Persona/PersonaAvatar";

/** Ctrl+B — the tmux-style prefix. Sent to the PTY as 0x02 when the follow-up
 *  key isn't a pane command, so a real readline Ctrl+B still works. */
const PREFIX_BYTE = "\x02";

interface PaneCtx {
  sessionId: string;
  profileId: string;
  defaultCwd: string | null;
  reloadKey: number;
  activePaneId: string | null;
  handles: React.MutableRefObject<Map<string, ClaudeTerminalHandle>>;
  leafEls: React.MutableRefObject<Map<string, HTMLElement>>;
  setActive: (paneId: string) => void;
  onSplit: (paneId: string, dir: "row" | "col", forkConvId?: string) => void;
  onClose: (paneId: string) => void;
  onSetRatio: (splitId: string, ratio: number) => void;
  onPaneStarted: (paneId: string) => void;
  onMissingCli?: (message: string) => void;
  onAssignPaneProfile: (paneId: string, profileId: string, cli: string) => void;
  /** Returns true if text was relayed, false if nothing was selected. */
  onRelay: (fromPaneId: string) => boolean;
  /** Generate a new convId for `paneId` to recover from a session lock conflict. */
  onRespawn: (paneId: string) => void;
  /** Persist a pane's custom header title (empty string clears it). */
  onRename: (paneId: string, title: string) => void;
  /** Pane ID currently hovered by an OS file drag, or null. */
  fileDragOverPaneId: string | null;
  /** Expand `paneId` to a centered overlay. */
  onZoom: (paneId: string) => void;
  /** Collapse the currently zoomed pane back into the layout. */
  onUnzoom: () => void;
  zoomedPaneId: string | null;
  zoomExiting: boolean;
  makeKeyHandler: (paneId: string) => (e: KeyboardEvent) => boolean;
  /** >1 pane in the tree → show per-pane close buttons. */
  multi: boolean;
}

interface Props {
  sessionId: string;
  layout: LayoutNode;
  profileId: string;
  defaultCwd: string | null;
  /** Bumped on CLI recheck to force every pane to remount. */
  reloadKey: number;
  /** Mini window mode → render only the active pane full-bleed. */
  mini: boolean;
  /** True only for the currently-visible session. Background (kept-alive)
   *  sessions pass false so their global listeners (OS file-drag) stay dormant. */
  active?: boolean;
  onSplit: (paneId: string, dir: "row" | "col", forkConvId?: string) => void;
  onClose: (paneId: string) => void;
  onSetRatio: (splitId: string, ratio: number) => void;
  onPaneStarted: (paneId: string) => void;
  onMissingCli?: (message: string) => void;
  onAssignPaneProfile: (paneId: string, profileId: string, cli: string) => void;
  onRespawn: (paneId: string) => void;
  onRename: (paneId: string, title: string) => void;
}

/** Ordered list of pane ids as they appear left-to-right / top-to-bottom. */
function paneOrder(node: LayoutNode): string[] {
  const out: string[] = [];
  forEachPane(node, (p) => out.push(p.paneId));
  return out;
}

function countPanes(node: LayoutNode): number {
  let n = 0;
  forEachPane(node, () => n++);
  return n;
}

/** One terminal pane: a header with split/close controls plus the xterm.
 *  Also acts as a drop target — dragging a persona avatar here rebinds the
 *  pane to that persona's CLI and profile. */
function PaneLeaf({ node, ctx }: { node: PaneNode; ctx: PaneCtx }) {
  const active = ctx.activePaneId === node.paneId;
  const [dropOver, setDropOver] = useState(false);
  const [relayMiss, setRelayMiss] = useState(false);
  const [editing, setEditing] = useState(false);

  // Custom title when set, otherwise the CLI name as the default placeholder.
  const displayTitle = node.title ?? node.cli;
  const commitTitle = (value: string) => {
    setEditing(false);
    // Clearing the field reverts to the default (cli); an unchanged custom
    // title is a no-op write that resolveLayout/save absorb harmlessly.
    if (value.trim() !== (node.title ?? "")) ctx.onRename(node.paneId, value);
  };

  const isZoomed = ctx.zoomedPaneId === node.paneId;
  const isExiting = isZoomed && ctx.zoomExiting;
  const isFileDragOver = ctx.fileDragOverPaneId === node.paneId;

  // Per-pane profile override: if this pane was assigned a persona directly,
  // use its own profileId; otherwise fall back to the session-level one.
  const effectiveProfileId = node.profileId ?? ctx.profileId;

  // Build CSS class string.
  let cls = "pane-leaf";
  if (active) cls += " active";
  if (dropOver) cls += " pane-drop-over";
  if (isFileDragOver) cls += " pane-file-drop-over";
  if (isZoomed && !isExiting) cls += " pane-zoomed";
  if (isExiting) cls += " pane-zoom-exiting";

  // Drop accent + zoom origin stored as CSS custom properties.
  const style: React.CSSProperties = {};
  if (dropOver && draggingPersona) {
    (style as Record<string, string>)["--drop-accent"] = personaColor(draggingPersona.id);
  }

  return (
    <div
      className={cls}
      style={Object.keys(style).length ? style : undefined}
      data-pane-id={node.paneId}
      ref={(el) => {
        if (el) ctx.leafEls.current.set(node.paneId, el);
        else ctx.leafEls.current.delete(node.paneId);
      }}
      onMouseDownCapture={() => ctx.setActive(node.paneId)}
      onPointerEnter={() => { if (draggingPersona) setDropOver(true); }}
      onPointerLeave={() => setDropOver(false)}
    >
      <div className="pane-header">
        {editing ? (
          <input
            className="pane-header-title-input"
            defaultValue={node.title ?? ""}
            placeholder={node.cli}
            autoFocus
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={(e) => commitTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitTitle(e.currentTarget.value);
              else if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span
            className="pane-header-cli"
            title="Click to rename"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          >
            {displayTitle}
          </span>
        )}
        <span className="pane-header-spacer" />
        {ctx.multi && !isZoomed && (
          <button
            type="button"
            className={`pane-header-btn${relayMiss ? " relay-miss" : ""}`}
            title="Select text in terminal, then click to relay to the next pane"
            onClick={() => {
              const ok = ctx.onRelay(node.paneId);
              if (!ok) {
                setRelayMiss(true);
                window.setTimeout(() => setRelayMiss(false), 500);
              }
            }}
          >
            <Send size={12} strokeWidth={1.75} />
          </button>
        )}
        {!isZoomed && (
          <>
            <button
              type="button"
              className="pane-header-btn"
              title="Split right (Ctrl+B %) · Shift+click to fork conversation"
              onClick={(e) => ctx.onSplit(node.paneId, "row", e.shiftKey ? node.convId : undefined)}
            >
              <SplitSquareHorizontal size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="pane-header-btn"
              title='Split down (Ctrl+B ") · Shift+click to fork conversation'
              onClick={(e) => ctx.onSplit(node.paneId, "col", e.shiftKey ? node.convId : undefined)}
            >
              <SplitSquareVertical size={13} strokeWidth={1.75} />
            </button>
          </>
        )}
        <button
          type="button"
          className="pane-header-btn"
          title={isZoomed ? "Collapse pane (Esc)" : "Zoom pane"}
          onClick={() => isZoomed ? ctx.onUnzoom() : ctx.onZoom(node.paneId)}
        >
          {isZoomed
            ? <Minimize2 size={13} strokeWidth={1.75} />
            : <Maximize2 size={13} strokeWidth={1.75} />}
        </button>
        {ctx.multi && !isZoomed && (
          <button
            type="button"
            className="pane-header-btn close"
            title="Close pane (Ctrl+B x)"
            onClick={() => ctx.onClose(node.paneId)}
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <ClaudeTerminal
        key={`${node.paneId}:${ctx.reloadKey}`}
        ref={(h) => {
          if (h) ctx.handles.current.set(node.paneId, h);
          else ctx.handles.current.delete(node.paneId);
        }}
        profileId={effectiveProfileId}
        claudeSessionId={node.convId}
        forkFromSessionId={node.started ? undefined : node.forkFromConvId}
        resume={node.started}
        cwd={node.cwd ?? ctx.defaultCwd}
        cli={node.cli}
        onMissingCli={ctx.onMissingCli}
        onOpened={() => ctx.onPaneStarted(node.paneId)}
        onSessionConflict={() => ctx.onRespawn(node.paneId)}
        onFocus={() => ctx.setActive(node.paneId)}
        onKeyEvent={ctx.makeKeyHandler(node.paneId)}
      />
    </div>
  );
}

/** An internal split: two children plus a draggable divider. */
function PaneSplit({ node, ctx }: { node: SplitNode; ctx: PaneCtx }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onDividerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const move = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const frac =
        node.dir === "row"
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
      ctx.onSetRatio(node.splitId, frac);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = node.dir === "row" ? "col-resize" : "row-resize";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div ref={containerRef} className={`pane-split ${node.dir}`}>
      <div className="pane-split-child" style={{ flexGrow: node.ratio }}>
        {renderNode(node.children[0], ctx)}
      </div>
      <div
        className={`pane-divider ${node.dir}`}
        onMouseDown={onDividerDown}
        role="separator"
      />
      <div className="pane-split-child" style={{ flexGrow: 1 - node.ratio }}>
        {renderNode(node.children[1], ctx)}
      </div>
    </div>
  );
}

function renderNode(node: LayoutNode, ctx: PaneCtx): JSX.Element {
  return node.type === "pane" ? (
    <PaneLeaf node={node} ctx={ctx} />
  ) : (
    <PaneSplit node={node} ctx={ctx} />
  );
}

/** Renders a session's split layout as a tree of terminal panes. Exposes a
 *  ClaudeTerminalHandle that proxies to the currently active pane so the
 *  toolbar (compose/insert/screenshot) drives whichever pane has focus. */
const PaneLayout = forwardRef<ClaudeTerminalHandle, Props>(function PaneLayout(
  {
    sessionId,
    layout,
    profileId,
    defaultCwd,
    reloadKey,
    mini,
    active = true,
    onSplit,
    onClose,
    onSetRatio,
    onPaneStarted,
    onMissingCli,
    onAssignPaneProfile,
    onRespawn,
    onRename,
  },
  ref,
) {
  const handles = useRef<Map<string, ClaudeTerminalHandle>>(new Map());
  const leafEls = useRef<Map<string, HTMLElement>>(new Map());
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
  const armedRef = useRef(false);
  // Live `active` for the file-drag listener closure (registered once on mount).
  const activeRef = useRef(active);
  activeRef.current = active;

  // Pane zoom state — purely visual, doesn't affect stored layout.
  const [zoomedPaneId, setZoomedPaneId] = useState<string | null>(null);
  const [zoomExiting, setZoomExiting] = useState(false);
  const zoomExitTimer = useRef<number>(0);

  // Which pane is currently hovered by an OS-level file drag.
  const [fileDragOverPaneId, setFileDragOverPaneId] = useState<string | null>(null);

  const onZoom = (paneId: string) => {
    window.clearTimeout(zoomExitTimer.current);
    setZoomExiting(false);
    setZoomedPaneId(paneId);
    setActivePaneId(paneId);
    // Block intermediate ResizeObserver fits while the animation is running,
    // then do one clean refit + focus once the card-in animation settles.
    window.dispatchEvent(new Event("terminus:geometry-start"));
    window.setTimeout(() => {
      handles.current.get(paneId)?.focus();
      window.dispatchEvent(new Event("terminus:refit"));
    }, 290);
  };

  const onUnzoom = () => {
    setZoomExiting(true);
    window.dispatchEvent(new Event("terminus:geometry-start"));
    zoomExitTimer.current = window.setTimeout(() => {
      setZoomedPaneId(null);
      setZoomExiting(false);
      window.dispatchEvent(new Event("terminus:refit"));
    }, 210);
  };

  // Collapse zoom on Escape.
  useEffect(() => {
    if (!zoomedPaneId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onUnzoom(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomedPaneId]);

  // Handle OS-level file / folder drag-drop onto any pane.
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const getPaneAtPhysical = (px: number, py: number): string | null => {
      // Tauri emits physical (device) pixels; convert to CSS pixels.
      const ratio = window.devicePixelRatio || 1;
      const cx = px / ratio;
      const cy = py / ratio;
      for (const [id, el] of leafEls.current) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
          return id;
        }
      }
      return null;
    };

    void getCurrentWebview().onDragDropEvent((ev) => {
      // Only the visible session reacts — background kept-alive sessions share
      // this webview-level event and would otherwise all insert on one drop.
      if (!activeRef.current) return;
      const p = ev.payload;
      if (p.type === "enter" || p.type === "over") {
        setFileDragOverPaneId(getPaneAtPhysical(p.position.x, p.position.y));
      } else if (p.type === "drop") {
        setFileDragOverPaneId(null);
        const paneId = getPaneAtPhysical(p.position.x, p.position.y);
        if (paneId && p.paths.length > 0) {
          // Quote paths that contain spaces; join multiple with a space separator.
          const text = p.paths
            .map((path) => (/\s/.test(path) ? `"${path}"` : path))
            .join(" ");
          handles.current.get(paneId)?.insert(text + " ");
          handles.current.get(paneId)?.focus();
        }
      } else if (p.type === "leave") {
        setFileDragOverPaneId(null);
      }
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  const order = paneOrder(layout);
  const orderKey = order.join(",");
  const prevOrderRef = useRef<string[]>([]);

  // Default the active pane to the first leaf, and focus any newly created pane
  // (so a split — by button or keyboard — lands focus on the fresh terminal).
  useEffect(() => {
    const prev = prevOrderRef.current;
    const added = order.filter((id) => !prev.includes(id));
    prevOrderRef.current = order;
    if (activePaneId && order.includes(activePaneId)) {
      if (added.length === 1) {
        const fresh = added[0];
        setActivePaneId(fresh);
        // Focus after the new terminal has mounted.
        window.setTimeout(() => handles.current.get(fresh)?.focus(), 0);
      }
      return;
    }
    setActivePaneId(order[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const focusPane = (paneId: string) => {
    setActivePaneId(paneId);
    handles.current.get(paneId)?.focus();
  };

  /** Nearest pane to `from` in a spatial direction, by element centers. */
  const directionalTarget = (
    from: string,
    dir: "left" | "right" | "up" | "down",
  ): string | null => {
    const fromEl = leafEls.current.get(from);
    if (!fromEl) return null;
    const a = fromEl.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const id of order) {
      if (id === from) continue;
      const el = leafEls.current.get(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const ok =
        (dir === "left" && cx < ax) ||
        (dir === "right" && cx > ax) ||
        (dir === "up" && cy < ay) ||
        (dir === "down" && cy > ay);
      if (!ok) continue;
      const dist = Math.hypot(cx - ax, cy - ay);
      if (dist < bestDist) {
        bestDist = dist;
        best = id;
      }
    }
    return best;
  };

  // Stable across renders: the prefix state machine reads live refs/closures.
  const makeKeyHandler = (paneId: string) => (e: KeyboardEvent) => {
    if (e.type !== "keydown") return true;

    if (armedRef.current) {
      armedRef.current = false;
      // Pane commands (consumed, never reach the PTY).
      if (e.key === "%") {
        onSplit(paneId, "row");
        return false;
      }
      if (e.key === '"') {
        onSplit(paneId, "col");
        return false;
      }
      if (e.key === "f" || e.key === "F") {
        // Fork: new pane that shares the current conversation history.
        const srcPane = findPane(layout, paneId);
        if (srcPane) onSplit(paneId, "row", srcPane.convId);
        return false;
      }
      if (e.key === "x") {
        if (countPanes(layout) > 1) onClose(paneId);
        return false;
      }
      if (e.key === "o") {
        const i = order.indexOf(paneId);
        const next = order[(i + 1) % order.length];
        if (next) focusPane(next);
        return false;
      }
      const arrows: Record<string, "left" | "right" | "up" | "down"> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      if (e.key in arrows) {
        const target = directionalTarget(paneId, arrows[e.key]);
        if (target) focusPane(target);
        return false;
      }
      // Not a pane command: replay the swallowed prefix, then let this key flow.
      handles.current.get(paneId)?.insert(PREFIX_BYTE);
      return true;
    }

    // Arm on Ctrl+B (no other modifiers), swallowing it from the PTY.
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "b" || e.key === "B")) {
      armedRef.current = true;
      return false;
    }
    return true;
  };

  // Relay the selected text from `fromPaneId` to the next pane in tree order.
  // Returns false when nothing was selected so PaneLeaf can flash the button.
  const onRelay = (fromPaneId: string): boolean => {
    const text = handles.current.get(fromPaneId)?.getSelection() ?? "";
    if (!text.trim()) return false;
    const fromIdx = order.indexOf(fromPaneId);
    const targetId = order[(fromIdx + 1) % order.length];
    if (targetId && targetId !== fromPaneId) {
      handles.current.get(targetId)?.writeLine(text);
      return true;
    }
    return false;
  };

  // Listen for cross-component injection events dispatched by the delegation
  // monitor routing layer in ClaudeTab.
  useEffect(() => {
    const handler = (e: Event) => {
      const { paneId: tgt, text } = (e as CustomEvent<InjectPaneDetail>).detail;
      handles.current.get(tgt)?.writeLine(text);
    };
    window.addEventListener(INJECT_PANE_EVENT, handler);
    return () => window.removeEventListener(INJECT_PANE_EVENT, handler);
  }, []);

  useImperativeHandle(ref, () => ({
    writeLine: (text: string) => {
      const id = activePaneId ?? order[0];
      if (id) handles.current.get(id)?.writeLine(text);
    },
    insert: (text: string) => {
      const id = activePaneId ?? order[0];
      if (id) handles.current.get(id)?.insert(text);
    },
    focus: () => {
      const id = activePaneId ?? order[0];
      if (id) handles.current.get(id)?.focus();
    },
    getSelection: () => {
      const id = activePaneId ?? order[0];
      return id ? (handles.current.get(id)?.getSelection() ?? "") : "";
    },
  }));

  // Shared zoom + file-drag props injected into every ctx.
  const zoomCtx = { zoomedPaneId, zoomExiting, onZoom, onUnzoom, fileDragOverPaneId };

  // Mini mode: a split layout is unusable at 460px — render the active pane only.
  if (mini) {
    let pane: PaneNode | null = null;
    forEachPane(layout, (p) => {
      if (p.paneId === (activePaneId ?? order[0])) pane = p;
    });
    if (!pane) forEachPane(layout, (p) => (pane ??= p));
    const ctx: PaneCtx = {
      sessionId, profileId, defaultCwd, reloadKey, activePaneId,
      handles, leafEls, setActive: setActivePaneId,
      onSplit, onClose, onSetRatio, onPaneStarted, onMissingCli,
      onAssignPaneProfile, onRelay, onRespawn, onRename,
      ...zoomCtx,
      makeKeyHandler, multi: false,
    };
    return (
      <div className="pane-root">{pane ? <PaneLeaf node={pane} ctx={ctx} /> : null}</div>
    );
  }

  const ctx: PaneCtx = {
    sessionId, profileId, defaultCwd, reloadKey, activePaneId,
    handles, leafEls, setActive: setActivePaneId,
    onSplit, onClose, onSetRatio, onPaneStarted, onMissingCli,
    onAssignPaneProfile, onRelay, onRespawn, onRename,
    ...zoomCtx,
    makeKeyHandler, multi: order.length > 1,
  };

  // The backdrop is rendered inline (NOT portaled) so it shares the same
  // stacking context as the zoomed pane. cockpit-frame's backdrop-filter makes
  // it the containing block for position:fixed, so both elements are positioned
  // relative to that frame. z-index 901 (pane) > 900 (backdrop) works correctly.
  return (
    <>
      {zoomedPaneId && (
        <div
          className={`pane-zoom-backdrop${zoomExiting ? " exiting" : ""}`}
          onClick={onUnzoom}
          aria-hidden="true"
        />
      )}
      <div className="pane-root">{renderNode(layout, ctx)}</div>
    </>
  );
});

export default PaneLayout;
