/**
 * Sidebar row timestamp formatter. Same-day timestamps show the time with an
 * AM/PM marker (e.g. "3:45 PM"); anything older shows the date as DD/MM/YYYY.
 * Returns "" for missing/zero timestamps so callers can omit the line.
 */
export function formatItemTime(ts: number): string {
  if (!ts || ts <= 0) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
