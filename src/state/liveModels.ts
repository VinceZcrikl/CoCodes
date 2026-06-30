import { create } from "zustand";

/** The real model each persona's running session is using, read off the CLI's
 *  startup banner (see PaneLayout / terminal `terminal://model`). The cockpit
 *  header and constellation read this so the active persona shows its actual
 *  model instead of a config guess / "default". Keyed by profileId; the most
 *  recent session for a persona wins. */
interface LiveModelState {
  byProfile: Record<string, string>;
  setModel: (profileId: string, model: string) => void;
}

export const useLiveModels = create<LiveModelState>((set) => ({
  byProfile: {},
  setModel: (profileId, model) =>
    set((s) =>
      s.byProfile[profileId] === model
        ? s
        : { byProfile: { ...s.byProfile, [profileId]: model } },
    ),
}));
