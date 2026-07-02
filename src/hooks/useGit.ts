import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDirectoryStore } from "../state/directoryStore";

export interface GitFileEntry {
  path: string;
  status: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
}

export interface GitCommit {
  hash: string;
  short: string;
  parents: string[];
  author: string;
  timestamp: number;
  subject: string;
  refs: string[];
}

export interface GitBranches {
  current: string;
  locals: string[];
}

/** Uniform result for a write action, so the panel can show one inline line
 *  ("Pushed" / git's own error) without each caller reshaping errors. `message`
 *  carries a success detail (e.g. the generated commit subject) or the failure. */
export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Extract a human string from a rejected Tauri command (git commands reject
 *  with `{kind, message}`; ai_commit rejects with a plain string). */
function errText(e: unknown): string {
  const err = e as { kind?: string; message?: string } | string;
  if (typeof err === "string") return err;
  return err?.message ?? "operation failed";
}

/** How often to re-poll while the panel is open. We can't observe when the
 *  embedded CLI runs a git command, so a light poll keeps the view fresh; git
 *  status/log are sub-10ms on normal repos. */
const POLL_MS = 4000;

/** Loads working-tree status + recent history for the active directory and
 *  keeps them fresh while `active`. Refreshes on cwd change, window focus, a
 *  light interval, and on demand via `refresh()`. */
export function useGit(active: boolean) {
  const cwd = useDirectoryStore((s) => s.cwd);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranches>({ current: "", locals: [] });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Serialize refreshes: a slow git call must not let a later result be
  // overwritten by an earlier one, and we skip overlapping polls.
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const st = await invoke<GitStatus>("git_status", { cwd: cwd ?? "" });
      setStatus(st);
      setError(null);
      if (st.isRepo) {
        const log = await invoke<GitCommit[]>("git_log", { cwd: cwd ?? "", limit: 80 });
        setCommits(log);
        try {
          setBranches(await invoke<GitBranches>("git_branches", { cwd: cwd ?? "" }));
        } catch {
          setBranches({ current: st.branch, locals: [] });
        }
      } else {
        setCommits([]);
        setBranches({ current: "", locals: [] });
      }
    } catch (e: unknown) {
      const err = e as { kind?: string; message?: string } | string;
      setError(
        typeof err === "string" ? err : (err?.message ?? "git unavailable"),
      );
      setStatus(null);
      setCommits([]);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [cwd]);

  // Per-commit changed-file lists, cached by hash; cleared when cwd changes so
  // a different repo never serves another's cached files.
  const filesCache = useRef<Map<string, GitFileEntry[]>>(new Map());
  useEffect(() => {
    filesCache.current.clear();
  }, [cwd]);

  const loadCommitFiles = useCallback(
    async (hash: string): Promise<GitFileEntry[]> => {
      const cached = filesCache.current.get(hash);
      if (cached) return cached;
      const files = await invoke<GitFileEntry[]>("git_commit_files", {
        cwd: cwd ?? "",
        hash,
      });
      filesCache.current.set(hash, files);
      return files;
    },
    [cwd],
  );

  // ── Write actions ──────────────────────────────────────────────────────
  // Each runs a backend git command, then refreshes so status/history/branches
  // reflect the result, and returns a uniform {ok, message} for inline display.
  const act = useCallback(
    async (label: string, run: () => Promise<unknown>): Promise<ActionResult> => {
      try {
        await run();
        await refresh();
        return { ok: true, message: label };
      } catch (e) {
        await refresh();
        return { ok: false, message: errText(e) };
      }
    },
    [refresh],
  );

  const dir = () => ({ cwd: cwd ?? "" });

  const fetch = useCallback(
    () => act("Fetched", () => invoke("git_fetch", dir())),
    [act, cwd],
  );
  const pull = useCallback(
    () => act("Pulled", () => invoke("git_pull", dir())),
    [act, cwd],
  );
  const push = useCallback(
    () => act("Pushed", () => invoke("git_push", dir())),
    [act, cwd],
  );
  const init = useCallback(
    () => act("Initialized repository", () => invoke("git_init", dir())),
    [act, cwd],
  );
  const checkout = useCallback(
    (name: string) =>
      act(`Switched to ${name}`, () => invoke("git_checkout", { ...dir(), name })),
    [act, cwd],
  );
  const createBranch = useCallback(
    (name: string) =>
      act(`Created ${name}`, () => invoke("git_create_branch", { ...dir(), name })),
    [act, cwd],
  );

  /** Full AI-commit flow: stage everything → read the staged diff → ask the
   *  chosen provider for a subject → commit it. Any step's failure is returned
   *  inline; a failed generation never commits a fallback message. */
  const commit = useCallback(
    async (providerId: string): Promise<ActionResult> => {
      try {
        await invoke("git_stage_all", dir());
        const diff = await invoke<string>("git_diff_cached", dir());
        if (!diff.trim()) {
          await refresh();
          return { ok: false, message: "Nothing to commit" };
        }
        const message = await invoke<string>("ai_commit_message", {
          providerId,
          diff,
        });
        if (!message.trim()) {
          return { ok: false, message: "Model returned an empty message" };
        }
        await invoke("git_commit", { ...dir(), message });
        await refresh();
        return { ok: true, message };
      } catch (e) {
        await refresh();
        return { ok: false, message: errText(e) };
      }
    },
    [refresh, cwd],
  );

  // Refresh when the panel becomes active or the working directory changes.
  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  // Light poll + refresh on window focus while the panel is open.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, refresh]);

  return {
    status,
    commits,
    branches,
    error,
    loading,
    refresh,
    loadCommitFiles,
    fetch,
    pull,
    push,
    init,
    checkout,
    createBranch,
    commit,
  };
}
