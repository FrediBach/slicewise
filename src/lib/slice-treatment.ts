import type { extractPlanarSlices } from './slice-geometry';

export type SliceSelection =
  | { mode: 'all' }
  | { mode: 'range'; first: number; last: number }
  | { mode: 'every'; step: number; offset: number };

/** Zero-based ordered level indices, never individual disconnected loops. */
export function selectSliceIndices(count: number, selection: SliceSelection): number[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > 512)
    throw new Error('Invalid design slice count.');
  const all = Array.from({ length: count }, (_, i) => i);
  if (selection.mode === 'all') return all;
  if (selection.mode === 'range') {
    if (!Number.isSafeInteger(selection.first) || !Number.isSafeInteger(selection.last))
      throw new Error('Slice range indices must be integers.');
    // Intersect the requested range; an out-of-range selection remains empty.
    return all.filter(
      (i) => i >= Math.max(0, selection.first) && i <= Math.min(count - 1, selection.last),
    );
  }
  if (
    selection.mode !== 'every' ||
    !Number.isInteger(selection.step) ||
    selection.step < 1 ||
    selection.step > 32 ||
    !Number.isSafeInteger(selection.offset)
  )
    throw new Error('Choose an every-N step from 1 to 32 and an integer offset.');
  const offset = ((selection.offset % selection.step) + selection.step) % selection.step;
  return all.filter((i) => i % selection.step === offset);
}

export type RoundedTreatmentRecipe = {
  sourceRevision: number;
  /** Capsule radius; nominal width and penetration/protrusion remain coupled. */
  radiusMm: number;
  profileToleranceMm: number;
  circularSegments: number;
  selectedSlices: number[];
  /** Closed loops, without a repeated terminal point; coordinates remain in mm. */
  runs: Float64Array[];
};

export const ROUNDED_TOOL_LIMITS = {
  runs: 64,
  vertices: 2_000,
  primitiveTriangles: 250_000,
} as const;

/**
 * Circular capsule sweep feasibility only. No surface-normal or width guarantees
 * at corners, adjacent folds, or high curvature; no independent width/depth yet.
 */
export function createRoundedTreatmentRecipe(
  geometry: ReturnType<typeof extractPlanarSlices>,
  selection: SliceSelection,
  radiusMm: number,
  profileToleranceMm = 0.05,
): RoundedTreatmentRecipe {
  if (!Number.isFinite(radiusMm) || radiusMm < 0 || radiusMm > 10)
    throw new Error('Choose a circular tool radius from 0 to 10 mm.');
  if (!Number.isFinite(profileToleranceMm) || profileToleranceMm <= 0)
    throw new Error('Choose a positive finite profile tolerance.');
  const selectedSlices = selectSliceIndices(geometry.slices.length, selection);
  const circularSegments =
    radiusMm === 0
      ? 8
      : Math.max(
          8,
          Math.ceil((2 * Math.PI) / Math.acos(1 - Math.min(profileToleranceMm / radiusMm, 1)) / 4) *
            4,
        );
  if (circularSegments > 128)
    throw new Error('Profile tolerance exceeds the circular tool tessellation budget.');
  const runs: Float64Array[] = [];
  let vertices = 0;
  if (radiusMm > 0)
    for (const index of selectedSlices) {
      const slice = geometry.slices[index];
      for (let run = 0; run < slice.closed.length; run++) {
        if (!slice.closed[run])
          throw new Error(`Design slice ${index} has an open contour; closed runs are required.`);
        const start = slice.runOffsets[run],
          end = slice.runOffsets[run + 1] - 1;
        const count = end - start;
        if (count < 3) throw new Error(`Design slice ${index} has a degenerate contour.`);
        vertices += count;
        // A sphere has at most N²/4 + 2 vertices; a two-sphere convex hull has at most N² + 4 triangles.
        if (
          runs.length >= ROUNDED_TOOL_LIMITS.runs ||
          vertices > ROUNDED_TOOL_LIMITS.vertices ||
          vertices * (circularSegments ** 2 + 4) > ROUNDED_TOOL_LIMITS.primitiveTriangles
        )
          throw new Error(
            'Rounded tool budget exceeded. Reduce selected slices, mesh detail, or profile precision.',
          );
        const points = new Float64Array(count * 3);
        for (let i = 0; i < count; i++) {
          const point = slice.runPoints[start + i];
          points.set(slice.points.subarray(point * 3, point * 3 + 3), i * 3);
        }
        runs.push(points);
      }
    }
  return {
    sourceRevision: geometry.sourceRevision,
    radiusMm,
    profileToleranceMm,
    circularSegments,
    selectedSlices,
    runs,
  };
}
