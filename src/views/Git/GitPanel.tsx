import { useEffect, useMemo, useRef, useState } from "react";
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
import { computeGraph, type GraphRow } from "./graph";

interface Props {
  open: boolean;
  maximized: boolean;
  onToggleMax: () => void;
  onClose: () => void;
}

/** Graph geometry: lane width and fixed commit-row height (px). The row height
 *  is fixed so each row's SVG aligns with the one above/below into a graph. */
const LANE_W = 14;
const ROW_H = 42;

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

/** Map a porcelain status letter to a tone class. */
function statusTone(code: string): string {
  switch (code) {
    case "A": return "add";
    case "M": return "mod";
    case "D": return "del";
    case "R": return "ren";
    case "C": return "ren";
    case "U": return "conflict";
    default:  return "untracked";
  }
}

function FileRow({ entry }: { entry: GitFileEntry }) {
  return (
    <div className="git-file-row" title={entry.path}>
      <span className={`git-status-badge ${statusTone(entry.status)}`}>{entry.status}</span>
      <span className="git-file-path">{entry.path}</span>
    </div>
  );
}

/** SVG lane graph for one commit row. Diagonals are smoothed with a vertical
 *  cubic so branches/merges curve rather than zig-zag. */
function GraphCell({ row, laneCount }: { row: GraphRow; laneCount: number }) {
  const width = laneCount * LANE_W;
  const cx = (x: number) => x * LANE_W + LANE_W / 2;
  const cy = (y: number) => y * ROW_H;
  return (
    <svg className="git-graph-svg" width={width} height={ROW_H} style={{ flex: `0 0 ${width}px` }}>
      {row.segments.map((s, i) => {
        const x1 = cx(s.x1), y1 = cy(s.y1), x2 = cx(s.x2), y2 = cy(s.y2);
        const ym = (y1 + y2) / 2;
        return (
          <path
            key={i}
            d={`M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${y2}`}
            fill="none"
            stroke={s.color}
            strokeWidth={1.6}
          />
        );
      })}
      <circle
        cx={cx(row.col)}
        cy={ROW_H / 2}
        r={3.6}
        fill={row.merge ? "var(--panel)" : row.color}
        stroke={row.color}
        strokeWidth={row.merge ? 2 : 0}
      />
    </svg>
  );
}

/** Floating, read-only Git inspector: branch + ahead/behind, working-tree
 *  status groups, and a multi-lane commit graph whose rows expand to show the
 *  files each commit changed. Writes stay the embedded CLI's job. */
export default function GitPanel({ open, maximized, onToggleMax, onClose }: Props) {
  const { status, commits, error, loading, refresh, loadCommitFiles } = useGit(open);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, GitFileEntry[] | "loading">>({});
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if ((e.target as Element).closest('[data-panel-toggle="git"]')) return;
      onClose();
    };
    const id = window.setTimeout(() => window.addEventListener("mousedown", handler), 0);
    return () => { window.clearTimeout(id); window.removeEventListener("mousedown", handler); };
  }, [open, onClose]);

  const graph = useMemo(() => computeGraph(commits), [commits]);

  const toggleCommit = (hash: string) => {
    if (expanded === hash) {
      setExpanded(null);
      return;
    }
    setExpanded(hash);
    if (!files[hash]) {
      setFiles((p) => ({ ...p, [hash]: "loading" }));
      void loadCommitFiles(hash)
        .then((f) => setFiles((p) => ({ ...p, [hash]: f })))
        .catch(() => setFiles((p) => ({ ...p, [hash]: [] })));
    }
  };

  const dirty =
    status &&
    (status.staged.length + status.unstaged.length + status.untracked.length) > 0;

  return (
    <div
      ref={panelRef}
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

            {/* ── History (multi-lane graph) ── */}
            <section className="git-section git-history">
              <div className="git-section-head">History</div>
              {commits.length === 0 ? (
                <div className="git-empty git-empty-sm">No commits yet.</div>
              ) : (
                commits.map((c, i) => {
                  const isOpen = expanded === c.hash;
                  const f = files[c.hash];
                  return (
                    <div className="git-commit" key={c.hash}>
                      <div
                        className={`git-commit-row${isOpen ? " expanded" : ""}`}
                        style={{ height: ROW_H }}
                        onClick={() => toggleCommit(c.hash)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleCommit(c.hash);
                          }
                        }}
                        title={c.subject}
                      >
                        <GraphCell row={graph.rows[i]} laneCount={graph.laneCount} />
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
                      {isOpen && (
                        <div
                          className="git-commit-files"
                          style={{ paddingLeft: graph.laneCount * LANE_W + 14 }}
                        >
                          {f === "loading" || f === undefined ? (
                            <div className="git-empty-sm">Loading…</div>
                          ) : f.length === 0 ? (
                            <div className="git-empty-sm">No file changes.</div>
                          ) : (
                            f.map((file) => <FileRow key={file.path} entry={file} />)
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
