import { create } from "zustand";

/** The active persona id drives which SOUL/MEMORY/USER the embedded terminal
 *  injects (`profileId` → `--append-system-prompt-file`). Persisted so the
 *  cockpit reopens with the same persona. */
const STORAGE_KEY = "cocodes:active-profile";
const DEFAULT_PROFILE = "claude";

function loadInitial(): string {
  if (typeof localStorage === "undefined") return DEFAULT_PROFILE;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_PROFILE;
}

interface ProfileState {
  activeProfileId: string;
  setActiveProfile: (id: string) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  activeProfileId: loadInitial(),
  setActiveProfile: (id) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode — ignore */
    }
    set({ activeProfileId: id });
  },
}));
