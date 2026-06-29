import { useEffect, useState } from "react";
import {
  startTracking,
  stopTracking,
  getBusyPaneIds,
  getBusySessionIds,
} from "../state/terminalActivity";

export interface TerminalBusyState {
  busySessions: Set<string>;
  busyPanes: Set<string>;
}

const EMPTY: TerminalBusyState = {
  busySessions: new Set(),
  busyPanes: new Set(),
};

/** Returns Sets of sessionIds and paneIds that have had terminal output within
 *  the last 4 seconds. Polls every 200 ms; uses a single shared Tauri listener. */
export function useTerminalBusy(): TerminalBusyState {
  const [state, setState] = useState<TerminalBusyState>(EMPTY);

  useEffect(() => {
    void startTracking();
    const id = window.setInterval(() => {
      setState({ busySessions: getBusySessionIds(), busyPanes: getBusyPaneIds() });
    }, 200);
    return () => {
      window.clearInterval(id);
      stopTracking();
    };
  }, []);

  return state;
}
