import type { ThreeDArtifact, Triple } from './three-d-project';

export const DEFAULT_BUILD_VOLUME: Triple = [220, 220, 250];

export function validBuildVolume(value: unknown): value is Triple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 2000)
  );
}

export function buildVolumeBounds(size: Triple = DEFAULT_BUILD_VOLUME) {
  if (!validBuildVolume(size)) throw new Error('Choose build dimensions from 1 to 2000 mm.');
  return {
    min: [-size[0] / 2, -size[1] / 2, 0] as Triple,
    max: [size[0] / 2, size[1] / 2, size[2]] as Triple,
  };
}

export function fitsBuildVolume(artifact: Pick<ThreeDArtifact, 'min' | 'max'>, size?: Triple) {
  const { min, max } = buildVolumeBounds(size);
  return min.every((v, i) => artifact.min[i] >= v && artifact.max[i] <= max[i]);
}

/** Rectangular 10 mm grid, bounded to 402 interior lines plus four borders. */
export function buildVolumeGrid(size: Triple = DEFAULT_BUILD_VOLUME) {
  const { min, max } = buildVolumeBounds(size);
  const points: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    points.push(x1, y1, -0.05, x2, y2, -0.05);
  for (const x of [min[0], max[0]]) line(x, min[1], x, max[1]);
  for (const y of [min[1], max[1]]) line(min[0], y, max[0], y);
  for (let x = Math.ceil(min[0] / 10) * 10; x < max[0]; x += 10)
    if (x > min[0]) line(x, min[1], x, max[1]);
  for (let y = Math.ceil(min[1] / 10) * 10; y < max[1]; y += 10)
    if (y > min[1]) line(min[0], y, max[0], y);
  return Float32Array.from(points);
}
