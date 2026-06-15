import {
  GitBranch,
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useGit, type GitFileEntry } from "../../hooks/useGit";

interface Props {
  open: boolean;
  maximized: boolean;
  onToggleMax: () => void;
  onClose: () => void;
}

/** Relative "2m / 3h / 4d / 5w" from a unix-seconds timestamp. */
function relativeTime(ts: number): string {
  if (!ts) return "";
  const secs = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w`;
  const mos = Math.floor(days / 30);
  if (mos < 12) return `${mos}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** Map a porcelain status letter to a tone class + label. */
function statusTone(code: string): string {
  switch (code) {
    case "A": return "add";
    case "M": return "mod";
    case "D": return "del";
    case "R": return "ren";
    case "C": return "ren";
    case "U": return "conflict";
    default:  return "untracked"; // "?" and anything else
  }
}

function FileRow({ entry }: { entry: GitFileEntry }) {
  return (
    <div className="git-file-row" title={entry.path}>
      <span className={`git-status-badge ${statusTone(entry.status)}`}>
        {entry.status}
      </span>
      <span className="git-file-path">{entry.path}</span>
    </div>
  );
}

/** Floating, read-only Git inspector: branch + ahead/behind, working-tree
 *  status groups, and recent commit history with single-lane graph nodes. Hovers
 *  over the active panel; writes stay the embedded CLI's job. */
export default function GitPanel({ open, maximized, onToggleMax, onClose }: Props) {
  const { status, commits, error, loading, refresh } = useGit(open);

  const dirty =
    status &&
    (status.staged.length + status.unstaged.length + status.untracked.length) > 0;

  return (
    <div
      className={`git-overlay${maximized ? " max" : ""}`}
      style={{ display: open ? "flex" : "none" }}
      role="dialog"
      aria-label="Git"
    >
      <header className="git-overlay-bar">
        <span className="git-overlay-title">
          <GitBranch size={13} strokeWidth={1.9} />
          <span>{status?.isRepo ? status.branch || "Git" : "Git"}</span>
          {status?.isRepo && (status.ahead > 0 || status.behind > 0) && (
            <span className="git-ab">
              {status.ahead > 0 && (
                <span className="git-ab-up"><ArrowUp size={10} strokeWidth={2.4} />{status.ahead}</span>
              )}
              {status.behind > 0 && (
                <span className="git-ab-down"><ArrowDown size={10} strokeWidth={2.4} />{status.behind}</span>
              )}
            </span>
          )}
        </span>
        <div className="git-overlay-actions">
          <button
            type="button"
            className={`git-overlay-btn${loading ? " spinning" : ""}`}
            onClick={() => void refresh()}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={13} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="git-overlay-btn"
            onClick={onToggleMax}
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? <Minimize2 size={13} strokeWidth={1.9} /> : <Maximize2 size={13} strokeWidth={1.9} />}
          </button>
          <button
            type="button"
            className="git-overlay-btn git-overlay-close"
            onClick={onClose}
            title="Close"
            aria-label="Close Git"
          >
            <X size={14} strokeWidth={1.9} />
          </button>
        </div>
      </header>

      <div className="git-overlay-body">
        {error ? (
          <div className="git-empty">{error}</div>
        ) : status && !status.isRepo ? (
          <div className="git-empty">Not a git repository.</div>
        ) : !status ? (
          <div className="git-empty">Loading…</div>
        ) : (
          <>
            {/* ── Working-tree status ── */}
            {dirty ? (
              <>
                {status.staged.length > 0 && (
                  <section className="git-section">
                    <div className="git-section-head">Staged · {status.staged.length}</div>
                    {status.staged.map((f) => <FileRow key={`s:${f.path}`} entry={f} />)}
                  </section>
                )}
                {status.unstaged.length > 0 && (
                  <section className="git-section">
                    <div className="git-section-head">Changed · {status.unstaged.length}</div>
                    {status.unstaged.map((f) => <FileRow key={`u:${f.path}`} entry={f} />)}
                  </section>
                )}
                {status.untracked.length > 0 && (
                  <section className="git-section">
                    <div className="git-section-head">Untracked · {status.untracked.length}</div>
                    {status.untracked.map((f) => <FileRow key={`n:${f.path}`} entry={f} />)}
                  </section>
                )}
              </>
            ) : (
              <div className="git-clean">Working tree clean</div>
            )}

            {/* ── History ── */}
            <section className="git-section git-history">
              <div className="git-section-head">History</div>
              {commits.length === 0 ? (
                <div className="git-empty git-empty-sm">No commits yet.</div>
              ) : (
                commits.map((c, i) => (
                  <div className="git-commit-row" key={c.hash} title={c.subject}>
                    <span className="git-graph">
                      <span className={`git-node${c.parents.length > 1 ? " merge" : ""}`} />
                      {i < commits.length - 1 && <span className="git-graph-line" />}
                    </span>
                    <span className="git-commit-main">
                      <span className="git-commit-top">
                        <span className="git-hash">{c.short}</span>
                        <span className="git-subject">{c.subject}</span>
                      </span>
                      <span className="git-commit-meta">
                        {c.refs.map((r) => (
                          <span key={r} className="git-ref-chip">{r}</span>
                        ))}
                        <span className="git-author">{c.author}</span>
                        <span className="git-dot">·</span>
                        <span className="git-time">{relativeTime(c.timestamp)}</span>
                      </span>
                    </span>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
