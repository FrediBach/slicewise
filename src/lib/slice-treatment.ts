import { approximateClosedContour, CONTOUR_APPROXIMATION_LIMITS } from './contour-approximation';
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

export type PathApproximationSummary = {
  toleranceMm: number;
  maximumDeviationMm: number;
  inputVertices: number;
  outputVertices: number;
  work: number;
};
export type RoundedToolWorkload = { runs: number; vertices: number; primitiveTriangles: number };
export class RoundedToolBudgetError extends Error {
  constructor(
    public readonly approximation: PathApproximationSummary | null,
    public readonly workload: RoundedToolWorkload,
  ) {
    const exceeded: string[] = [];
    for (const key of Object.keys(ROUNDED_TOOL_LIMITS) as (keyof RoundedToolWorkload)[]) {
      if (workload[key] <= ROUNDED_TOOL_LIMITS[key]) continue;
      const label = {
        runs: 'tool loops',
        vertices: 'path vertices',
        primitiveTriangles: 'estimated construction triangles',
      }[key];
      exceeded.push(
        `${workload[key].toLocaleString('en-US')} ${label} (limit ${ROUNDED_TOOL_LIMITS[key].toLocaleString('en-US')})`,
      );
    }
    super(
      `Rounded tool budget exceeded: ${exceeded.join('; ')}. Reduce selected slices${approximation ? ' or circular tool radius' : ' or enable 0.05 mm contour approximation'}.`,
    );
    this.name = 'RoundedToolBudgetError';
  }
}

/** Conservative cumulative hull work, not the size of the final solid. */
export function roundedToolWorkload(
  runs: number,
  vertices: number,
  circularSegments: number,
): RoundedToolWorkload {
  return { runs, vertices, primitiveTriangles: vertices * (circularSegments ** 2 + 4) };
}
export function checkRoundedToolBudget(
  workload: RoundedToolWorkload,
  approximation: PathApproximationSummary | null,
) {
  if (
    (Object.keys(ROUNDED_TOOL_LIMITS) as (keyof RoundedToolWorkload)[]).some(
      (key) => workload[key] > ROUNDED_TOOL_LIMITS[key],
    )
  )
    throw new RoundedToolBudgetError(approximation, workload);
}
export type RoundedTreatmentRecipe = {
  approximation: PathApproximationSummary | null;
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
  vertices: 8_000,
  primitiveTriangles: 1_000_000,
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
  pathToleranceMm = 0,
): RoundedTreatmentRecipe {
  if (!Number.isFinite(radiusMm) || radiusMm < 0 || radiusMm > 10)
    throw new Error('Choose a circular tool radius from 0 to 10 mm.');
  if (!Number.isFinite(profileToleranceMm) || profileToleranceMm <= 0)
    throw new Error('Choose a positive finite profile tolerance.');
  if (!Number.isFinite(pathToleranceMm) || pathToleranceMm < 0)
    throw new Error('Path approximation tolerance must be finite and nonnegative.');
  const approximation: PathApproximationSummary | null =
    pathToleranceMm > 0
      ? {
          toleranceMm: pathToleranceMm,
          maximumDeviationMm: 0,
          inputVertices: 0,
          outputVertices: 0,
          work: 0,
        }
      : null;
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
  // Count before allocating paths. Exact paths can fail fast with complete counts;
  // approximate paths still enforce the loop cap before simplification work.
  let inputRuns = 0,
    inputVertices = 0;
  if (radiusMm > 0)
    for (const index of selectedSlices) {
      const slice = geometry.slices[index];
      inputRuns += slice.closed.length;
      for (let run = 0; run < slice.closed.length; run++)
        inputVertices += slice.runOffsets[run + 1] - slice.runOffsets[run] - 1;
    }
  checkRoundedToolBudget(
    roundedToolWorkload(inputRuns, approximation ? 0 : inputVertices, circularSegments),
    approximation,
  );
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
        const points = new Float64Array(count * 3);
        for (let i = 0; i < count; i++) {
          const point = slice.runPoints[start + i];
          points.set(slice.points.subarray(point * 3, point * 3 + 3), i * 3);
        }
        let output: Float64Array = points;
        if (approximation) {
          const simplified = approximateClosedContour(
            points,
            pathToleranceMm,
            CONTOUR_APPROXIMATION_LIMITS.work - approximation.work,
          );
          output = simplified.points;
          approximation.inputVertices += count;
          approximation.outputVertices += output.length / 3;
          approximation.maximumDeviationMm = Math.max(
            approximation.maximumDeviationMm,
            simplified.maximumDeviationMm,
          );
          approximation.work += simplified.work;
        }
        vertices += output.length / 3;
        runs.push(output);
      }
    }
  // Check the complete selected workload; never return a truncated recipe.
  checkRoundedToolBudget(
    roundedToolWorkload(runs.length, vertices, circularSegments),
    approximation,
  );
  return {
    approximation,
    sourceRevision: geometry.sourceRevision,
    radiusMm,
    profileToleranceMm,
    circularSegments,
    selectedSlices,
    runs,
  };
}
