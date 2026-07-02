import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check, Maximize2, X } from "lucide-react";

/** A selection rectangle in overlay-local CSS pixels (== logical points). */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface Drag {
  mode: "draw" | "move" | "resize";
  startX: number;
  startY: number;
  origin: Rect;
  handle?: Handle;
}

/** Normalize a rect so width/height are positive (drag can go any direction). */
function normalize(r: Rect): Rect {
  let { x, y, w, h } = r;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return { x, y, w, h };
}

function resizeRect(o: Rect, handle: Handle, dx: number, dy: number): Rect {
  let { x, y, w, h } = o;
  if (handle.includes("e")) w = o.w + dx;
  if (handle.includes("s")) h = o.h + dy;
  if (handle.includes("w")) {
    x = o.x + dx;
    w = o.w - dx;
  }
  if (handle.includes("n")) {
    y = o.y + dy;
    h = o.h - dy;
  }
  return normalize({ x, y, w, h });
}

/**
 * Fullscreen region-capture overlay (its own transparent Tauri window). The
 * user drags a selection rectangle over the live desktop; the area outside the
 * selection is dimmed (a huge box-shadow on the selection box). The selection
 * is movable (drag the interior) and resizable (8 handles). The floating
 * toolbar confirms (→ `screenshot_grab`, which also copies to the clipboard)
 * or cancels. Rust hides this window after a grab; state resets on next open
 * via the `screenshot:reset` event.
 */
export default function ScreenshotOverlay() {
  const [sel, setSel] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const selRef = useRef<Rect | null>(null);
  selRef.current = sel;

  // Window-capture mode: rects of the on-screen windows (overlay-local), the
  // one currently hovered, and the candidate pick recorded at mousedown.
  const windowsRef = useRef<Rect[]>([]);
  const [hoverWin, setHoverWin] = useState<Rect | null>(null);
  const hoverWinRef = useRef<Rect | null>(null);
  hoverWinRef.current = hoverWin;
  const pickRef = useRef<Rect | null>(null);

  const fetchWindows = useCallback(async () => {
    try {
      const list = await invoke<
        { x: number; y: number; width: number; height: number }[]
      >("screenshot_windows");
      windowsRef.current = (Array.isArray(list) ? list : []).map((w) => ({
        x: w.x,
        y: w.y,
        w: w.width,
        h: w.height,
      }));
    } catch {
      windowsRef.current = [];
    }
  }, []);

  const cancel = useCallback(() => {
    setSel(null);
    setError(null);
    dragRef.current = null;
    void invoke("screenshot_cancel");
  }, []);

  const confirm = useCallback(async () => {
    const s = selRef.current ? normalize(selRef.current) : null;
    if (!s || s.w < 2 || s.h < 2) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("screenshot_grab", {
        x: s.x,
        y: s.y,
        width: s.w,
        height: s.h,
        clipboard: true,
      });
      // Rust hides the window; clear so the next open starts fresh even if the
      // reset event is missed.
      setSel(null);
    } catch (e) {
      // Rust re-shows the overlay on failure; surface the reason so the capture
      // doesn't just silently vanish (most often: Screen Recording permission).
      console.error("screenshot_grab failed", e);
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onWinMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "draw") {
      setSel({ x: d.startX, y: d.startY, w: dx, h: dy });
    } else if (d.mode === "move") {
      const maxX = window.innerWidth - d.origin.w;
      const maxY = window.innerHeight - d.origin.h;
      setSel({
        x: Math.min(Math.max(d.origin.x + dx, 0), Math.max(0, maxX)),
        y: Math.min(Math.max(d.origin.y + dy, 0), Math.max(0, maxY)),
        w: d.origin.w,
        h: d.origin.h,
      });
    } else if (d.mode === "resize" && d.handle) {
      setSel(resizeRect(d.origin, d.handle, dx, dy));
    }
  }, []);

  const onWinUp = useCallback(() => {
    window.removeEventListener("mousemove", onWinMove);
    window.removeEventListener("mouseup", onWinUp);
    const d = dragRef.current;
    dragRef.current = null;
    setSel((s) => {
      const n = s ? normalize(s) : null;
      // A click with no real drag → select the hovered window, if any.
      if (d && d.mode === "draw" && (!n || (n.w < 5 && n.h < 5))) {
        const pick = pickRef.current;
        pickRef.current = null;
        return pick ? { ...pick } : null;
      }
      return n;
    });
    setHoverWin(null);
  }, [onWinMove]);

  const beginDrag = useCallback(
    (d: Drag) => {
      dragRef.current = d;
      window.addEventListener("mousemove", onWinMove);
      window.addEventListener("mouseup", onWinUp);
    },
    [onWinMove, onWinUp],
  );

  // Fresh selection — mousedown on the empty backdrop.
  const onRootMouseDown = (e: React.MouseEvent) => {
    if (busy) return;
    const sx = e.clientX;
    const sy = e.clientY;
    // Remember the window under the cursor; used if this turns out to be a
    // click (window pick) rather than a drag (freehand region).
    pickRef.current = hoverWinRef.current;
    setSel({ x: sx, y: sy, w: 0, h: 0 });
    beginDrag({ mode: "draw", startX: sx, startY: sy, origin: { x: sx, y: sy, w: 0, h: 0 } });
  };

  // Highlight the window under the cursor — only in pure window mode (no
  // selection yet, not dragging).
  const onRootMouseMove = (e: React.MouseEvent) => {
    if (busy || dragRef.current || selRef.current) {
      if (hoverWinRef.current) setHoverWin(null);
      return;
    }
    const x = e.clientX;
    const y = e.clientY;
    const win =
      windowsRef.current.find(
        (w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h,
      ) ?? null;
    const cur = hoverWinRef.current;
    if (
      win === cur ||
      (win &&
        cur &&
        win.x === cur.x &&
        win.y === cur.y &&
        win.w === cur.w &&
        win.h === cur.h)
    ) {
      return;
    }
    setHoverWin(win);
  };

  const onSelMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sel || busy) return;
    beginDrag({ mode: "move", startX: e.clientX, startY: e.clientY, origin: { ...sel } });
  };

  const onHandleMouseDown = (handle: Handle) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sel || busy) return;
    beginDrag({ mode: "resize", handle, startX: e.clientX, startY: e.clientY, origin: { ...sel } });
  };

  // Reset when the overlay is re-opened for a new capture.
  useEffect(() => {
    void fetchWindows();
    const p = listen("screenshot:reset", () => {
      setSel(null);
      setBusy(false);
      setError(null);
      setHoverWin(null);
      dragRef.current = null;
      void fetchWindows();
    });
    return () => {
      void p.then((fn) => fn());
    };
  }, [fetchWindows]);

  // Keyboard: Esc cancels, Enter confirms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void confirm();
      } else if (e.key === " ") {
        // Space → grab the whole screen (matches the hint).
        e.preventDefault();
        setSel({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, confirm]);

  const hasSel = !!sel && sel.w > 1 && sel.h > 1;
  const norm = sel ? normalize(sel) : null;

  // Toolbar placement: below the selection when there's room, else above;
  // right-aligned to the selection edge and clamped to the viewport.
  let toolbarStyle: React.CSSProperties | undefined;
  if (norm) {
    const TB_H = 46;
    const below = norm.y + norm.h + 12 + TB_H < window.innerHeight;
    const top = below
      ? norm.y + norm.h + 12
      : Math.max(8, norm.y - TB_H - 12);
    const left = Math.min(
      Math.max(norm.x + norm.w - 168, 8),
      window.innerWidth - 176,
    );
    toolbarStyle = { top, left };
  }

  return (
    <div
      className="shot-root"
      onMouseDown={onRootMouseDown}
      onMouseMove={onRootMouseMove}
    >
      {error && (
        <div className="shot-error" onMouseDown={(e) => e.stopPropagation()}>
          <span>{error}</span>
          {/permission/i.test(error) && (
            <button
              type="button"
              className="shot-error-btn"
              onClick={() => void invoke("screenshot_open_settings")}
            >
              Open Settings
            </button>
          )}
        </div>
      )}
      {!sel && (
        <div className="shot-predim">
          <div className="shot-hint">
            <span className="shot-hint-key">Drag</span> to select
            <span className="shot-hint-dot">·</span>
            <span className="shot-hint-key">Click</span> a window
            <span className="shot-hint-dot">·</span>
            <span className="shot-hint-key">Space</span> full screen
            <span className="shot-hint-dot">·</span>
            <span className="shot-hint-key">Esc</span> cancel
          </div>
        </div>
      )}
      {!sel && hoverWin && (
        <div
          className="shot-winhint"
          style={{
            left: hoverWin.x,
            top: hoverWin.y,
            width: hoverWin.w,
            height: hoverWin.h,
          }}
        />
      )}

      {norm && (
        <div
          className="shot-selection"
          style={{ left: norm.x, top: norm.y, width: norm.w, height: norm.h }}
          onMouseDown={onSelMouseDown}
          onDoubleClick={() => void confirm()}
          title="Double-click to capture"
        >
          {hasSel && (
            <div
              className={`shot-size${norm.y < 30 ? " inside" : ""}`}
              aria-hidden="true"
            >
              {Math.round(norm.w)} × {Math.round(norm.h)}
            </div>
          )}
          {hasSel &&
            HANDLES.map((h) => (
              <span
                key={h}
                className={`shot-handle h-${h}`}
                onMouseDown={onHandleMouseDown(h)}
              />
            ))}
        </div>
      )}

      {hasSel && toolbarStyle && (
        <div
          className="shot-toolbar"
          style={toolbarStyle}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="shot-btn"
            title="Full screen (Space)"
            aria-label="Capture full screen"
            onClick={() =>
              setSel({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight })
            }
          >
            <Maximize2 size={15} strokeWidth={2} />
          </button>
          <span className="shot-toolbar-sep" />
          <button
            type="button"
            className="shot-btn cancel"
            title="Cancel (Esc)"
            aria-label="Cancel"
            onClick={cancel}
          >
            <X size={16} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="shot-btn confirm"
            title="Capture & copy (↵)"
            aria-label="Capture to clipboard"
            disabled={busy}
            onClick={() => void confirm()}
          >
            <Check size={17} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
