export type ContourFeatureKey =
  | 'level'
  | 'pathCount'
  | 'length'
  | 'area'
  | 'centroidX'
  | 'centroidY'
  | 'closedness'
  | 'roughness';

export interface ContourSliceFeature {
  index: number;
  level: number;
  pathCount: number;
  length: number;
  area: number;
  centroidX: number;
  centroidY: number;
  closedness: number;
  roughness: number;
  /** Evenly spaced projected points along the slice's combined contour length. */
  trackPoints?: number[];
}

export interface ContourSequenceSource {
  version: 1;
  slices: ContourSliceFeature[];
}

type NumericPath = ArrayLike<number>;

const distance = (path: NumericPath, a: number, b: number): number =>
  Math.hypot(path[b * 2] - path[a * 2], path[b * 2 + 1] - path[a * 2 + 1]);

function isClosed(path: NumericPath): boolean {
  const points = Math.floor(path.length / 2);
  if (points < 4) return false;
  let scale = 1;
  for (let index = 0; index < path.length; index++)
    if (Number.isFinite(path[index])) scale = Math.max(scale, Math.abs(path[index]));
  return distance(path, 0, points - 1) <= scale * 1e-7;
}

function pathLength(path: NumericPath): number {
  let length = 0;
  for (let point = 1; point < Math.floor(path.length / 2); point++)
    length += distance(path, point - 1, point);
  return length;
}

function sampleTrackPoints(paths: readonly NumericPath[], sampleCount = 33): number[] {
  const segments: Array<{ ax: number; ay: number; bx: number; by: number; length: number }> = [];
  let totalLength = 0;
  for (const path of paths) {
    for (let point = 1; point < Math.floor(path.length / 2); point++) {
      const ax = path[(point - 1) * 2];
      const ay = path[(point - 1) * 2 + 1];
      const bx = path[point * 2];
      const by = path[point * 2 + 1];
      const length = Math.hypot(bx - ax, by - ay);
      if (!Number.isFinite(length) || length <= 1e-12) continue;
      segments.push({ ax, ay, bx, by, length });
      totalLength += length;
    }
  }
  if (!segments.length || totalLength <= 1e-12) return [];

  const points: number[] = [];
  let segmentIndex = 0;
  let segmentStart = 0;
  for (let sample = 0; sample < sampleCount; sample++) {
    const target = (sample / Math.max(1, sampleCount - 1)) * totalLength;
    while (
      segmentIndex < segments.length - 1 &&
      segmentStart + segments[segmentIndex].length < target
    ) {
      segmentStart += segments[segmentIndex].length;
      segmentIndex++;
    }
    const segment = segments[segmentIndex];
    const amount = Math.min(1, Math.max(0, (target - segmentStart) / segment.length));
    points.push(
      segment.ax + (segment.bx - segment.ax) * amount,
      segment.ay + (segment.by - segment.ay) * amount,
    );
  }
  return points;
}

/** Resolves a stable point along the projected contour, falling back to its centroid. */
export function contourTrackPoint(slice: ContourSliceFeature, position: number): [number, number] {
  const points = slice.trackPoints;
  const count = Math.floor((points?.length ?? 0) / 2);
  if (!points || count === 0) return [slice.centroidX, slice.centroidY];
  if (count === 1) return [points[0], points[1]];
  const exact = Math.min(1, Math.max(0, position / 100)) * (count - 1);
  const before = Math.floor(exact);
  const after = Math.min(count - 1, before + 1);
  const amount = exact - before;
  return [
    points[before * 2] + (points[after * 2] - points[before * 2]) * amount,
    points[before * 2 + 1] + (points[after * 2 + 1] - points[before * 2 + 1]) * amount,
  ];
}

function pathArea(path: NumericPath): number {
  if (!isClosed(path)) return 0;
  let twiceArea = 0;
  const points = Math.floor(path.length / 2) - 1;
  for (let point = 0; point < points; point++) {
    const next = (point + 1) % points;
    twiceArea += path[point * 2] * path[next * 2 + 1] - path[next * 2] * path[point * 2 + 1];
  }
  return Math.abs(twiceArea) / 2;
}

function pathRoughness(path: NumericPath): { turns: number; count: number } {
  const points = Math.floor(path.length / 2);
  const closed = isClosed(path);
  const uniquePoints = closed ? points - 1 : points;
  if (uniquePoints < 3) return { turns: 0, count: 0 };
  let turns = 0;
  let count = 0;
  const first = closed ? 0 : 1;
  const last = closed ? uniquePoints : uniquePoints - 1;
  for (let point = first; point < last; point++) {
    const previous = (point - 1 + uniquePoints) % uniquePoints;
    const next = (point + 1) % uniquePoints;
    const ax = path[point * 2] - path[previous * 2];
    const ay = path[point * 2 + 1] - path[previous * 2 + 1];
    const bx = path[next * 2] - path[point * 2];
    const by = path[next * 2 + 1] - path[point * 2 + 1];
    const aLength = Math.hypot(ax, ay);
    const bLength = Math.hypot(bx, by);
    if (aLength <= 1e-12 || bLength <= 1e-12) continue;
    const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLength * bLength)));
    turns += Math.acos(cosine) / Math.PI;
    count++;
  }
  return { turns, count };
}

/** Measures projected, visibility-filtered paths before decorative output effects. */
export function measureContourSlice(
  index: number,
  level: number,
  paths: readonly NumericPath[],
): ContourSliceFeature {
  let length = 0;
  let closedLength = 0;
  let centroidX = 0;
  let centroidY = 0;
  let turns = 0;
  let turnCount = 0;
  let pathCount = 0;
  let area = 0;

  for (const path of paths) {
    const points = Math.floor(path.length / 2);
    if (points < 2) continue;
    const currentLength = pathLength(path);
    if (!Number.isFinite(currentLength) || currentLength <= 1e-12) continue;
    pathCount++;
    length += currentLength;
    if (isClosed(path)) closedLength += currentLength;
    area += pathArea(path);
    for (let point = 1; point < points; point++) {
      const segmentLength = distance(path, point - 1, point);
      centroidX += ((path[(point - 1) * 2] + path[point * 2]) / 2) * segmentLength;
      centroidY += ((path[(point - 1) * 2 + 1] + path[point * 2 + 1]) / 2) * segmentLength;
    }
    const roughness = pathRoughness(path);
    turns += roughness.turns;
    turnCount += roughness.count;
  }

  return {
    index,
    level: Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0,
    pathCount,
    length,
    area,
    centroidX: length ? centroidX / length : 0,
    centroidY: length ? centroidY / length : 0,
    closedness: length ? closedLength / length : 0,
    roughness: turnCount ? turns / turnCount : 0,
    trackPoints: sampleTrackPoints(paths),
  };
}

export function averageContourSequenceSources(
  sources: readonly (ContourSequenceSource | undefined)[],
): ContourSequenceSource | undefined {
  const available = sources.filter((source): source is ContourSequenceSource => Boolean(source));
  if (!available.length) return undefined;
  const indexes = new Set(available.flatMap((source) => source.slices.map((slice) => slice.index)));
  const slices = [...indexes]
    .sort((a, b) => a - b)
    .map((index) => {
      const matching = available.flatMap((source) =>
        source.slices.filter((slice) => slice.index === index),
      );
      const average = (key: Exclude<keyof ContourSliceFeature, 'trackPoints'>): number =>
        matching.reduce((sum, slice) => sum + slice[key], 0) / matching.length;
      return {
        index,
        level: average('level'),
        pathCount: average('pathCount'),
        length: average('length'),
        area: average('area'),
        centroidX: average('centroidX'),
        centroidY: average('centroidY'),
        closedness: average('closedness'),
        roughness: average('roughness'),
        trackPoints: Array.from({ length: 66 }, (_, point) => {
          const axis = point % 2;
          const position = (Math.floor(point / 2) / 32) * 100;
          return (
            matching.reduce((sum, slice) => sum + contourTrackPoint(slice, position)[axis], 0) /
            matching.length
          );
        }),
      };
    });
  return { version: 1, slices };
}
