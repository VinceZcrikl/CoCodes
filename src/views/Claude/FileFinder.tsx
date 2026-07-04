import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Folder, File, ArrowUp, FolderOpen, Lock, LockOpen, Copy } from "lucide-react";
import { fuzzyScore } from "./fuzzy";

interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
}
interface FsList {
  dir: string;
  parent: string | null;
  entries: FsEntry[];
}

interface Item {
  label: string;
  path: string;
  isDir: boolean;
  isParent?: boolean;
}

interface Props {
  /** Directory to open at; null → home. */
  cwd: string | null;
  /** Paste a selected file's absolute path into the terminal. */
  onInsertPath: (absPath: string) => void;
  /** Set the working directory to the browsed folder. */
  onSetCwd: (dir: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 300;

/** Sentinel path used to represent the virtual "all drives" root on Windows. */
const DRIVES_PATH = "__drives__";

export default function FileFinder({ cwd, onInsertPath, onSetCwd, onClose }: Props) {
  const [dir, setDir] = useState<string | null>(cwd);
  const [list, setList] = useState<FsList | null>(null);
  const [query, setQuery] = useState("");
  const [walkFiles, setWalkFiles] = useState<string[] | null>(null);
  const [walking, setWalking] = useState(false);
  const [active, setActive] = useState(0);
  // Windows drive list; empty on Mac/Linux (no drive concept).
  const [drives, setDrives] = useState<string[]>([]);
  // True when showing the virtual "All Drives" root instead of a directory.
  const [showDrives, setShowDrives] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Fetch the list of available drives once on mount (Windows only).
  useEffect(() => {
    void invoke<string[]>("fs_drives").then(setDrives).catch(() => {});
  }, []);

  // Load directory entries whenever the browsed directory changes; invalidate
  // the recursive walk cache for the new root.
  useEffect(() => {
    let cancelled = false;
    setWalkFiles(null);
    void invoke<FsList>("fs_list", { path: dir })
      .then((r) => { if (!cancelled) { setList(r); setActive(0); } })
      .catch(() => { if (!cancelled) setList(null); });
    return () => { cancelled = true; };
  }, [dir]);

  // Lazily fetch the recursive file list the first time the user searches in a
  // directory; cached until they navigate elsewhere.
  useEffect(() => {
    if (!query.trim() || !list || walkFiles !== null || showDrives) return;
    let cancelled = false;
    setWalking(true);
    void invoke<string[]>("fs_walk", { root: list.dir, limit: 8000 })
      .then((f) => { if (!cancelled) setWalkFiles(f); })
      .catch(() => { if (!cancelled) setWalkFiles([]); })
      .finally(() => { if (!cancelled) setWalking(false); });
    return () => { cancelled = true; };
  }, [query, list, walkFiles, showDrives]);

  useEffect(() => { setActive(0); }, [query]);

  // True when at a filesystem root with no parent (Windows drive root like C:\).
  const atDriveRoot = !list?.parent && drives.length > 0 && !showDrives;

  const items = useMemo<Item[]>(() => {
    // Drives layer: all available drive roots as navigable folders.
    if (showDrives) {
      return drives.map((d) => ({ label: d, path: d, isDir: true }));
    }
    if (!list) return [];
    if (!query.trim()) {
      const arr: Item[] = [];
      if (list.parent) {
        arr.push({ label: "..", path: list.parent, isDir: true, isParent: true });
      } else if (atDriveRoot) {
        // Virtual ".." that opens the drives selector.
        arr.push({ label: "..", path: DRIVES_PATH, isDir: true, isParent: true });
      }
      for (const e of list.entries) arr.push({ label: e.name, path: e.path, isDir: e.isDir });
      return arr;
    }
    if (!walkFiles) return [];
    const q = query.trim();
    const scored: { score: number; rel: string }[] = [];
    for (const rel of walkFiles) {
      const s = fuzzyScore(q, rel);
      if (s !== null) scored.push({ score: s, rel });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map(({ rel }) => ({
      label: rel,
      path: `${list.dir}/${rel}`,
      isDir: false,
    }));
  }, [list, query, walkFiles, showDrives, drives, atDriveRoot]);

  // Keep the highlighted row in view.
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  const goUp = () => {
    if (showDrives) return; // drives is the top; nothing above it
    if (list?.parent) { setDir(list.parent); }
    else if (atDriveRoot) { setQuery(""); setShowDrives(true); }
  };

  const choose = (item: Item | undefined) => {
    if (!item) return;
    if (item.path === DRIVES_PATH) {
      setQuery("");
      setShowDrives(true);
      return;
    }
    if (item.isDir) {
      setQuery("");
      setShowDrives(false);
      setDir(item.path);
    } else {
      onInsertPath(item.path);
      onClose();
    }
  };

  // Folder copy button: copy the full path to the clipboard AND paste it into
  // the terminal (which closes the finder), without navigating into the folder.
  const copyAndInsert = (path: string) => {
    void navigator.clipboard?.writeText(path).catch(() => {});
    onInsertPath(path);
    onClose();
  };

  // Folder lock button: lock the terminal workspace and Git panel to this
  // folder (sets it as the working directory) without navigating into it. The
  // finder stays open so the locked row updates its lock icon in place.
  const lockTo = (path: string) => {
    onSetCwd(path);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Backspace" && !query) {
      e.preventDefault();
      goUp();
    }
  };

  const browseNative = async () => {
    const picked = await invoke<string | null>("pick_directory");
    if (picked) { setQuery(""); setShowDrives(false); setDir(picked); }
  };

  const canGoUp = showDrives ? false : !!(list?.parent || atDriveRoot);
  const pathLabel = showDrives ? "Drives" : (list?.dir ?? "…");

  return (
    <div className="file-finder" role="dialog" aria-label="File finder">
      <div className="file-finder-head">
        <div className="file-finder-search">
          <Search size={13} strokeWidth={1.9} />
          <input
            ref={inputRef}
            type="text"
            className="file-finder-input"
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className="file-finder-icon-btn"
            onClick={() => void browseNative()}
            title="Browse…"
            aria-label="Browse for a folder"
          >
            <FolderOpen size={13} strokeWidth={1.9} />
          </button>
        </div>
        <div className="file-finder-path" title={pathLabel}>
          {canGoUp && (
            <button
              type="button"
              className="file-finder-up"
              onClick={goUp}
              title="Up one level"
              aria-label="Up one level"
            >
              <ArrowUp size={11} strokeWidth={2.2} />
            </button>
          )}
          <span className="file-finder-path-text">{pathLabel}</span>
        </div>
      </div>

      <div className="file-finder-list" ref={listRef} role="listbox">
        {items.length === 0 ? (
          <div className="file-finder-empty">
            {query.trim() ? (walking ? "Searching…" : "No matches") : "Empty folder"}
          </div>
        ) : (
          items.map((item, i) => (
            <div
              key={`${item.path}:${i}`}
              role="option"
              aria-selected={i === active}
              className={`file-finder-row${i === active ? " active" : ""}`}
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => choose(item)}
              title={item.path}
            >
              {item.isParent ? (
                <ArrowUp size={13} strokeWidth={1.9} className="file-finder-row-icon dir" />
              ) : item.isDir ? (
                <Folder size={13} strokeWidth={1.9} className="file-finder-row-icon dir" />
              ) : (
                <File size={13} strokeWidth={1.75} className="file-finder-row-icon" />
              )}
              <span className="file-finder-row-label">{item.label}</span>
              {item.isDir && !item.isParent && (() => {
                const locked = item.path === cwd;
                return (
                  <>
                    <button
                      type="button"
                      className={`file-finder-lock${locked ? " locked" : ""}`}
                      onClick={(e) => { e.stopPropagation(); lockTo(item.path); }}
                      title={locked ? "Terminal & Git locked here" : "Lock terminal & Git to this folder"}
                      aria-label={locked ? "Locked as working directory" : "Lock terminal and Git to this folder"}
                      aria-pressed={locked}
                    >
                      {locked
                        ? <Lock size={12} strokeWidth={1.9} />
                        : <LockOpen size={12} strokeWidth={1.9} />}
                    </button>
                    <button
                      type="button"
                      className="file-finder-copy"
                      onClick={(e) => { e.stopPropagation(); copyAndInsert(item.path); }}
                      title="Copy path & paste to terminal"
                      aria-label="Copy path and paste to terminal"
                    >
                      <Copy size={12} strokeWidth={1.9} />
                    </button>
                  </>
                );
              })()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
