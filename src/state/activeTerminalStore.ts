import { create } from "zustand";
import { useDirectoryStore } from "./directoryStore";

/** Writes text to the currently-active terminal pane. `submit` true runs the
 *  line; false just inserts it (leaving the user to edit/submit). */
type Sink = (cmd: string, submit: boolean) => void;

/** Bridge between the terminal view (which owns the active pane handle) and the
 *  toolbar / sidebar (siblings that need to drive it). `ClaudeTerminalView`
 *  registers a sink pointing at its active pane; the toolbar and sidebar call
 *  `write`/`insertPath`/`changeDir` without needing the handle map. */
interface ActiveTerminalState {
  sink: Sink | null;
  setSink: (fn: Sink | null) => void;
  /** Run or insert a command into the active terminal (no-op if none). */
  write: (cmd: string, submit: boolean) => void;
  /** Insert a filesystem path (quoted if it has spaces) into the active line. */
  insertPath: (absPath: string) => void;
  /** Set the working directory: update the global store AND move the running CLI
   *  there via `/cd`, so terminal, toolbar, and Git panel target the same dir
   *  (the store alone only affects the next spawn). */
  changeDir: (dir: string) => void;
}

export const useActiveTerminalStore = create<ActiveTerminalState>((set, get) => ({
  sink: null,
  setSink: (fn) => set({ sink: fn }),
  write: (cmd, submit) => get().sink?.(cmd, submit),
  insertPath: (absPath) => {
    const p = absPath.replace(/\\/g, "/");
    get().sink?.(/\s/.test(p) ? `"${p}"` : p, false);
  },
  changeDir: (dir) => {
    useDirectoryStore.getState().setCwd(dir);
    const p = dir.replace(/\\/g, "/");
    get().sink?.(/\s/.test(p) ? `/cd "${p}"` : `/cd ${p}`, true);
  },
}));
