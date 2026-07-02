import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDirectoryStore } from "../state/directoryStore";

/** A leaf in the split layout: one terminal pane running its own CLI session.
 *  `convId` is the Claude conversation UUID handed to `--session-id`, so every
 *  pane is an independent, resumable chat. */
export interface PaneNode {
  type: "pane";
  /** Layout-local identity: React key + handle-registry key. Distinct from
   *  `convId` so "respawn this pane fresh" never needs a new layout slot. */
  paneId: string;
  /** Claude conversation UUID for this pane (`--session-id`). */
  convId: string;
  /** Which CLI binary this pane runs ("claude" | "codex" | "grok"). Panes in
   *  one session can run different CLIs. */
  cli: string;
  /** User-set custom header title. Absent → the header shows the CLI name. */
  title?: string;
  /** True once the PTY has spawned this pane at least once. Per-pane (not
   *  per-session) so restoration resumes each conversation idempotently. */
  started: boolean;
  /** Working directory for the spawned process; inherits the parent pane on
   *  split, defaults to the directory store. null/absent → home dir. */
  cwd?: string | null;
  /** Per-pane persona override. When set, this pane uses a different profile
   *  than the session-level profileId — set by dragging an avatar onto the pane. */
  profileId?: string;
  /** Set by fork-split: on the FIRST spawn only, the PTY opens with this
   *  session ID (to load the forked conversation history). After the first
   *  spawn `started` becomes true and subsequent restarts use `convId`.
   *  This field is never the same as `convId`, avoiding the "already in use"
   *  conflict that arises when two panes share the same `--session-id`. */
  forkFromConvId?: string;
  /** Per-pane colour override — a base panel-palette name. Absent → follow the
   *  global palette. Set from the pane header's palette button. */
  palette?: string;
  /** Per-pane accent override (an AccentName). Absent → follow global. */
  accent?: string;
}

/** An internal split: two children divided horizontally or vertically. */
export interface SplitNode {
  type: "split";
  /** "row" = side by side (vertical divider); "col" = stacked (horizontal). */
  dir: "row" | "col";
  /** First child's fraction of the split (0..1). A single ratio can't desync
   *  the way a two-element sizes array can. */
  ratio: number;
  /** Stable id so divider drags can target this split node. */
  splitId: string;
  children: [LayoutNode, LayoutNode];
}

export type LayoutNode = PaneNode | SplitNode;

/** One independent Claude terminal conversation. `id` is the claude session
 *  UUID passed as `--session-id` / `--resume`, so each entry is a distinct,
 *  resumable claude chat. */
export interface ClaudeSession {
  id: string;
  title: string;
  createdAt: number;
  /** Last time this session was opened/used — drives the sidebar timestamp. */
  updatedAt: number;
  /** True once the PTY has spawned this session at least once, so the next
   *  open resumes (`--resume`) rather than re-creating (`--session-id`). */
  started: boolean;
  pinned: boolean;
  /** Group membership, or null for the ungrouped section. */
  groupId: string | null;
  /** Split layout tree. Absent for unsplit sessions — the view lazily renders
   *  a single default pane bound to `id`, so legacy sessions never grow a
   *  persisted layout until the user actually splits. */
  layout?: LayoutNode;
  /** Working directory the default (unsplit) pane was actually spawned in,
   *  recorded on first start. Claude Code stores each conversation under its
   *  cwd's project dir, so `--resume` MUST run from the same directory — pinning
   *  it here keeps restore working even after the global cwd later changes.
   *  null = home dir; undefined = legacy session started before this was tracked
   *  (falls back to the current directory). Mirrors `PaneNode.cwd` for splits. */
  cwd?: string | null;
}

/** A user-created session group (folder) in the sidebar. */
export interface ClaudeGroup {
  id: string;
  name: string;
  createdAt: number;
}

interface Store {
  sessions: ClaudeSession[];
  groups: ClaudeGroup[];
}

// Legacy localStorage key — read only, to migrate older installs into the
// backend store under ~/.cocodes. New writes never touch localStorage.
const LEGACY_KEY = (profileId: string, cli = "claude") =>
  `cocodes.${cli}.sessions.${profileId}`;

function normalize(parsed: unknown): Store {
  // Back-compat: the original schema persisted a bare ClaudeSession[].
  if (Array.isArray(parsed)) {
    return { sessions: parsed.map(migrate), groups: [] };
  }
  const obj = (parsed ?? {}) as Partial<Store>;
  return {
    sessions: Array.isArray(obj.sessions) ? obj.sessions.map(migrate) : [],
    groups: Array.isArray(obj.groups) ? obj.groups : [],
  };
}

/** Read the legacy localStorage store for this persona+CLI (empty if absent). */
function loadLegacy(profileId: string, cli = "claude"): Store {
  try {
    const raw = localStorage.getItem(LEGACY_KEY(profileId, cli));
    return raw ? normalize(JSON.parse(raw) as unknown) : { sessions: [], groups: [] };
  } catch {
    return { sessions: [], groups: [] };
  }
}

/** Load the session store from the backend (`~/.cocodes/sessions/...`). On the
 *  first read for an install that predates the backend store, fall back to the
 *  legacy localStorage copy and migrate it to disk so it's durable thereafter. */
async function loadStore(profileId: string, cli = "claude"): Promise<Store> {
  try {
    const fromFs = await invoke<Store | null>("sessions_load", { profileId, cli });
    if (fromFs && (Array.isArray(fromFs.sessions) || Array.isArray(fromFs.groups))) {
      return normalize(fromFs);
    }
  } catch (e) {
    console.error("sessions_load failed", e);
  }
  const legacy = loadLegacy(profileId, cli);
  if (legacy.sessions.length || legacy.groups.length) {
    // Migrate the legacy blob to the backend (fire-and-forget).
    void invoke("sessions_save", { profileId, cli, store: legacy }).catch(() => {});
  }
  return legacy;
}

/** Persist the session store to the backend. */
async function saveStore(profileId: string, cli: string, store: Store): Promise<void> {
  try {
    await invoke("sessions_save", { profileId, cli, store });
  } catch (e) {
    console.error("sessions_save failed", e);
  }
}

/** Fill defaults for sessions persisted under an older schema. */
function migrate(s: Partial<ClaudeSession> & { id: string; title: string }): ClaudeSession {
  return {
    id: s.id,
    title: s.title,
    createdAt: s.createdAt ?? Date.now(),
    updatedAt: s.updatedAt ?? s.createdAt ?? Date.now(),
    started: s.started ?? false,
    pinned: s.pinned ?? false,
    groupId: s.groupId ?? null,
    // Pass the layout through untouched when present; unsplit sessions keep it
    // undefined so the view synthesizes a default single pane at render time.
    layout: s.layout,
    // Preserve the recorded spawn cwd (undefined for sessions predating it).
    cwd: s.cwd,
  };
}

/** Build the default single-pane layout for a session that has never split.
 *  Synthesized lazily by callers (not baked into `migrate`) so legacy sessions
 *  keep an unchanged localStorage blob until the user actually splits. */
export function defaultLayout(session: ClaudeSession, cli: string): PaneNode {
  return {
    type: "pane",
    paneId: session.id,
    convId: session.id,
    cli,
    started: session.started,
    // Resume from the directory the session was actually born in, not the
    // current global cwd — otherwise `--resume` runs in the wrong project dir
    // and Claude can't find the conversation.
    cwd: session.cwd,
  };
}

/** Walk every pane leaf in a layout tree. */
export function forEachPane(node: LayoutNode, fn: (p: PaneNode) => void) {
  if (node.type === "pane") {
    fn(node);
  } else {
    forEachPane(node.children[0], fn);
    forEachPane(node.children[1], fn);
  }
}

/** Find the pane leaf with `paneId`, or null. */
export function findPane(node: LayoutNode, paneId: string): PaneNode | null {
  if (node.type === "pane") return node.paneId === paneId ? node : null;
  return findPane(node.children[0], paneId) ?? findPane(node.children[1], paneId);
}

/** Replace the pane `paneId` with a split holding the original pane plus a new
 *  sibling pane. Returns the same node if `paneId` isn't found. */
function splitNode(
  node: LayoutNode,
  paneId: string,
  dir: "row" | "col",
  fresh: PaneNode,
): LayoutNode {
  if (node.type === "pane") {
    if (node.paneId !== paneId) return node;
    return {
      type: "split",
      dir,
      ratio: 0.5,
      splitId: newId(),
      children: [node, fresh],
    };
  }
  return {
    ...node,
    children: [
      splitNode(node.children[0], paneId, dir, fresh),
      splitNode(node.children[1], paneId, dir, fresh),
    ],
  };
}

/** Remove the pane `paneId`, hoisting its surviving sibling up to replace the
 *  parent split. Returns null if the whole tree collapsed (last pane closed),
 *  or the unchanged node if `paneId` wasn't found. */
function closeNode(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.type === "pane") {
    return node.paneId === paneId ? null : node;
  }
  const left = closeNode(node.children[0], paneId);
  const right = closeNode(node.children[1], paneId);
  if (left === null) return right;
  if (right === null) return left;
  return { ...node, children: [left, right] };
}

/** Set the divider ratio on the split `splitId` (clamped to a sane range so a
 *  pane can never be dragged to zero width). */
function setRatio(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.type === "pane") return node;
  if (node.splitId === splitId) {
    return { ...node, ratio: Math.min(0.9, Math.max(0.1, ratio)) };
  }
  return {
    ...node,
    children: [
      setRatio(node.children[0], splitId, ratio),
      setRatio(node.children[1], splitId, ratio),
    ],
  };
}

/** Reassign the pane `paneId` to a new profile + CLI, issuing a fresh convId
 *  so ClaudeTerminal's effect sees a changed dep and respawns the PTY. */
function reassignPaneNode(
  node: LayoutNode,
  paneId: string,
  profileId: string,
  cli: string,
): LayoutNode {
  if (node.type === "pane") {
    if (node.paneId !== paneId) return node;
    return { ...node, cli, profileId, convId: newId(), started: false };
  }
  return {
    ...node,
    children: [
      reassignPaneNode(node.children[0], paneId, profileId, cli),
      reassignPaneNode(node.children[1], paneId, profileId, cli),
    ],
  };
}

/** Flip `started` on the pane `paneId` once its PTY has spawned, recording the
 *  directory it spawned in so a later `--resume` runs from the same project dir. */
function markStartedNode(node: LayoutNode, paneId: string, cwd: string | null): LayoutNode {
  if (node.type === "pane") {
    return node.paneId === paneId && !node.started
      ? { ...node, started: true, cwd }
      : node;
  }
  return {
    ...node,
    children: [
      markStartedNode(node.children[0], paneId, cwd),
      markStartedNode(node.children[1], paneId, cwd),
    ],
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

/** Per-profile, per-CLI store of terminal sessions + groups, persisted by the
 *  backend under `~/.cocodes/sessions/<cli>/<profileId>.json`. Supports rename,
 *  pin, grouping and "history" (the list). `cli` defaults to "claude" so existing
 *  call-sites work without changes. Loads asynchronously — read `loading` to
 *  avoid acting on an empty store before the file has been read. */
export function useClaudeSessions(profileId: string, cli = "claude") {
  const [store, setStore] = useState<Store>({ sessions: [], groups: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Backend I/O is async + debounced; these refs let a profile switch / unmount
  // flush a pending write and stop writes from racing ahead of the initial load.
  const loadedRef = useRef(false);
  const latestRef = useRef<Store>(store);
  const saveTimer = useRef<number>(0);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    setLoading(true);
    void loadStore(profileId, cli).then((loaded) => {
      if (cancelled) return;
      latestRef.current = loaded;
      setStore(loaded);
      setActiveId(loaded.sessions.length ? mostRecent(loaded.sessions).id : null);
      loadedRef.current = true;
      setLoading(false);
    });
    // On switch/unmount, flush any pending debounced write for THIS persona+cli
    // (captured in the closure) so the last edit isn't dropped when we navigate.
    return () => {
      cancelled = true;
      window.clearTimeout(saveTimer.current);
      if (dirtyRef.current) {
        dirtyRef.current = false;
        void saveStore(profileId, cli, latestRef.current);
      }
    };
  }, [profileId, cli]);

  const update = useCallback(
    (fn: (s: Store) => Store) => {
      setStore((prev) => {
        const next = fn(prev);
        latestRef.current = next;
        // Never write before the initial load resolves, or we'd clobber the
        // file with the transient empty store.
        if (loadedRef.current) {
          dirtyRef.current = true;
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            dirtyRef.current = false;
            void saveStore(profileId, cli, latestRef.current);
          }, 250);
        }
        return next;
      });
    },
    [profileId, cli],
  );

  const newSession = useCallback(
    (groupId: string | null = null) => {
      const session: ClaudeSession = {
        id: newId(),
        title: "New session",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        started: false,
        pinned: false,
        groupId,
      };
      update((s) => ({ ...s, sessions: [session, ...s.sessions] }));
      setActiveId(session.id);
      return session;
    },
    [update],
  );

  const select = useCallback((id: string) => {
    // Only flip the active id — do NOT bump updatedAt here. Re-sorting the list
    // on click makes the clicked row jump to the top of its section, so the
    // highlight appears to "land" on a different row than the one tapped (even
    // though the content pane switches correctly). Recency is bumped on actual
    // use (spawn / input), not on mere selection.
    setActiveId(id);
  }, []);

  const remove = useCallback(
    (id: string) => {
      update((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }));
      setActiveId((cur) =>
        cur === id ? (store.sessions.find((x) => x.id !== id)?.id ?? null) : cur,
      );
    },
    [update, store.sessions],
  );

  const rename = useCallback(
    (id: string, title: string) =>
      update((s) => ({
        ...s,
        sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
      })),
    [update],
  );

  const markStarted = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        sessions: s.sessions.map((x) =>
          x.id === id && !x.started ? { ...x, started: true } : x,
        ),
      })),
    [update],
  );

  /** Resolve a session's layout, synthesizing the default single pane when it
   *  has never been split. */
  const resolveLayout = useCallback(
    (s: ClaudeSession): LayoutNode => s.layout ?? defaultLayout(s, cli),
    [cli],
  );

  /** Split `paneId` in `sessionId`, adding a fresh pane bound to a new
   *  conversation UUID. A fork-split (forkConvId supplied) inherits the source
   *  pane's CLI and loads its conversation history; a plain split instead opens
   *  an EMPTY, unbound pane (`cli: ""`) that prompts the user to pick a persona
   *  (drag-drop or the card picker) before any terminal spawns. */
  const splitPane = useCallback(
    (sessionId: string, paneId: string, dir: "row" | "col", forkConvId?: string) => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) => {
          if (sess.id !== sessionId) return sess;
          const layout = sess.layout ?? defaultLayout(sess, cli);
          const source = findPane(layout, paneId);
          const fresh: PaneNode = {
            type: "pane",
            paneId: newId(),
            convId: newId(),                    // always unique
            forkFromConvId: forkConvId,         // used once on first spawn
            // Fork keeps the source CLI (it resumes that conversation); a plain
            // split starts empty so the user explicitly fills it.
            cli: forkConvId ? (source?.cli ?? cli) : "",
            started: false,
            cwd: source?.cwd ?? null,
          };
          return { ...sess, layout: splitNode(layout, paneId, dir, fresh) };
        }),
      }));
    },
    [update, cli],
  );

  /** Close `paneId`. When the last pane is closed the layout collapses back to
   *  a fresh single default pane (the session itself is never removed here). */
  const closePane = useCallback(
    (sessionId: string, paneId: string) => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) => {
          if (sess.id !== sessionId) return sess;
          const layout = sess.layout ?? defaultLayout(sess, cli);
          const next = closeNode(layout, paneId);
          // Last pane gone → drop the persisted layout so it reverts to the
          // synthesized default bound to the session id.
          if (next === null) {
            const { layout: _drop, ...rest } = sess;
            return rest;
          }
          return { ...sess, layout: next };
        }),
      }));
    },
    [update, cli],
  );

  /** Update a divider position (first child's fraction of the split). */
  const setSplitRatio = useCallback(
    (sessionId: string, splitId: string, ratio: number) => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId && sess.layout
            ? { ...sess, layout: setRatio(sess.layout, splitId, ratio) }
            : sess,
        ),
      }));
    },
    [update],
  );

  /** Mark a pane's conversation started after its PTY spawns, recording the
   *  directory it spawned in (`cwd`). A later restore then resumes via
   *  `--resume` from that exact project dir — Claude stores each conversation
   *  per-cwd, so resuming from a different directory loses the history. */
  const markPaneStarted = useCallback(
    (sessionId: string, paneId: string, cwd: string | null) => {
      // Keep the global directory store in step with the pane that just
      // spawned: the toolbar picker, branch chip, and Git panel all read
      // `directoryStore.cwd`, so a persisted session sitting in a repo (whose
      // path lives on the pane, not the global store) would otherwise leave the
      // toolbar showing "Home" and the Git panel empty. Only backfill a concrete
      // path — a null spawn cwd means "home", which the store already represents.
      if (cwd) useDirectoryStore.getState().setCwd(cwd);
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) => {
          if (sess.id !== sessionId) return sess;
          // The default (unsplit) pane shares the session id: fold the started
          // flag (and spawn cwd) onto the session itself, leaving layout absent.
          if (!sess.layout && paneId === sess.id) {
            return sess.started ? sess : { ...sess, started: true, cwd };
          }
          if (!sess.layout) return sess;
          return { ...sess, layout: markStartedNode(sess.layout, paneId, cwd) };
        }),
      }));
    },
    [update],
  );

  /** Issue a fresh `convId` for `paneId` so `ClaudeTerminal` remounts and
   *  starts a new session. Called automatically when the PTY output contains
   *  "already in use", recovering from stale lock files or duplicate forks. */
  const respawnPane = useCallback(
    (sessionId: string, paneId: string) => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) => {
          if (sess.id !== sessionId) return sess;
          const layout = sess.layout ?? defaultLayout(sess, cli);
          const patch = (node: LayoutNode): LayoutNode => {
            if (node.type === "pane") {
              if (node.paneId !== paneId) return node;
              return { ...node, convId: newId(), forkFromConvId: undefined, started: false };
            }
            return { ...node, children: [patch(node.children[0]), patch(node.children[1])] };
          };
          return { ...sess, layout: patch(layout) };
        }),
      }));
    },
    [update, cli],
  );

  /** Load an existing conversation (`convId` from a session dragged out of the
   *  sidebar) into the pane `paneId`, replacing whatever it was running. Points
   *  the pane at that conversation and marks it `started` with the conversation's
   *  recorded `cwd`, so `ClaudeTerminal` respawns with `--resume <convId>` from
   *  the right project dir — the pane takes over that session's history. */
  const loadConvIntoPane = useCallback(
    (
      sessionId: string,
      paneId: string,
      convId: string,
      newCli: string,
      convCwd: string | null,
    ) => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) => {
          if (sess.id !== sessionId) return sess;
          const layout = sess.layout ?? defaultLayout(sess, cli);
          const patch = (node: LayoutNode): LayoutNode => {
            if (node.type === "pane") {
              if (node.paneId !== paneId) return node;
              return {
                ...node,
                convId,
                cli: newCli,
                cwd: convCwd,
                forkFromConvId: undefined,
                started: true, // spawn with --resume on convId, not --session-id
              };
            }
            return { ...node, children: [patch(node.children[0]), patch(node.children[1])] };
          };
          return { ...sess, layout: patch(layout) };
        }),
      }));
    },
    [update, cli],
  );

  /** Rebind `paneId` to a new persona + CLI. Issues a fresh convId so the
   *  terminal respawns immediately with the new binary and persona context. */
  const assignPaneProfile = useCallback(
    (sessionId: string, paneId: string, profileId: string, newCli: string) => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) => {
          if (sess.id !== sessionId) return sess;
          const layout = sess.layout ?? defaultLayout(sess, cli);
          return { ...sess, layout: reassignPaneNode(layout, paneId, profileId, newCli) };
        }),
      }));
    },
    [update, cli],
  );

  /** Set (or clear, with an empty string) a pane's custom header title. The
   *  default unsplit pane has no persisted layout, so renaming it synthesizes
   *  one bound to the session id. */
  const renamePane = useCallback(
    (sessionId: string, paneId: string, title: string) => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) => {
          if (sess.id !== sessionId) return sess;
          const layout = sess.layout ?? defaultLayout(sess, cli);
          const patch = (node: LayoutNode): LayoutNode => {
            if (node.type === "pane") {
              if (node.paneId !== paneId) return node;
              const trimmed = title.trim();
              if (!trimmed) {
                const { title: _drop, ...rest } = node;
                return rest;
              }
              return { ...node, title: trimmed };
            }
            return { ...node, children: [patch(node.children[0]), patch(node.children[1])] };
          };
          return { ...sess, layout: patch(layout) };
        }),
      }));
    },
    [update, cli],
  );

  /** Set (or clear) a pane's per-pane colour override. Pass both undefined to
   *  clear it (the pane reverts to following the global palette). */
  const setPanePalette = useCallback(
    (sessionId: string, paneId: string, palette?: string, accent?: string) => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) => {
          if (sess.id !== sessionId) return sess;
          const layout = sess.layout ?? defaultLayout(sess, cli);
          const patch = (node: LayoutNode): LayoutNode => {
            if (node.type === "pane") {
              if (node.paneId !== paneId) return node;
              const { palette: _p, accent: _a, ...rest } = node;
              if (!palette && !accent) return rest;
              return {
                ...rest,
                ...(palette ? { palette } : {}),
                ...(accent ? { accent } : {}),
              };
            }
            return { ...node, children: [patch(node.children[0]), patch(node.children[1])] };
          };
          return { ...sess, layout: patch(layout) };
        }),
      }));
    },
    [update, cli],
  );

  const togglePin = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        sessions: s.sessions.map((x) =>
          x.id === id ? { ...x, pinned: !x.pinned } : x,
        ),
      })),
    [update],
  );

  const setGroup = useCallback(
    (id: string, groupId: string | null) =>
      update((s) => ({
        ...s,
        sessions: s.sessions.map((x) => (x.id === id ? { ...x, groupId } : x)),
      })),
    [update],
  );

  const newGroup = useCallback(
    (name: string): string => {
      const group: ClaudeGroup = { id: newId(), name, createdAt: Date.now() };
      update((s) => ({ ...s, groups: [...s.groups, group] }));
      return group.id;
    },
    [update],
  );

  const renameGroup = useCallback(
    (id: string, name: string) =>
      update((s) => ({
        ...s,
        groups: s.groups.map((g) => (g.id === id ? { ...g, name } : g)),
      })),
    [update],
  );

  const removeGroup = useCallback(
    (id: string) =>
      // Delete the group; its sessions fall back to ungrouped (not deleted).
      update((s) => ({
        groups: s.groups.filter((g) => g.id !== id),
        sessions: s.sessions.map((x) =>
          x.groupId === id ? { ...x, groupId: null } : x,
        ),
      })),
    [update],
  );

  const active = useMemo(
    () => store.sessions.find((s) => s.id === activeId) ?? null,
    [store.sessions, activeId],
  );

  return {
    sessions: store.sessions,
    groups: store.groups,
    activeId,
    active,
    loading,
    newSession,
    select,
    remove,
    rename,
    markStarted,
    resolveLayout,
    splitPane,
    closePane,
    setSplitRatio,
    markPaneStarted,
    assignPaneProfile,
    loadConvIntoPane,
    respawnPane,
    renamePane,
    setPanePalette,
    togglePin,
    setGroup,
    newGroup,
    renameGroup,
    removeGroup,
  };
}

function mostRecent(sessions: ClaudeSession[]): ClaudeSession {
  return sessions.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}
