import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitBranch,
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  ArrowUp,
  ArrowDown,
  Download,
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  Plus,
  Loader2,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import {
  useGit,
  type GitFileEntry,
  type GitBranches,
  type GitStatus,
  type ActionResult,
} from "../../hooks/useGit";
import { useProfileStore } from "../../state/profileStore";
import { computeGraph, type GraphRow } from "./graph";

/** A provider usable for AI commit messages (mirrors Rust `CommitProvider`). */
interface CommitProvider {
  id: string;
  label: string;
  model: string;
  hasToken: boolean;
}

type ActionKind = "fetch" | "pull" | "push" | "commit" | "branch" | null;

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

/** Branch switcher + new-branch input, shown as a popover under the branch
 *  chip. Selecting a branch checks it out; the input creates and switches. */
function BranchMenu({
  branches,
  busy,
  onCheckout,
  onCreate,
  onClose,
}: {
  branches: GitBranches;
  busy: boolean;
  onCheckout: (name: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if ((e.target as Element).closest(".git-branch-chip")) return;
      onClose();
    };
    const id = window.setTimeout(() => window.addEventListener("mousedown", handler), 0);
    return () => { window.clearTimeout(id); window.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const submit = () => {
    const n = name.trim();
    if (n) onCreate(n);
  };

  return (
    <div className="git-branch-menu" ref={ref} role="menu">
      <div className="git-branch-list">
        {branches.locals.length === 0 ? (
          <div className="git-empty-sm">No local branches.</div>
        ) : (
          branches.locals.map((b) => (
            <button
              key={b}
              type="button"
              className={`git-branch-item${b === branches.current ? " current" : ""}`}
              disabled={busy || b === branches.current}
              onClick={() => onCheckout(b)}
            >
              <Check size={12} strokeWidth={2.2} className="git-branch-tick" />
              <span className="git-branch-name">{b}</span>
            </button>
          ))
        )}
      </div>
      <div className="git-branch-new">
        <Plus size={12} strokeWidth={2.2} />
        <input
          className="git-branch-input"
          placeholder="new branch…"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
        />
      </div>
    </div>
  );
}

/** One-row action toolbar: branch switcher, Fetch / Pull / Push, and the AI
 *  Commit split-button (button + model dropdown). A single inline status line
 *  under the bar reports the last action's result. */
function GitActions({
  git,
  isRepo,
  branch,
}: {
  git: ReturnType<typeof useGit>;
  isRepo: boolean;
  branch: string;
}) {
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const [providers, setProviders] = useState<CommitProvider[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  // Load providers that can generate a commit message; default the dropdown to
  // the active persona's base_model provider when it's one of them.
  useEffect(() => {
    if (!isRepo) return;
    let alive = true;
    void invoke<{ id: string; label: string; model: string; hasToken: boolean }[]>(
      "ai_commit_providers",
    )
      .then((list) => {
        if (!alive) return;
        setProviders(list);
        setModelId((cur) => {
          if (cur && list.some((p) => p.id === cur)) return cur;
          const persona = list.find((p) => p.id === activeProfileId);
          return persona?.id ?? list[0]?.id ?? null;
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isRepo, activeProfileId]);

  // Close the model dropdown on outside click.
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current?.contains(e.target as Node)) return;
      setModelOpen(false);
    };
    const id = window.setTimeout(() => window.addEventListener("mousedown", handler), 0);
    return () => { window.clearTimeout(id); window.removeEventListener("mousedown", handler); };
  }, [modelOpen]);

  const flash = useCallback((r: ActionResult) => {
    setNote({ ok: r.ok, text: r.message });
  }, []);

  // Auto-dismiss a success note; keep errors until the next action.
  useEffect(() => {
    if (!note?.ok) return;
    const id = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(id);
  }, [note]);

  const runAction = useCallback(
    async (kind: Exclude<ActionKind, null>, fn: () => Promise<ActionResult>) => {
      if (busy) return;
      setBusy(kind);
      setNote(null);
      try {
        flash(await fn());
      } finally {
        setBusy(null);
      }
    },
    [busy, flash],
  );

  if (!isRepo) {
    return (
      <div className="git-actions-bar">
        <button
          type="button"
          className="git-action-init"
          disabled={busy === "branch"}
          onClick={() => void runAction("branch", () => git.init())}
        >
          {busy === "branch" ? <Loader2 size={13} className="spin" /> : <GitBranch size={13} strokeWidth={1.9} />}
          Initialize repository
        </button>
        {note && (
          <div className={`git-action-status${note.ok ? " ok" : " err"}`}>{note.text}</div>
        )}
      </div>
    );
  }

  const selected = providers.find((p) => p.id === modelId) ?? null;
  const canCommit = !!selected && busy === null;

  return (
    <div className="git-actions-bar">
      <div className="git-actions-row">
        {/* Branch switcher */}
        <div className="git-branch-wrap">
          <button
            type="button"
            className="git-branch-chip"
            onClick={() => setBranchOpen((v) => !v)}
            title="Switch or create branch"
          >
            <GitBranch size={12} strokeWidth={1.9} />
            <span className="git-branch-cur">{branch || "branch"}</span>
            <ChevronDown size={11} strokeWidth={2} />
          </button>
          {branchOpen && (
            <BranchMenu
              branches={git.branches}
              busy={busy === "branch"}
              onCheckout={(n) => {
                setBranchOpen(false);
                void runAction("branch", () => git.checkout(n));
              }}
              onCreate={(n) => {
                setBranchOpen(false);
                void runAction("branch", () => git.createBranch(n));
              }}
              onClose={() => setBranchOpen(false)}
            />
          )}
        </div>

        <div className="git-actions-spacer" />

        {/* Fetch / Pull / Push */}
        <button
          type="button"
          className="git-overlay-btn"
          disabled={busy !== null}
          onClick={() => void runAction("fetch", () => git.fetch())}
          title="Fetch --all --prune"
          aria-label="Fetch"
        >
          {busy === "fetch" ? <Loader2 size={13} className="spin" /> : <Download size={13} strokeWidth={1.9} />}
        </button>
        <button
          type="button"
          className="git-overlay-btn"
          disabled={busy !== null}
          onClick={() => void runAction("pull", () => git.pull())}
          title="Pull --ff-only"
          aria-label="Pull"
        >
          {busy === "pull" ? <Loader2 size={13} className="spin" /> : <ArrowDownToLine size={13} strokeWidth={1.9} />}
        </button>
        <button
          type="button"
          className="git-overlay-btn"
          disabled={busy !== null}
          onClick={() => void runAction("push", () => git.push())}
          title="Push"
          aria-label="Push"
        >
          {busy === "push" ? <Loader2 size={13} className="spin" /> : <ArrowUpToLine size={13} strokeWidth={1.9} />}
        </button>

        <div className="git-actions-spacer" />

        {/* AI Commit split-button */}
        <div className="git-commit-split" ref={modelRef}>
          <button
            type="button"
            className="git-commit-btn"
            disabled={!canCommit}
            onClick={() => modelId && void runAction("commit", () => git.commit(modelId))}
            title={selected ? `Commit — summarize with ${selected.label}` : "Configure a base-model provider to enable AI commit"}
          >
            {busy === "commit" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} strokeWidth={1.9} />}
            Commit
          </button>
          <button
            type="button"
            className="git-commit-model"
            disabled={busy !== null || providers.length === 0}
            onClick={() => setModelOpen((v) => !v)}
            title={selected ? selected.label : "Choose model"}
          >
            <ChevronDown size={12} strokeWidth={2} />
          </button>
          {modelOpen && (
            <div className="git-model-menu" role="menu">
              {providers.length === 0 ? (
                <div className="git-empty-sm">No provider configured.</div>
              ) : (
                providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`git-model-item${p.id === modelId ? " current" : ""}`}
                    onClick={() => { setModelId(p.id); setModelOpen(false); }}
                  >
                    <Check size={12} strokeWidth={2.2} className="git-model-tick" />
                    <span className="git-model-label">{p.label}</span>
                    <span className="git-model-name">{p.model}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {note && (
        <div className={`git-action-status${note.ok ? " ok" : " err"}`} title={note.text}>
          {note.text}
        </div>
      )}
    </div>
  );
}

/** The Git panel's content — action bar + working-tree status + history graph.
 *  Chrome-free so it can live inside the floating overlay OR as a sidebar tab.
 *  `active` gates polling (see [`useGit`]); the optional `onRefresh` lets a host
 *  header wire a refresh button to the same `useGit` instance. */
export function GitPanelBody({
  active,
  onState,
}: {
  active: boolean;
  /** Reports {status, loading, refresh} up to a host that renders its own header
   *  (the floating overlay). Sidebar embedding can ignore it. */
  onState?: (s: { status: GitStatus | null; loading: boolean; refresh: () => void }) => void;
}) {
  const git = useGit(active);
  const { status, commits, error, refresh, loadCommitFiles } = git;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, GitFileEntry[] | "loading">>({});

  useEffect(() => {
    onState?.({ status, loading: git.loading, refresh });
  }, [status, git.loading, refresh, onState]);

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
    <>
      {status && !error && (
        <GitActions git={git} isRepo={status.isRepo} branch={status.branch} />
      )}

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
    </>
  );
}

/** Floating Git panel: overlay chrome (branch + ahead/behind header, refresh /
 *  maximize / close) wrapping the shared [`GitPanelBody`]. */
export default function GitPanel({ open, maximized, onToggleMax, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [hdr, setHdr] = useState<{ status: GitStatus | null; loading: boolean; refresh: () => void }>({
    status: null,
    loading: false,
    refresh: () => {},
  });
  const status = hdr.status;

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
            className={`git-overlay-btn${hdr.loading ? " spinning" : ""}`}
            onClick={() => hdr.refresh()}
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

      <GitPanelBody active={open} onState={setHdr} />
    </div>
  );
}
