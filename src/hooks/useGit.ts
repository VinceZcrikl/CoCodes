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
      } else {
        setCommits([]);
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

  return { status, commits, error, loading, refresh };
}
