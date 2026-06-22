/** Auto-update button — sits next to the palette dot in the cockpit header.
 *
 *  Invisible while no update is available. Once check() finds a newer version
 *  a small pulsing download icon appears. Clicking opens a popover that lets
 *  the user download and install the update with a live progress bar.
 *
 *  The check is triggered from Cockpit after a 5-second startup delay.
 *  Download + install are handled entirely here via @tauri-apps/plugin-updater. */
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, X } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  useUpdateStore,
  getPendingUpdate,
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

  if (phase === "idle") return null;

  const pct = Math.round(progress * 100);

  return (
    <div className="cockpit-update-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`cockpit-update-btn${phase === "available" ? " cockpit-update-btn--pulse" : ""}${open ? " cockpit-update-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={phase === "available" ? `Update ${version} available` : phase === "downloading" ? `Downloading… ${pct}%` : phase === "ready" ? "Ready to install" : "Update error"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <ArrowDownToLine size={13} strokeWidth={2} />
      </button>

      {open && (
        <div className="update-popover" ref={popoverRef} role="dialog" aria-label="Update available">
          <div className="update-popover-header">
            <span className="update-popover-title">
              {phase === "available" && `CoCodes ${version}`}
              {phase === "downloading" && "Downloading update…"}
              {phase === "ready" && "Ready to install"}
              {phase === "error" && "Update failed"}
            </span>
            <button type="button" className="update-popover-close" onClick={() => setOpen(false)} aria-label="Close">
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

/** Called from Cockpit after a startup delay. Runs once per session. */
export async function checkForUpdate(): Promise<void> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { setPendingUpdate, useUpdateStore: store } = await import("../../state/updateStore");
    const update = await check();
    if (update) {
      setPendingUpdate(update);
      store.getState().setAvailable(update.version, update.body ?? null);
    }
  } catch {
    // Network unavailable or endpoint not configured yet — silently ignore.
  }
}
