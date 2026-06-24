/** Update button — sits next to the palette dot in the cockpit header.
 *
 *  Always visible: in the `idle` state it's a subtle "Check for updates" refresh
 *  button. Clicking it runs an on-demand check; if a newer version is found the
 *  icon turns gold and pulses and a popover offers Download & Install with a
 *  live progress bar; if not, it briefly reports "up to date".
 *
 *  A silent check also runs automatically from Cockpit ~5s after startup.
 *  Download + install are handled here via @tauri-apps/plugin-updater. */
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, RefreshCw, X } from "lucide-react";
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

  // Transient states (idle/checking/uptodate/error) revert to idle when the
  // popover closes, so the button settles back to its neutral resting look.
  const close = () => {
    setOpen(false);
    if (phase === "uptodate" || phase === "error") reset();
  };

  // After reporting "up to date", quietly settle back to idle.
  useEffect(() => {
    if (phase !== "uptodate") return;
    const t = window.setTimeout(() => {
      if (!open) reset();
    }, 6000);
    return () => window.clearTimeout(t);
  }, [phase, open, reset]);

  const onButton = () => {
    // Idle / up-to-date / error → run a fresh check; otherwise toggle popover.
    if (phase === "idle" || phase === "uptodate" || phase === "error") {
      setOpen(true);
      void checkForUpdate(true);
    } else {
      setOpen((v) => !v);
    }
  };

  const pct = Math.round(progress * 100);
  const hasUpdate = phase === "available" || phase === "downloading" || phase === "ready";
  const Icon = hasUpdate ? ArrowDownToLine : phase === "uptodate" ? Check : RefreshCw;
  const title =
    phase === "available" ? `Update ${version} available`
    : phase === "downloading" ? `Downloading… ${pct}%`
    : phase === "ready" ? "Ready to install"
    : phase === "checking" ? "Checking for updates…"
    : phase === "uptodate" ? "You're up to date"
    : phase === "error" ? "Update check failed"
    : "Check for updates";

  return (
    <div className="cockpit-update-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={
          "cockpit-update-btn" +
          (hasUpdate ? "" : " cockpit-update-btn--idle") +
          (phase === "available" ? " cockpit-update-btn--pulse" : "") +
          (phase === "checking" ? " cockpit-update-btn--spin" : "") +
          (open ? " cockpit-update-btn--open" : "")
        }
        onClick={onButton}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Icon size={13} strokeWidth={2} />
      </button>

      {open && (
        <div className="update-popover" ref={popoverRef} role="dialog" aria-label="Software update">
          <div className="update-popover-header">
            <span className="update-popover-title">
              {phase === "checking" && "Checking for updates…"}
              {phase === "uptodate" && "You're up to date"}
              {phase === "available" && `CoCodes ${version}`}
              {phase === "downloading" && "Downloading update…"}
              {phase === "ready" && "Ready to install"}
              {phase === "error" && "Update check failed"}
              {phase === "idle" && "Check for updates"}
            </span>
            <button type="button" className="update-popover-close" onClick={close} aria-label="Close">
              <X size={13} strokeWidth={2} />
            </button>
          </div>

          {phase === "uptodate" && (
            <p className="update-popover-notes">No updates available right now.</p>
          )}

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
            {phase === "checking" && (
              <span className="update-pct-label">Checking…</span>
            )}
            {phase === "uptodate" && (
              <button type="button" className="update-action-btn" onClick={() => void checkForUpdate(true)}>
                Check again
              </button>
            )}
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
              <button type="button" className="update-action-btn" onClick={() => void checkForUpdate(true)}>
                Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Check the updater endpoint for a newer release.
 *
 *  `manual` (a user clicking the button) surfaces the outcome: a spinner while
 *  checking, then "up to date" or an error if the check fails. The automatic
 *  startup check (`manual = false`) stays silent — it only reveals itself when
 *  an update is actually available, so a missing release / offline endpoint
 *  never nags on launch. */
export async function checkForUpdate(manual = false): Promise<void> {
  const store = useUpdateStore.getState();
  if (manual) store.setPhase("checking");
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update) {
      setPendingUpdate(update);
      useUpdateStore.getState().setAvailable(update.version, update.body ?? null);
    } else if (manual) {
      useUpdateStore.getState().setPhase("uptodate");
    } else if (useUpdateStore.getState().phase === "checking") {
      useUpdateStore.getState().setPhase("idle");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[updater] check failed:", msg);
    if (!manual) {
      if (useUpdateStore.getState().phase === "checking") useUpdateStore.getState().setPhase("idle");
      return;
    }
    // A missing or unreachable update manifest (no release published yet, or
    // offline) just means "nothing to update to" — present it gently as "up to
    // date" rather than a hard error. Genuinely unexpected failures still surface.
    if (/valid release json|not found|404|fetch|network|connect|timed?\s?out|dns/i.test(msg)) {
      useUpdateStore.getState().setPhase("uptodate");
    } else {
      useUpdateStore.getState().setError(msg);
    }
  }
}
