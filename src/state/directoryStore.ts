import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENT = 8;

interface DirectoryState {
  /** Active working directory; null = use the user's home directory. */
  cwd: string | null;
  /** Recently used directories, newest first. */
  recent: string[];
  setCwd: (path: string | null) => void;
}

export const useDirectoryStore = create<DirectoryState>()(
  persist(
    (set) => ({
      cwd: null,
      recent: [],
      setCwd: (path) =>
        set((s) => ({
          cwd: path,
          recent: path
            ? [path, ...s.recent.filter((r) => r !== path)].slice(0, MAX_RECENT)
            : s.recent,
        })),
    }),
    { name: "theoi-directory" },
  ),
);

/** Last path segment of an absolute path, cross-platform. */
export function dirBasename(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
