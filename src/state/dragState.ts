/** Ephemeral drag state shared across components.
 *
 * We use Pointer Events (not HTML5 DnD) so Tauri's window-drag region listener
 * doesn't intercept the gesture. The dragged persona is mirrored here so
 * PaneLeaf can show accent highlights during hover without prop drilling. */
export interface DraggingPersona {
  id: string;
  cli: string;
}

export let draggingPersona: DraggingPersona | null = null;

export function setDraggingPersona(p: DraggingPersona | null): void {
  draggingPersona = p;
}

/** Custom DOM event dispatched on window when the user drops a persona onto a
 *  pane. ClaudeTab listens for this and calls assignPaneProfile. */
export const PERSONA_DROP_EVENT = "terminus:persona-drop";

export interface PersonaDropDetail {
  paneId: string;
  profileId: string;
  cli: string;
}

/** Ephemeral state for a session being dragged out of the sidebar onto a pane.
 *  Mirrored here (same reasoning as draggingPersona) so PaneLeaf can show a
 *  drop highlight during hover without prop drilling. */
export interface DraggingSession {
  /** The dragged session's id (its Claude conversation UUID / `--resume` arg). */
  convId: string;
  /** Working dir the conversation was recorded under — `--resume` must run from
   *  it, since Claude stores conversations per project dir. null → home. */
  cwd: string | null;
  /** Which CLI the session runs, so the target pane resumes the right binary. */
  cli: string;
  /** Title, for the drag ghost label. */
  title: string;
}

export let draggingSession: DraggingSession | null = null;

export function setDraggingSession(s: DraggingSession | null): void {
  draggingSession = s;
}

/** Dispatched on window when a session is dropped onto a pane. ClaudeTab listens
 *  and reloads that conversation into the target pane (restart + --resume). */
export const SESSION_DROP_EVENT = "terminus:session-drop";

export interface SessionDropDetail {
  /** The target pane to reload. */
  paneId: string;
  /** The dragged conversation to resume into it. */
  convId: string;
  cwd: string | null;
  cli: string;
}
