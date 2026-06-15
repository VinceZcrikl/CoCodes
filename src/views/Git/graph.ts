/** Commit-graph lane layout. Given commits newest-first with their parent
 *  hashes, assign each a column and produce the line segments that connect it
 *  to the rows above/below — the classic multi-lane git graph. Pure + sync so
 *  it can run in a useMemo. */

const LANE_COLORS = [
  "#d29922", // gold
  "#58a6ff", // blue
  "#3fb950", // green
  "#db6d28", // orange
  "#a371f7", // purple
  "#f85149", // red
  "#39c5cf", // teal
  "#e3b341", // amber
];

export function laneColor(lane: number): string {
  return LANE_COLORS[((lane % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length];
}

/** A line segment in lane-space. x is a lane index; y is a fraction of the row
 *  height (0 = top, 0.5 = node, 1 = bottom). The renderer scales to pixels. */
export interface GraphSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface GraphRow {
  /** Node column (lane index). */
  col: number;
  color: string;
  /** True when the commit has >1 parent (drawn as a hollow node). */
  merge: boolean;
  segments: GraphSegment[];
}

export interface Graph {
  rows: GraphRow[];
  /** Widest lane count across all rows — fixes the graph column width. */
  laneCount: number;
}

export function computeGraph(
  commits: { hash: string; parents: string[] }[],
): Graph {
  // lanes[i] = hash the lane is currently waiting to render next, or null.
  let lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let laneCount = 1;

  for (const c of commits) {
    // Lanes already routed to this commit (its children point here).
    const mine: number[] = [];
    lanes.forEach((h, i) => {
      if (h === c.hash) mine.push(i);
    });

    let col: number;
    if (mine.length) {
      col = mine[0];
    } else {
      col = lanes.indexOf(null);
      if (col === -1) {
        col = lanes.length;
        lanes.push(null);
      }
    }

    const incoming = lanes.slice();

    // The commit consumes every lane that was waiting for it.
    mine.forEach((i) => (lanes[i] = null));
    lanes[col] = null;

    // Route parents into lanes: first parent continues in `col`; extra parents
    // (merges) take an existing lane if already tracked, else a fresh one.
    c.parents.forEach((p, pi) => {
      let pl = lanes.indexOf(p);
      if (pl === -1) {
        if (pi === 0) {
          pl = col;
        } else {
          pl = lanes.indexOf(null);
          if (pl === -1) {
            pl = lanes.length;
            lanes.push(null);
          }
        }
        lanes[pl] = p;
      }
    });

    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    const outgoing = lanes.slice();

    const segments: GraphSegment[] = [];

    // Incoming lanes: a lane waiting for THIS commit merges into the node (top
    // half); any other lane continues straight/diagonally to wherever its hash
    // now sits (full height).
    incoming.forEach((h, i) => {
      if (h === null) return;
      if (h === c.hash) {
        segments.push({ x1: i, y1: 0, x2: col, y2: 0.5, color: laneColor(i) });
      } else {
        const j = outgoing.indexOf(h);
        if (j !== -1) {
          segments.push({ x1: i, y1: 0, x2: j, y2: 1, color: laneColor(j) });
        } else {
          segments.push({ x1: i, y1: 0, x2: i, y2: 0.5, color: laneColor(i) });
        }
      }
    });

    // Parent edges leave the node (bottom half) toward each parent's lane.
    c.parents.forEach((p) => {
      const j = outgoing.indexOf(p);
      if (j !== -1) {
        segments.push({ x1: col, y1: 0.5, x2: j, y2: 1, color: laneColor(j) });
      }
    });

    laneCount = Math.max(laneCount, incoming.length, outgoing.length, col + 1);
    rows.push({ col, color: laneColor(col), merge: c.parents.length > 1, segments });
  }

  return { rows, laneCount };
}
