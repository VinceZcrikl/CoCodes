/** A live embedded terminal, keyed by its backend terminal key
 *  (`"<paneId>:<convId>"`) — the same id the backend bakes into a CLI's
 *  permission-prompt hook URL. Lets a `cocodes://needs-attention` event resolve
 *  exactly which (persona, cli, session, pane) is waiting on the user, so the
 *  tray notification can jump straight to it. */
export interface RegisteredTerminal {
  profileId: string;
  cli: string;
  sessionId: string;
  paneId: string;
  /** Focus this pane's xterm. */
  focus: () => void;
}

const registry = new Map<string, RegisteredTerminal>();

/** The terminal key that last received keyboard focus — used to suppress a
 *  notification for the pane the user is already looking at. */
let lastFocusedKey: string | null = null;

export function registerTerminal(key: string, entry: RegisteredTerminal): void {
  registry.set(key, entry);
}

export function unregisterTerminal(key: string): void {
  registry.delete(key);
  if (lastFocusedKey === key) lastFocusedKey = null;
}

export function lookupTerminal(key: string): RegisteredTerminal | undefined {
  return registry.get(key);
}

export function noteTerminalFocus(key: string): void {
  lastFocusedKey = key;
}

export function getLastFocusedKey(): string | null {
  return lastFocusedKey;
}
