/** One-time localStorage migration for the Theoi → CoCodes rename.
 *
 *  Every persisted store key was reprefixed `theoi` → `cocodes` (`theoi:`,
 *  `theoi.`, `theoi-`). Without this, a returning user's sessions, palette,
 *  active profile, directory, sidebar and theme would all be orphaned under the
 *  old keys. Copy each legacy key onto its renamed counterpart when the new one
 *  is absent.
 *
 *  This is a side-effect module imported FIRST in `main.tsx`, before the store
 *  modules — the zustand `persist` stores hydrate from localStorage at import
 *  time, so the copy must happen before they load. */
try {
  for (const oldKey of Object.keys(localStorage)) {
    if (!/^theoi[:.-]/.test(oldKey)) continue;
    const newKey = "cocodes" + oldKey.slice("theoi".length);
    if (localStorage.getItem(newKey) === null) {
      const v = localStorage.getItem(oldKey);
      if (v !== null) localStorage.setItem(newKey, v);
    }
  }

  // The gilded palette itself was renamed "theoi" → "cocodes". Rewrite a saved
  // palette selection so the chosen base/accent persists verbatim (it would
  // otherwise fall back to the default, which happens to be the same theme).
  const paletteKey = "cocodes:palette";
  const raw = localStorage.getItem(paletteKey);
  if (raw) {
    if (raw === "theoi") {
      localStorage.setItem(paletteKey, "cocodes");
    } else if (raw[0] === "{") {
      const p = JSON.parse(raw) as { name?: string; accent?: string };
      if (p.name === "theoi") {
        p.name = "cocodes";
        localStorage.setItem(paletteKey, JSON.stringify(p));
      }
    }
  }
} catch {
  /* storage unavailable / malformed — non-fatal */
}
