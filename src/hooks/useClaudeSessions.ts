import { useCallback, useEffect, useMemo, useState } from "react";

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

// cli defaults to "claude" so existing localStorage keys are unchanged.
const KEY = (profileId: string, cli = "claude") =>
  `openterminus.${cli}.sessions.${profileId}`;

function load(profileId: string, cli = "claude"): Store {
  try {
    const raw = localStorage.getItem(KEY(profileId, cli));
    if (!raw) return { sessions: [], groups: [] };
    const parsed = JSON.parse(raw) as unknown;
    // Back-compat: the original schema persisted a bare ClaudeSession[].
    if (Array.isArray(parsed)) {
      return { sessions: parsed.map(migrate), groups: [] };
    }
    const obj = parsed as Partial<Store>;
    return {
      sessions: Array.isArray(obj.sessions) ? obj.sessions.map(migrate) : [],
      groups: Array.isArray(obj.groups) ? obj.groups : [],
    };
  } catch {
    return { sessions: [], groups: [] };
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
  };
}

function save(profileId: string, store: Store, cli = "claude") {
  try {
    localStorage.setItem(KEY(profileId, cli), JSON.stringify(store));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

/** Per-profile, per-CLI store of terminal sessions + groups, persisted to
 *  localStorage. Supports rename, pin, grouping and "history" (the list).
 *  `cli` defaults to "claude" so existing call-sites work without changes. */
export function useClaudeSessions(profileId: string, cli = "claude") {
  const [store, setStore] = useState<Store>(() => load(profileId, cli));
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const loaded = load(profileId, cli);
    setStore(loaded);
    setActiveId(loaded.sessions.length ? mostRecent(loaded.sessions).id : null);
  }, [profileId, cli]);

  const update = useCallback(
    (fn: (s: Store) => Store) => {
      setStore((prev) => {
        const next = fn(prev);
        save(profileId, next, cli);
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

  const select = useCallback(
    (id: string) => {
      setActiveId(id);
      update((s) => ({
        ...s,
        sessions: s.sessions.map((x) =>
          x.id === id ? { ...x, updatedAt: Date.now() } : x,
        ),
      }));
    },
    [update],
  );

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
    newSession,
    select,
    remove,
    rename,
    markStarted,
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
