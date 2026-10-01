// ============================================================================
//  lanes.ts: place commits on "lanes" so a branchy history can be drawn like
//  `git log --graph`. Commits arrive newest-first (topological order). Each lane is
//  a vertical track; a lane "expects" a certain commit next (the parent of the
//  commit above it). Branches fork into new lanes; merges pull lanes back together.
// ============================================================================
import type { GitCommit } from '@shared/git';

export interface RowLayout {
  /** Lane (column) of this commit's dot. */
  lane: number;
  /** Which commit each lane was waiting for ABOVE this row, and BELOW it. */
  before: Array<string | null>;
  after: Array<string | null>;
  /** Other lanes that arrive at this commit from above (a merge point of a fork). */
  mergeFrom: number[];
  /** Extra lanes the commit's other parents continue in (this commit is a merge). */
  branchTo: number[];
}

export interface LaneLayout {
  rows: RowLayout[];
  laneCount: number;
}

export function layoutLanes(commits: GitCommit[]): LaneLayout {
  const lanes: Array<string | null> = [];
  const rows: RowLayout[] = [];
  let laneCount = 1;

  const freeLane = () => {
    const i = lanes.indexOf(null);
    if (i >= 0) return i;
    lanes.push(null);
    return lanes.length - 1;
  };

  for (const c of commits) {
    const before = lanes.slice();
    let lane = lanes.indexOf(c.sha);
    if (lane < 0) {
      // nothing was waiting for this commit: it is the tip of a branch, so it starts a new lane
      lane = freeLane();
    }
    // other lanes also waiting for this commit converge into it
    const mergeFrom: number[] = [];
    for (let j = 0; j < lanes.length; j++) if (j !== lane && lanes[j] === c.sha) (mergeFrom.push(j), (lanes[j] = null));

    // the first parent continues straight down this lane; further parents (a merge) take other lanes
    lanes[lane] = c.parents[0] ?? null;
    const branchTo: number[] = [];
    for (const p of c.parents.slice(1)) {
      let k = lanes.indexOf(p);
      if (k < 0) (k = freeLane()), (lanes[k] = p);
      branchTo.push(k);
    }
    // trim empty lanes on the right so the graph stays narrow
    while (lanes.length > 1 && lanes[lanes.length - 1] === null) lanes.pop();
    laneCount = Math.max(laneCount, lanes.length, lane + 1, ...branchTo.map((k) => k + 1), ...mergeFrom.map((k) => k + 1));
    rows.push({ lane, before, after: lanes.slice(), mergeFrom, branchTo });
  }
  return { rows, laneCount };
}
