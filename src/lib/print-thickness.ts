import type { TopologyMesh } from './mesh-topology';

type Vec = [number, number, number];
export const PRINT_THICKNESS_LIMITS = {
  samples: 256,
  work: 2_000_000,
  triangles: 250_000,
} as const;
export type PrintThicknessSettings = {
  maxSamples: number;
  minimumMm: number;
  /** Output triangle IDs to sample first, for caller-identified treatment regions.
   * They must all fit the sample budget; none are silently dropped. */
  priorityTriangles?: readonly number[];
};
export type ThicknessSample = {
  triangle: number;
  priority: boolean;
  point: Vec;
  distanceMm: number | null;
  oppositeTriangle: number | null;
  unresolved: 'work-budget' | 'no-hit' | 'ambiguous-hit' | 'near-origin' | null;
};
export type PrintThicknessReport = {
  status: 'sampled' | 'partial' | 'unavailable';
  method: 'inward-normal-at-fixed-barycentrics';
  barycentrics: Vec;
  settings: PrintThicknessSettings;
  toleranceMm: number;
  work: number;
  budgetExhausted: boolean;
  resolvedCount: number;
  minimumMeasuredMm: number | null;
  belowMinimumCount: number;
  triangleCount: number;
  /** Area of faces with a resolved interior ray divided by total surface area.
   * This is NOT the fraction of surface whose thickness has been established. */
  resolvedTriangleAreaFraction: number;
  samples: ThicknessSample[];
};
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function validateThicknessSettings(settings: PrintThicknessSettings, triangleCount: number) {
  if (
    !Number.isInteger(settings.maxSamples) ||
    settings.maxSamples < 1 ||
    settings.maxSamples > PRINT_THICKNESS_LIMITS.samples
  )
    throw new Error('Thickness samples must be between 1 and 256.');
  if (!Number.isFinite(settings.minimumMm) || settings.minimumMm <= 0)
    throw new Error('Minimum thickness assumption must be positive finite millimeters.');
  const priority = settings.priorityTriangles ?? [];
  if (
    priority.length > settings.maxSamples ||
    new Set(priority).size !== priority.length ||
    priority.some((f) => !Number.isInteger(f) || f < 0 || f >= triangleCount)
  )
    throw new Error(
      'Priority triangles must be unique valid output face IDs within the sample budget.',
    );
}

/** Requires an already audited, oriented closed solid, including cavity winding.
 * Each inward interior ray stops at the first boundary. Edge/grazing/near-origin
 * hits are unresolved instead of being skipped in favor of a farther wall.
 * Finite deterministic sampling estimates normal chords, not global minima or
 * structural strength. All selection and triangle-query work is bounded.
 */
export function samplePrintThickness(
  mesh: TopologyMesh,
  settings: PrintThicknessSettings,
  toleranceMm: number,
  workLimit: number = PRINT_THICKNESS_LIMITS.work,
): PrintThicknessReport {
  const { V, T } = mesh,
    count = T.length / 3;
  validateThicknessSettings(settings, count);
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0)
    throw new Error('Invalid thickness coordinate tolerance.');
  if (!Number.isSafeInteger(workLimit) || workLimit < 0 || workLimit > PRINT_THICKNESS_LIMITS.work)
    throw new Error('Invalid thickness work budget.');
  if (!Number.isInteger(count) || count < 1 || count > PRINT_THICKNESS_LIMITS.triangles)
    throw new Error('Thickness triangle budget exceeded.');
  const priority = new Set(settings.priorityTriangles ?? []);
  const selected = [...priority],
    selectedSet = new Set(selected);
  const target = Math.min(settings.maxSamples, count);
  // Equal-index strata are reproducible but are not an area-weighted or adaptive
  // guarantee. Priority IDs explicitly reserve room for important output regions.
  for (let i = 0; i < target; i++) {
    const f = Math.floor(((i + 0.5) * count) / target);
    if (selected.length < target && !selectedSet.has(f)) {
      selected.push(f);
      selectedSet.add(f);
    }
  }
  for (let f = 0; selected.length < target; f++)
    if (!selectedSet.has(f)) {
      selected.push(f);
      selectedSet.add(f);
    }
  const vertex = (id: number): Vec => [V[id * 3], V[id * 3 + 1], V[id * 3 + 2]];
  const face = (f: number) => [vertex(T[f * 3]), vertex(T[f * 3 + 1]), vertex(T[f * 3 + 2])];
  const bounds = new Float64Array(count * 6),
    areas = new Float64Array(count);
  let totalArea = 0;
  for (let f = 0; f < count; f++) {
    const [a, b, c] = face(f);
    areas[f] = Math.hypot(...cross(sub(b, a), sub(c, a))) / 2;
    totalArea += areas[f];
    for (let axis = 0; axis < 3; axis++) {
      bounds[f * 6 + axis] = Math.min(a[axis], b[axis], c[axis]);
      bounds[f * 6 + axis + 3] = Math.max(a[axis], b[axis], c[axis]);
    }
  }
  const samples: ThicknessSample[] = [];
  let work = 0,
    budgetExhausted = false,
    resolvedArea = 0;
  for (const source of selected) {
    const [a, b, c] = face(source),
      normal = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(...normal),
      direction = normal.map((v) => -v / length) as Vec;
    const point = a.map((v, i) => v + (b[i] - v) / 3 + (c[i] - v) / 6) as Vec;
    const sample: ThicknessSample = {
      triangle: source,
      priority: priority.has(source),
      point,
      distanceMm: null,
      oppositeTriangle: null,
      unresolved: 'no-hit',
    };
    let nearest = Infinity,
      hit: number | null = null,
      reliable = false;
    for (let f = 0; f < count; f++) {
      if (work >= workLimit) {
        budgetExhausted = true;
        sample.unresolved = 'work-budget';
        break;
      }
      work++;
      if (f === source) continue;
      let near = 0,
        far = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const lo = bounds[f * 6 + axis] - toleranceMm,
          hi = bounds[f * 6 + axis + 3] + toleranceMm;
        if (direction[axis] === 0) {
          if (point[axis] < lo || point[axis] > hi) {
            far = -1;
            break;
          }
        } else {
          const t0 = (lo - point[axis]) / direction[axis],
            t1 = (hi - point[axis]) / direction[axis];
          near = Math.max(near, Math.min(t0, t1));
          far = Math.min(far, Math.max(t0, t1));
        }
      }
      if (near > far || near > nearest + toleranceMm) continue;
      const [p, q, r] = face(f),
        e1 = sub(q, p),
        e2 = sub(r, p),
        n = cross(e1, e2);
      const h = cross(direction, e2),
        det = dot(e1, h),
        offset = sub(point, p);
      const area2 = Math.hypot(...n);
      if (Math.abs(det) <= 64 * Number.EPSILON * area2) {
        if (Math.abs(dot(offset, n)) > toleranceMm * area2) continue;
        // A coplanar/grazing candidate cannot establish a dependable exit.
        if (near <= nearest) {
          nearest = near;
          hit = f;
          reliable = false;
        }
        continue;
      }
      const u = dot(offset, h) / det,
        k = cross(offset, e1),
        v = dot(direction, k) / det;
      const baryTolerance = Math.max(
        64 * Number.EPSILON,
        toleranceMm / Math.min(Math.hypot(...e1), Math.hypot(...e2)),
      );
      if (u < -baryTolerance || v < -baryTolerance || u + v > 1 + baryTolerance) continue;
      const distance = dot(e2, k) / det;
      if (!Number.isFinite(distance) || distance < -toleranceMm || distance > nearest + toleranceMm)
        continue;
      const trustworthy =
        Math.min(u, v, 1 - u - v) > baryTolerance &&
        dot(direction, n) > 64 * Number.EPSILON * area2;
      if (distance < nearest - toleranceMm) {
        nearest = Math.max(0, distance);
        hit = f;
        reliable = trustworthy;
      } else {
        reliable = reliable && trustworthy;
      }
    }
    if (!budgetExhausted && hit !== null) {
      sample.oppositeTriangle = hit;
      if (nearest <= toleranceMm) sample.unresolved = 'near-origin';
      else if (!reliable) sample.unresolved = 'ambiguous-hit';
      else {
        sample.distanceMm = nearest;
        sample.unresolved = null;
        resolvedArea += areas[source];
      }
    }
    samples.push(sample);
  }
  const resolved = samples.filter((s) => s.distanceMm !== null);
  return {
    status: !resolved.length
      ? 'unavailable'
      : resolved.length === samples.length
        ? 'sampled'
        : 'partial',
    method: 'inward-normal-at-fixed-barycentrics',
    barycentrics: [1 / 2, 1 / 3, 1 / 6],
    settings: { ...settings, priorityTriangles: [...priority] },
    toleranceMm,
    work,
    budgetExhausted,
    resolvedCount: resolved.length,
    minimumMeasuredMm: resolved.length ? Math.min(...resolved.map((s) => s.distanceMm!)) : null,
    belowMinimumCount: resolved.reduce(
      (n, s) => n + (s.distanceMm! < settings.minimumMm ? 1 : 0),
      0,
    ),
    triangleCount: count,
    resolvedTriangleAreaFraction:
      Number.isFinite(totalArea) && totalArea > 0 ? resolvedArea / totalArea : 0,
    samples,
  };
}
