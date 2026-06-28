/** The `CoCodes_` wordmark — a gilded display logotype mounted on the header
 *  divider. The two camelCase capitals are brighter + a touch larger so the
 *  "Co · Codes" rhythm reads as a crafted mark; each carries an engraved relief
 *  + a small gleam, closed by a thin terminal caret.
 *
 *  Theme-neutral: the font + the cap/low/caret/gleam colours are driven by CSS
 *  custom properties (--tw-font, --tw-cap-grad, --tw-low-grad, --tw-caret,
 *  --tw-gleam) that each [data-palette] block overrides, so the mark re-skins
 *  per theme (gold serif ↔ icy sans ↔ indigo serif …). Generalised from the
 *  original Olympus temple wordmark. */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`td-wordmark ${className}`} role="img" aria-label="CoCodes">
      <span className="tw-cap">C</span>
      <span className="tw-low">o</span>
      <span className="tw-cap">C</span>
      <span className="tw-low">odes</span>
      <span className="tw-caret" aria-hidden="true" />
    </div>
  );
}
