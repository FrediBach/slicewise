export type ToolpathRun = number[];

export type ToolpathGroupLike = {
  color?: string;
  label?: string;
  runs?: ToolpathRun[];
};

type Point = [x: number, y: number];

const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const samePoint = (a: Point, b: Point, epsilon = 1e-7): boolean => distance(a, b) <= epsilon;
const firstPoint = (run: ToolpathRun): Point => [run[0], run[1]];
const lastPoint = (run: ToolpathRun): Point => [run[run.length - 2], run[run.length - 1]];

function reverseRun(run: ToolpathRun): ToolpathRun {
  const reversed: number[] = [];
  for (let i = run.length - 2; i >= 0; i -= 2) reversed.push(run[i], run[i + 1]);
  return reversed;
}

/** Clip a polyline to an axis-aligned rectangle using Liang–Barsky per segment. */
export function clipRunToRect(run: ToolpathRun, width: number, height: number): ToolpathRun[] {
  if (run.length < 4 || width <= 0 || height <= 0) return [];
  const clipped: ToolpathRun[] = [];
  let current: ToolpathRun | null = null;

  const clipSegment = (a: Point, b: Point): [Point, Point] | null => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const p = [-dx, dx, -dy, dy];
    const q = [a[0], width - a[0], a[1], height - a[1]];
    let enter = 0,
      leave = 1;
    for (let edge = 0; edge < 4; edge++) {
      if (Math.abs(p[edge]) < 1e-12) {
        if (q[edge] < 0) return null;
        continue;
      }
      const ratio = q[edge] / p[edge];
      if (p[edge] < 0) enter = Math.max(enter, ratio);
      else leave = Math.min(leave, ratio);
      if (enter > leave) return null;
    }
    return [
      [a[0] + dx * enter, a[1] + dy * enter],
      [a[0] + dx * leave, a[1] + dy * leave],
    ];
  };

  const flush = (): void => {
    if (current && current.length >= 4) clipped.push(current);
    current = null;
  };
  for (let i = 0; i + 3 < run.length; i += 2) {
    const segment = clipSegment([run[i], run[i + 1]], [run[i + 2], run[i + 3]]);
    if (!segment || samePoint(segment[0], segment[1])) {
      flush();
      continue;
    }
    if (!current || !samePoint(lastPoint(current), segment[0])) {
      flush();
      current = [...segment[0], ...segment[1]];
    } else current.push(...segment[1]);
  }
  flush();
  return clipped;
}

export function clipToolpathGroups<T extends ToolpathGroupLike>(
  groups: readonly T[],
  width: number,
  height: number,
): T[] {
  const clipped: T[] = [];
  for (const group of groups) {
    const next = {
      ...group,
      runs: (group.runs || []).flatMap((run) => clipRunToRect(run, width, height)),
    } as T;
    if (next.runs?.length) clipped.push(next);
  }
  return clipped;
}

function routeDistance(runs: ToolpathRun[], start: Point): number {
  let total = 0,
    cursor = start;
  for (const run of runs) {
    total += distance(cursor, firstPoint(run));
    cursor = lastPoint(run);
  }
  return total;
}

export type OptimizedRuns = {
  runs: ToolpathRun[];
  sourceIndexes: number[][];
  end: Point;
  penUpDistance: number;
};

type IndexedRun = { points: ToolpathRun; sourceIndexes: number[] };

function mergeNearbyIndexedRuns(
  source: ToolpathRun[],
  tolerance: number,
  preserveDirection: boolean,
): IndexedRun[] {
  const indexed = source.map((points, index) => ({
    points: points.slice(),
    sourceIndexes: [index],
  }));
  if (tolerance <= 0) return indexed;
  const reverse = (run: IndexedRun): IndexedRun => ({
    points: reverseRun(run.points),
    sourceIndexes: run.sourceIndexes.slice().reverse(),
  });
  for (;;) {
    let best: { i: number; j: number; mode: number; gap: number } | null = null;
    for (let i = 0; i < indexed.length; i++) {
      const aStart = firstPoint(indexed[i].points);
      const aEnd = lastPoint(indexed[i].points);
      if (samePoint(aStart, aEnd)) continue;
      for (let j = i + 1; j < indexed.length; j++) {
        const bStart = firstPoint(indexed[j].points);
        const bEnd = lastPoint(indexed[j].points);
        if (samePoint(bStart, bEnd)) continue;
        const gaps = preserveDirection
          ? [distance(aEnd, bStart), Infinity, Infinity, distance(bEnd, aStart)]
          : [
              distance(aEnd, bStart),
              distance(aEnd, bEnd),
              distance(aStart, bStart),
              distance(aStart, bEnd),
            ];
        for (let mode = 0; mode < gaps.length; mode += 1)
          if (gaps[mode] <= tolerance && (!best || gaps[mode] < best.gap - 1e-12))
            best = { i, j, mode, gap: gaps[mode] };
      }
    }
    if (!best) return indexed;
    let a = indexed[best.i];
    let b = indexed[best.j];
    if (best.mode === 1) b = reverse(b);
    else if (best.mode === 2) a = reverse(a);
    else if (best.mode === 3) [a, b] = [b, a];
    const points = a.points.slice();
    if (!samePoint(lastPoint(a.points), firstPoint(b.points))) points.push(...firstPoint(b.points));
    points.push(...b.points.slice(2));
    indexed[best.i] = {
      points,
      sourceIndexes: [...a.sourceIndexes, ...b.sourceIndexes],
    };
    indexed.splice(best.j, 1);
  }
}

/** Greedy endpoint ordering followed by deterministic reversible 2-opt refinement. */
export function optimizeRuns(
  source: ToolpathRun[],
  start: Point = [0, 0],
  mergeTolerance = 0.15,
  preserveDirection = false,
): OptimizedRuns {
  const filteredSourceIndexes: number[] = [];
  const filtered = source.filter((run, index) => {
    if (run.length < 4) return false;
    filteredSourceIndexes.push(index);
    return true;
  });
  const remaining = mergeNearbyIndexedRuns(
    filtered,
    Math.max(0, mergeTolerance),
    preserveDirection,
  );
  const ordered: IndexedRun[] = [];
  let cursor: Point = [...start];
  while (remaining.length) {
    let bestIndex = 0,
      reverse = false,
      bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const startDistance = distance(cursor, firstPoint(remaining[i].points));
      const endDistance = preserveDirection
        ? Infinity
        : distance(cursor, lastPoint(remaining[i].points));
      if (startDistance < bestDistance) {
        bestDistance = startDistance;
        bestIndex = i;
        reverse = false;
      }
      if (endDistance < bestDistance) {
        bestDistance = endDistance;
        bestIndex = i;
        reverse = true;
      }
    }
    const next = remaining.splice(bestIndex, 1)[0];
    if (reverse) next.points = reverseRun(next.points);
    ordered.push(next);
    cursor = lastPoint(next.points);
  }

  for (let pass = 0; !preserveDirection && pass < 8; pass++) {
    let bestI = -1,
      bestK = -1,
      bestGain = 1e-9;
    for (let i = 0; i < ordered.length; i++) {
      const before = i === 0 ? start : lastPoint(ordered[i - 1].points);
      for (let k = i + 1; k < ordered.length; k++) {
        const after = k + 1 < ordered.length ? firstPoint(ordered[k + 1].points) : null;
        const oldCost =
          distance(before, firstPoint(ordered[i].points)) +
          (after ? distance(lastPoint(ordered[k].points), after) : 0);
        const newCost =
          distance(before, lastPoint(ordered[k].points)) +
          (after ? distance(firstPoint(ordered[i].points), after) : 0);
        const gain = oldCost - newCost;
        if (gain > bestGain) {
          bestGain = gain;
          bestI = i;
          bestK = k;
        }
      }
    }
    if (bestI < 0) break;
    const replacement = ordered
      .slice(bestI, bestK + 1)
      .reverse()
      .map((run) => ({
        points: reverseRun(run.points),
        sourceIndexes: run.sourceIndexes.slice().reverse(),
      }));
    ordered.splice(bestI, replacement.length, ...replacement);
  }

  const runs = ordered.map(({ points }) => points);
  const end = runs.length ? lastPoint(runs[runs.length - 1]) : start;
  return {
    runs,
    sourceIndexes: ordered.map(({ sourceIndexes }) =>
      sourceIndexes.map((index) => filteredSourceIndexes[index]),
    ),
    end,
    penUpDistance: routeDistance(runs, start),
  };
}
