import { openUrl } from "@tauri-apps/plugin-opener";

/** Open an external URL in the system browser — used by "Get key" buttons that
 *  send the user to a vendor's API-key page. Failures are swallowed (logged) so a
 *  missing opener never breaks the form. */
export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch (e) {
    console.error("openExternal failed", e);
  }
}
