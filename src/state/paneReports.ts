import { create } from "zustand";

/** One sprite "quest report" per pane — the AI sentence spoken when a run ends.
 *  Lives outside the deck components so a report survives its card unmounting
 *  (deck closed, another session active) and is never generated twice for the
 *  same run. Cards match a report to a run via `forEndedAt`, the run's end
 *  timestamp from terminalActivity's ledger. */
export interface PaneReport {
  text: string;
  /** `endedAt` of the run this report covers. */
  forEndedAt: number;
  /** Dismissed hides the bubble but keeps the text for the 💬 reopen action. */
  dismissed: boolean;
}

interface PaneReportState {
  reports: Record<string, PaneReport>;
  /** paneId → endedAt of the run whose report is being generated right now. */
  pending: Record<string, number>;
  begin: (paneId: string, endedAt: number) => void;
  /** Store the generated text (null = generation failed / nothing to say). */
  finish: (paneId: string, endedAt: number, text: string | null) => void;
  dismiss: (paneId: string) => void;
  reopen: (paneId: string) => void;
  /** A new run started — the old quest report is history. */
  clear: (paneId: string) => void;
}

export const usePaneReportStore = create<PaneReportState>((set) => ({
  reports: {},
  pending: {},
  begin: (paneId, endedAt) =>
    set((s) => ({ pending: { ...s.pending, [paneId]: endedAt } })),
  finish: (paneId, endedAt, text) =>
    set((s) => {
      const pending = { ...s.pending };
      if (pending[paneId] === endedAt) delete pending[paneId];
      if (!text) return { pending };
      return {
        pending,
        reports: {
          ...s.reports,
          [paneId]: { text, forEndedAt: endedAt, dismissed: false },
        },
      };
    }),
  dismiss: (paneId) =>
    set((s) => {
      const r = s.reports[paneId];
      return r ? { reports: { ...s.reports, [paneId]: { ...r, dismissed: true } } } : {};
    }),
  reopen: (paneId) =>
    set((s) => {
      const r = s.reports[paneId];
      return r ? { reports: { ...s.reports, [paneId]: { ...r, dismissed: false } } } : {};
    }),
  clear: (paneId) =>
    set((s) => {
      if (!s.reports[paneId]) return {};
      const reports = { ...s.reports };
      delete reports[paneId];
      return { reports };
    }),
}));
