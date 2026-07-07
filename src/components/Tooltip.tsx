import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** Keep a tooltip at least this far from the viewport edge. */
const EDGE_PAD = 8;

interface Props {
  /** Tooltip body — short text, or rich nodes for keyboard hints etc. */
  label: ReactNode;
  /** Where to anchor relative to the trigger. Default "top". */
  side?: "top" | "bottom";
  /** Show delay in ms (matches native title feel but faster). Default 350. */
  delay?: number;
  /** The single trigger element. Its existing handlers are preserved. */
  children: ReactElement<{
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    "aria-describedby"?: string;
  }>;
}

interface Pos {
  x: number;
  y: number;
  side: "top" | "bottom";
}

/** Shared hover/focus tooltip — a single, consistent surface to replace the
 *  scattered native `title` attributes across the toolbar and pane headers.
 *
 *  Renders into a body portal so it never gets clipped by overflow:hidden
 *  containers, and shows on focus too (keyboard accessible). The trigger keeps
 *  its own handlers; we just compose ours on top and wire `aria-describedby`. */
export default function Tooltip({ label, side = "top", delay = 350, children }: Props) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [shiftX, setShiftX] = useState(0);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();

  // After the tooltip renders, measure it and shift horizontally so the whole
  // box (it's translateX(-50%), so it extends w/2 past `left` on each side)
  // stays within the viewport. Fixes long labels running off the right edge.
  useLayoutEffect(() => {
    if (!pos) {
      setShiftX(0);
      return;
    }
    const el = tipRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = 0;
    if (r.right > window.innerWidth - EDGE_PAD) dx = window.innerWidth - EDGE_PAD - r.right;
    else if (r.left < EDGE_PAD) dx = EDGE_PAD - r.left;
    setShiftX(dx);
  }, [pos]);

  const show = useCallback(
    (el: HTMLElement, immediate = false) => {
      window.clearTimeout(timer.current);
      const place = () => {
        const r = el.getBoundingClientRect();
        const wantBottom = side === "bottom";
        setPos({
          x: r.left + r.width / 2,
          y: wantBottom ? r.bottom + 8 : r.top - 8,
          side: wantBottom ? "bottom" : "top",
        });
      };
      if (immediate) place();
      else timer.current = window.setTimeout(place, delay);
    },
    [side, delay],
  );

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setPos(null);
  }, []);

  if (!isValidElement(children) || label == null || label === "") {
    return children ?? null;
  }

  const trigger = cloneElement(children, {
    "aria-describedby": pos ? id : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      show(e.currentTarget as HTMLElement);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      show(e.currentTarget as HTMLElement, true);
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className={`app-tooltip app-tooltip--${pos.side}`}
            ref={tipRef}
            style={{
              left: pos.x,
              top: pos.y,
              transform:
                pos.side === "top"
                  ? `translate(calc(-50% + ${shiftX}px), -100%)`
                  : `translateX(calc(-50% + ${shiftX}px))`,
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
