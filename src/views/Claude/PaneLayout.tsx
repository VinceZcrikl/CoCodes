import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import ClaudeTerminal, { type ClaudeTerminalHandle } from "./ClaudeTerminal";
import { SplitSquareHorizontal, SplitSquareVertical, X, Send } from "lucide-react";
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
  onSplit: (paneId: string, dir: "row" | "col", forkConvId?: string) => void;
  onClose: (paneId: string) => void;
  onSetRatio: (splitId: string, ratio: number) => void;
  onPaneStarted: (paneId: string) => void;
  onMissingCli?: (message: string) => void;
  onAssignPaneProfile: (paneId: string, profileId: string, cli: string) => void;
  onRespawn: (paneId: string) => void;
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

  // Per-pane profile override: if this pane was assigned a persona directly,
  // use its own profileId; otherwise fall back to the session-level one.
  const effectiveProfileId = node.profileId ?? ctx.profileId;

  return (
    <div
      className={`pane-leaf${active ? " active" : ""}${dropOver ? " pane-drop-over" : ""}`}
      style={
        dropOver && draggingPersona
          ? ({ "--drop-accent": personaColor(draggingPersona.id) } as React.CSSProperties)
          : undefined
      }
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
        <span className="pane-header-cli">{node.cli}</span>
        <span className="pane-header-spacer" />
        {ctx.multi && (
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
        {ctx.multi && (
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
    onSplit,
    onClose,
    onSetRatio,
    onPaneStarted,
    onMissingCli,
    onAssignPaneProfile,
    onRespawn,
  },
  ref,
) {
  const handles = useRef<Map<string, ClaudeTerminalHandle>>(new Map());
  const leafEls = useRef<Map<string, HTMLElement>>(new Map());
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
  const armedRef = useRef(false);

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

  // Mini mode: a split layout is unusable at 460px — render the active pane only.
  if (mini) {
    let pane: PaneNode | null = null;
    forEachPane(layout, (p) => {
      if (p.paneId === (activePaneId ?? order[0])) pane = p;
    });
    if (!pane) forEachPane(layout, (p) => (pane ??= p));
    const ctx: PaneCtx = {
      sessionId,
      profileId,
      defaultCwd,
      reloadKey,
      activePaneId,
      handles,
      leafEls,
      setActive: setActivePaneId,
      onSplit,
      onClose,
      onSetRatio,
      onPaneStarted,
      onMissingCli,
      onAssignPaneProfile,
      onRelay,
      onRespawn,
      makeKeyHandler,
      multi: false,
    };
    return (
      <div className="pane-root">{pane ? <PaneLeaf node={pane} ctx={ctx} /> : null}</div>
    );
  }

  const ctx: PaneCtx = {
    sessionId,
    profileId,
    defaultCwd,
    reloadKey,
    activePaneId,
    handles,
    leafEls,
    setActive: setActivePaneId,
    onSplit,
    onClose,
    onSetRatio,
    onPaneStarted,
    onMissingCli,
    onAssignPaneProfile,
    onRelay,
    onRespawn,
    makeKeyHandler,
    multi: order.length > 1,
  };

  return <div className="pane-root">{renderNode(layout, ctx)}</div>;
});

export default PaneLayout;
