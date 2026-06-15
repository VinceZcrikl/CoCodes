/** Tiny fzf-style subsequence scorer for the file finder. Returns a score
 *  (higher = better) when every char of `query` appears in `target` in order,
 *  or null when it doesn't match. Rewards consecutive runs, segment boundaries
 *  (after `/ _ - .`), the start of the string, and matches inside the basename;
 *  penalizes longer targets so tighter paths rank first. Case-insensitive. */
export function fuzzyScore(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastMatch = -2;
  let consec = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    let bonus = 1;
    if (lastMatch === ti - 1) {
      consec += 1;
      bonus += consec * 3;
    } else {
      consec = 0;
    }
    const prev = ti > 0 ? t[ti - 1] : "/";
    if (prev === "/" || prev === "_" || prev === "-" || prev === "." || prev === " ") {
      bonus += 8;
    }
    if (ti === 0) bonus += 8;
    score += bonus;
    lastMatch = ti;
    qi += 1;
  }

  if (qi < q.length) return null; // not all query chars matched

  score -= t.length * 0.05; // prefer shorter paths
  const slash = t.lastIndexOf("/");
  if (lastMatch > slash) score += 6; // match landed in the basename
  return score;
}
