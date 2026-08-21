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

function mergeNearbyRuns(source: ToolpathRun[], tolerance: number): ToolpathRun[] {
  const runs = source.map((run) => run.slice());
  if (tolerance <= 0) return runs;
  for (;;) {
    let best: { i: number; j: number; mode: number; gap: number } | null = null;
    for (let i = 0; i < runs.length; i++) {
      const aStart = firstPoint(runs[i]),
        aEnd = lastPoint(runs[i]);
      if (samePoint(aStart, aEnd)) continue;
      for (let j = i + 1; j < runs.length; j++) {
        const bStart = firstPoint(runs[j]),
          bEnd = lastPoint(runs[j]);
        if (samePoint(bStart, bEnd)) continue;
        const gaps = [
          distance(aEnd, bStart),
          distance(aEnd, bEnd),
          distance(aStart, bStart),
          distance(aStart, bEnd),
        ];
        for (let mode = 0; mode < gaps.length; mode++)
          if (gaps[mode] <= tolerance && (!best || gaps[mode] < best.gap - 1e-12))
            best = { i, j, mode, gap: gaps[mode] };
      }
    }
    if (!best) return runs;
    let a = runs[best.i],
      b = runs[best.j];
    if (best.mode === 1) b = reverseRun(b);
    else if (best.mode === 2) a = reverseRun(a);
    else if (best.mode === 3) [a, b] = [b, a];
    const joined = a.slice();
    if (!samePoint(lastPoint(a), firstPoint(b))) joined.push(...firstPoint(b));
    joined.push(...b.slice(2));
    runs[best.i] = joined;
    runs.splice(best.j, 1);
  }
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
  end: Point;
  penUpDistance: number;
};

/** Greedy endpoint ordering followed by deterministic reversible 2-opt refinement. */
export function optimizeRuns(
  source: ToolpathRun[],
  start: Point = [0, 0],
  mergeTolerance = 0.15,
): OptimizedRuns {
  const remaining = mergeNearbyRuns(
    source.filter((run) => run.length >= 4),
    Math.max(0, mergeTolerance),
  );
  const ordered: ToolpathRun[] = [];
  let cursor: Point = [...start];
  while (remaining.length) {
    let bestIndex = 0,
      reverse = false,
      bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const startDistance = distance(cursor, firstPoint(remaining[i]));
      const endDistance = distance(cursor, lastPoint(remaining[i]));
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
    let next = remaining.splice(bestIndex, 1)[0];
    if (reverse) next = reverseRun(next);
    ordered.push(next);
    cursor = lastPoint(next);
  }

  for (let pass = 0; pass < 8; pass++) {
    let bestI = -1,
      bestK = -1,
      bestGain = 1e-9;
    for (let i = 0; i < ordered.length; i++) {
      const before = i === 0 ? start : lastPoint(ordered[i - 1]);
      for (let k = i + 1; k < ordered.length; k++) {
        const after = k + 1 < ordered.length ? firstPoint(ordered[k + 1]) : null;
        const oldCost =
          distance(before, firstPoint(ordered[i])) +
          (after ? distance(lastPoint(ordered[k]), after) : 0);
        const newCost =
          distance(before, lastPoint(ordered[k])) +
          (after ? distance(firstPoint(ordered[i]), after) : 0);
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
      .map(reverseRun);
    ordered.splice(bestI, replacement.length, ...replacement);
  }

  const end = ordered.length ? lastPoint(ordered[ordered.length - 1]) : start;
  return { runs: ordered, end, penUpDistance: routeDistance(ordered, start) };
}
