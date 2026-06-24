/** Update button — sits next to the palette dot in the cockpit header.
 *
 *  Hidden by default. It appears automatically only once a check finds a newer
 *  version: a gold, gently pulsing download icon. Clicking it opens a popover to
 *  Download & Install with a live progress bar, then Restart. There is no manual
 *  "check" button — checks run silently in the background (startup + periodic,
 *  driven from Cockpit), so the button surfaces on its own when an update lands.
 *
 *  Download + install are handled here via @tauri-apps/plugin-updater. */
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, X } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  useUpdateStore,
  getPendingUpdate,
  setPendingUpdate,
} from "../../state/updateStore";

export default function UpdateButton() {
  const phase = useUpdateStore((s) => s.phase);
  const version = useUpdateStore((s) => s.version);
  const notes = useUpdateStore((s) => s.notes);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);
  const { setProgress, setPhase, setError, reset } = useUpdateStore();

  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const startDownload = async () => {
    const update = getPendingUpdate();
    if (!update) return;
    setPhase("downloading");
    setProgress(0);
    try {
      let contentLen = 0;
      let downloaded = 0;
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          contentLen = ev.data.contentLength ?? 0;
        } else if (ev.event === "Progress") {
          downloaded += ev.data.chunkLength;
          setProgress(contentLen > 0 ? downloaded / contentLen : 0);
        } else if (ev.event === "Finished") {
          setPhase("ready");
        }
      });
      // downloadAndInstall resolves after install — trigger relaunch.
      setPhase("ready");
      await relaunch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Closing dismisses a failed download (back to hidden); an available/ready
  // update stays put so the user can act on it later.
  const close = () => {
    setOpen(false);
    if (phase === "error") reset();
  };

  // Only ever visible when there's a real update to act on. The background
  // checks leave the phase at "idle" when there's nothing new → button hidden.
  if (phase !== "available" && phase !== "downloading" && phase !== "ready" && phase !== "error") {
    return null;
  }

  const pct = Math.round(progress * 100);
  const title =
    phase === "available" ? `Update ${version} available`
    : phase === "downloading" ? `Downloading… ${pct}%`
    : phase === "ready" ? "Ready to install"
    : "Update failed";

  return (
    <div className="cockpit-update-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={
          "cockpit-update-btn" +
          (phase === "available" ? " cockpit-update-btn--pulse" : "") +
          (open ? " cockpit-update-btn--open" : "")
        }
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <ArrowDownToLine size={13} strokeWidth={2} />
      </button>

      {open && (
        <div className="update-popover" ref={popoverRef} role="dialog" aria-label="Software update">
          <div className="update-popover-header">
            <span className="update-popover-title">
              {phase === "available" && `CoCodes ${version}`}
              {phase === "downloading" && "Downloading update…"}
              {phase === "ready" && "Ready to install"}
              {phase === "error" && "Update failed"}
            </span>
            <button type="button" className="update-popover-close" onClick={close} aria-label="Close">
              <X size={13} strokeWidth={2} />
            </button>
          </div>

          {phase === "available" && notes && (
            <p className="update-popover-notes">{notes}</p>
          )}

          {phase === "downloading" && (
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          )}

          {phase === "error" && (
            <p className="update-popover-notes update-popover-error">{error}</p>
          )}

          <div className="update-popover-actions">
            {phase === "available" && (
              <button type="button" className="update-action-btn update-action-btn--primary" onClick={startDownload}>
                Download &amp; Install
              </button>
            )}
            {phase === "downloading" && (
              <span className="update-pct-label">{pct}%</span>
            )}
            {phase === "ready" && (
              <button type="button" className="update-action-btn update-action-btn--primary" onClick={() => void relaunch()}>
                Restart Now
              </button>
            )}
            {phase === "error" && (
              <button type="button" className="update-action-btn" onClick={reset}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Silently check the updater endpoint for a newer release. Called from Cockpit
 *  on startup and periodically. It never surfaces anything unless an update is
 *  actually available — at which point the button appears on its own — so a
 *  missing release / offline endpoint never nags. */
export async function checkForUpdate(): Promise<void> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update) {
      setPendingUpdate(update);
      useUpdateStore.getState().setAvailable(update.version, update.body ?? null);
    }
  } catch (e) {
    console.warn("[updater] check failed:", e instanceof Error ? e.message : String(e));
  }
}
