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
