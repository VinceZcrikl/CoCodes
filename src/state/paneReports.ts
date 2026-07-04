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
  /** True for a report restored from a previous session. Its `forEndedAt` is on
   *  the previous run of the `performance.now()` clock (which resets to 0 each
   *  launch), so it must NOT be compared against this session's run timestamps —
   *  the deck shows a stale report but never lets it block a fresh run's report. */
  stale?: boolean;
}

const STORE_KEY = "cocodes:pane-reports";

/** The finished reports survive an app restart (the sprite keeps showing its
 *  last report until the user dismisses it or a new run replaces it). The
 *  `pending` "writing…" state is deliberately NOT persisted — a generation that
 *  was in flight when the app closed is dead, and must not resurrect as a stuck
 *  "writing report…" bubble on the next launch. */
function loadReports(): Record<string, PaneReport> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // Restored reports are from last session's clock — flag them stale.
    const out: Record<string, PaneReport> = {};
    for (const [id, r] of Object.entries(parsed as Record<string, PaneReport>)) {
      if (r && typeof r.text === "string") out[id] = { ...r, stale: true };
    }
    return out;
  } catch {
    return {};
  }
}

function saveReports(reports: Record<string, PaneReport>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(reports));
  } catch {
    /* private mode / quota — the in-memory copy still works this session */
  }
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
  reports: loadReports(),
  pending: {},
  begin: (paneId, endedAt) =>
    set((s) => ({ pending: { ...s.pending, [paneId]: endedAt } })),
  finish: (paneId, endedAt, text) =>
    set((s) => {
      const pending = { ...s.pending };
      // Clear the writing state for this pane. Match on endedAt so a newer run's
      // generation isn't cancelled by an older one finishing late; but if the
      // pending run is older-or-equal to the one we're finishing, drop it too so
      // a superseded generation can never leave the bubble stuck on "writing…".
      if (pending[paneId] !== undefined && pending[paneId] <= endedAt) {
        delete pending[paneId];
      }
      if (!text) return { pending };
      const reports = {
        ...s.reports,
        [paneId]: { text, forEndedAt: endedAt, dismissed: false },
      };
      saveReports(reports);
      return { pending, reports };
    }),
  dismiss: (paneId) =>
    set((s) => {
      const r = s.reports[paneId];
      if (!r) return {};
      const reports = { ...s.reports, [paneId]: { ...r, dismissed: true } };
      saveReports(reports);
      return { reports };
    }),
  reopen: (paneId) =>
    set((s) => {
      const r = s.reports[paneId];
      if (!r) return {};
      const reports = { ...s.reports, [paneId]: { ...r, dismissed: false } };
      saveReports(reports);
      return { reports };
    }),
  clear: (paneId) =>
    set((s) => {
      if (!s.reports[paneId]) return {};
      const reports = { ...s.reports };
      delete reports[paneId];
      saveReports(reports);
      return { reports };
    }),
}));
