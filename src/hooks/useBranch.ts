import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDirectoryStore } from "../state/directoryStore";

interface BranchInfo {
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
}

/** Lightweight always-on branch reader for the toolbar status strip.
 *
 *  Unlike `useGit` (which only polls while the Git panel is open and also pulls
 *  the full log), this just reads `git_status` for the current cwd on a slow
 *  interval and on window focus, so the toolbar can always show the current
 *  branch + dirty/ahead/behind glance without opening the panel. Returns null
 *  when the cwd isn't a git repo or git is unavailable. */
const POLL_MS = 8000;

export function useBranch(): BranchInfo | null {
  const cwd = useDirectoryStore((s) => s.cwd);
  const [info, setInfo] = useState<BranchInfo | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const st = await invoke<{
          isRepo: boolean;
          branch: string;
          ahead: number;
          behind: number;
          staged: unknown[];
          unstaged: unknown[];
          untracked: unknown[];
        }>("git_status", { cwd: cwd ?? "" });
        if (cancelled) return;
        if (st.isRepo && st.branch) {
          setInfo({
            branch: st.branch,
            ahead: st.ahead,
            behind: st.behind,
            dirty:
              st.staged.length + st.unstaged.length + st.untracked.length > 0,
          });
        } else {
          setInfo(null);
        }
      } catch {
        if (!cancelled) setInfo(null);
      } finally {
        inFlight.current = false;
      }
    };

    void read();
    const id = window.setInterval(() => void read(), POLL_MS);
    const onFocus = () => void read();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [cwd]);

  return info;
}
