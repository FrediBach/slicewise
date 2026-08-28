export type SampleAndHoldAxis = 'x' | 'y';

export interface SampleAndHoldSettings {
  sampleAndHold: boolean;
  sampleAndHoldAxis: SampleAndHoldAxis | string;
  sampleAndHoldSpacing: number;
  sampleAndHoldLength: number;
  sampleAndHoldMix: number;
}

const EPSILON = 1e-8;
const MAX_UNIQUE_SAMPLES = 8192;
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function cumulativeDistances(run: readonly number[]): number[] {
  const distances = [0];
  for (let index = 2; index + 1 < run.length; index += 2)
    distances.push(
      distances.at(-1)! + Math.hypot(run[index] - run[index - 2], run[index + 1] - run[index - 1]),
    );
  return distances;
}

function pointAtDistance(
  run: readonly number[],
  distances: readonly number[],
  distance: number,
  cursor: { index: number },
): [number, number] {
  while (cursor.index < distances.length - 1 && distances[cursor.index] < distance - EPSILON)
    cursor.index++;
  const endIndex = cursor.index;
  if (endIndex <= 0) return [run[0], run[1]];
  const startIndex = endIndex - 1;
  const span = distances[endIndex] - distances[startIndex];
  const position = span ? (distance - distances[startIndex]) / span : 0;
  return [
    run[startIndex * 2] + (run[endIndex * 2] - run[startIndex * 2]) * position,
    run[startIndex * 2 + 1] + (run[endIndex * 2 + 1] - run[startIndex * 2 + 1]) * position,
  ];
}

/** Resample a run by arc length and hold one coordinate for fixed-size sample groups. */
export function sampleAndHoldPolyline(
  run: readonly number[],
  settings: SampleAndHoldSettings,
): number[] {
  const mix = clamp((Number(settings.sampleAndHoldMix) || 0) / 100, 0, 1);
  if (!settings.sampleAndHold || !mix || run.length < 4) return run.slice();
  const distances = cumulativeDistances(run);
  const total = distances.at(-1) || 0;
  if (total <= EPSILON) return run.slice();
  const spacing = clamp(Number(settings.sampleAndHoldSpacing) || 0, 0.2, 20);
  const holdLength = clamp(Math.round(Number(settings.sampleAndHoldLength) || 0), 2, 32);
  const pointCount = run.length / 2;
  const closed =
    pointCount > 3 &&
    Math.hypot(run[0] - run[run.length - 2], run[1] - run[run.length - 1]) <= 1e-5;
  const maxDivisions = MAX_UNIQUE_SAMPLES - 1;
  let divisions = clamp(Math.ceil(total / spacing), 1, maxDivisions);
  if (closed) {
    divisions = Math.max(holdLength, Math.ceil(divisions / holdLength) * holdLength);
    if (divisions > maxDivisions) divisions = Math.floor(maxDivisions / holdLength) * holdLength;
  }
  const uniqueSamples = closed ? divisions : divisions + 1;
  const samples: Array<[number, number]> = [];
  const cursor = { index: 1 };
  for (let index = 0; index < uniqueSamples; index++)
    samples.push(pointAtDistance(run, distances, (total * index) / divisions, cursor));

  const axis = settings.sampleAndHoldAxis === 'x' ? 0 : 1;
  const result: number[] = [];
  for (let index = 0; index < samples.length; index++) {
    const point = samples[index].slice() as [number, number];
    const held = samples[Math.floor(index / holdLength) * holdLength][axis];
    point[axis] += (held - point[axis]) * mix;
    const lastX = result.at(-2);
    const lastY = result.at(-1);
    if (lastX === undefined || Math.hypot(point[0] - lastX, point[1] - lastY) > EPSILON)
      result.push(point[0], point[1]);
  }
  if (result.length < 4) return run.slice();
  if (closed && Math.hypot(result[0] - result.at(-2)!, result[1] - result.at(-1)!) > EPSILON)
    result.push(result[0], result[1]);
  return result;
}

export function applySampleAndHold(
  runs: readonly number[][],
  settings: SampleAndHoldSettings,
): number[][] {
  return runs.map((run) => sampleAndHoldPolyline(run, settings));
}
