import { fadeSliceRay, sliceRayReach } from './slice-rays';
import { resolveSliceRaySettings, type SliceRaySettings } from './slice-rays-settings';
import { getMeshTopology, type TopologyMesh } from './mesh-topology';

type Point = [number, number, number];
type Gradient = (x: number, y: number, z: number) => Point | null;
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const at = (values: ArrayLike<number>, i: number): Point => [
  values[i * 3],
  values[i * 3 + 1],
  values[i * 3 + 2],
];
const unit = (p: Point): Point | null => {
  const length = Math.hypot(...p);
  return Number.isFinite(length) && length > 1e-10 ? (p.map((v) => v / length) as Point) : null;
};

const orientationCache = new WeakMap<TopologyMesh, number>();
/** Some imports and demos wind closed meshes inward. Open surfaces retain their
 * authored side because signed volume does not define their inside/outside. */
function outwardOrientation(mesh: TopologyMesh): number {
  const cached = orientationCache.get(mesh);
  if (cached !== undefined) return cached;
  const topology = getMeshTopology(mesh);
  let volume = 0;
  if (!topology.boundaryEdges.length && !topology.nonManifoldEdges.length) {
    for (let i = 0; i + 2 < mesh.T.length; i += 3) {
      const a = at(mesh.V, mesh.T[i]),
        b = at(mesh.V, mesh.T[i + 1]),
        c = at(mesh.V, mesh.T[i + 2]);
      const contribution =
        a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
      if (Number.isFinite(contribution)) volume += contribution;
    }
  }
  const orientation = volume < -1e-12 ? -1 : 1;
  orientationCache.set(mesh, orientation);
  return orientation;
}

/** Capture source-surface normals while triangle ownership is still available.
 * Barycentric interpolation uses vertex normals when present, face winding otherwise.
 */
export function createSliceNormalCollector(mesh: {
  V: ArrayLike<number>;
  T?: ArrayLike<number>;
  N?: ArrayLike<number>;
  preserveSurface?: boolean;
}) {
  const normals: number[] = [];
  const orientation = mesh.T ? outwardOrientation(mesh as TopologyMesh) : 1;
  let sample: (p: Point) => Point | null = () => null;
  return {
    normals,
    triangle(a: number, b: number, c: number) {
      const origin = at(mesh.V, a),
        ab = subtract(at(mesh.V, b), origin),
        ac = subtract(at(mesh.V, c), origin);
      const face = unit([
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ]);
      const d00 = dot(ab, ab),
        d01 = dot(ab, ac),
        d11 = dot(ac, ac),
        denominator = d00 * d11 - d01 * d01;
      const na = mesh.N && at(mesh.N, a),
        nb = mesh.N && at(mesh.N, b),
        nc = mesh.N && at(mesh.N, c);
      sample = (p) => {
        if (!na || !nb || !nc || mesh.preserveSurface || Math.abs(denominator) < 1e-20) return face;
        const offset = subtract(p, origin);
        const v = (d11 * dot(offset, ab) - d01 * dot(offset, ac)) / denominator;
        const w = (d00 * dot(offset, ac) - d01 * dot(offset, ab)) / denominator;
        return (
          unit(na.map((value, k) => value * (1 - v - w) + nb[k] * v + nc[k] * w) as Point) ?? face
        );
      };
    },
    add(index: number, points: ArrayLike<number>) {
      const normal = sample(at(points, index));
      for (let k = 0; k < 3; k++)
        normals[index * 3 + k] = (normals[index * 3 + k] ?? 0) + (normal?.[k] ?? 0) * orientation;
    },
  };
}

export interface SurfaceSliceRay {
  points: number[];
  outputPoints: number[];
}

/** Straight local rays for curved and intrinsic fields. Unlike planar parity,
 * source normals also define an outward side for open contour runs.
 */
export function createSurfaceSliceRays(
  points: ArrayLike<number>,
  polylines: readonly (readonly number[])[],
  normals: ArrayLike<number>,
  gradient: Gradient | undefined,
  settings: Partial<SliceRaySettings>,
  salt = 0,
  outputPoints: ArrayLike<number> = points,
  directionMode: 'tangent' | 'from-origin' = 'tangent',
): SurfaceSliceRay[] {
  const s = resolveSliceRaySettings(settings);
  if (!s.sliceRays || !s.sliceRayAmount || !s.sliceRayLength) return [];
  const edges: { a: number; b: number; length: number }[] = [];
  let total = 0;
  for (const poly of polylines)
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1],
        b = poly[i],
        length = Math.hypot(...subtract(at(points, b), at(points, a)));
      if (!Number.isFinite(length) || length < 1e-10) continue;
      edges.push({ a, b, length });
      total += length;
    }
  if (!edges.length || !Number.isFinite(total)) return [];
  const result: SurfaceSliceRay[] = [];
  let edgeIndex = 0,
    traversed = 0;
  for (let i = 0; i < s.sliceRayAmount; i++) {
    const distance = ((i + 0.5) / s.sliceRayAmount) * total;
    while (edgeIndex < edges.length - 1 && traversed + edges[edgeIndex].length < distance)
      traversed += edges[edgeIndex++].length;
    const { a, b, length } = edges[edgeIndex];
    const t = Math.max(1e-5, Math.min(1 - 1e-5, (distance - traversed) / length));
    const interpolate = (values: ArrayLike<number>): Point =>
      at(values, a).map((v, k) => v + (values[b * 3 + k] - v) * t) as Point;
    const origin = interpolate(points);
    const na = unit(at(normals, a)),
      nb = unit(at(normals, b));
    if (!na || !nb) continue;
    const normal = unit(na.map((v, k) => v + (nb[k] - v) * t) as Point);
    if (!normal) continue;
    const tangent = unit(subtract(at(points, b), at(points, a)))!;
    let direction: Point | null;
    if (gradient) {
      const g = gradient(...origin),
        n = g && unit(g);
      if (!n) continue;
      if (directionMode === 'from-origin') {
        // The distance-field gradient travels away from the spherical source
        // or cylindrical axis. Keep only exit crossings; never flip entry rays.
        if (dot(n, normal) <= 1e-7) continue;
        direction = n;
      } else {
        direction = unit([
          tangent[1] * n[2] - tangent[2] * n[1],
          tangent[2] * n[0] - tangent[0] * n[2],
          tangent[0] * n[1] - tangent[1] * n[0],
        ]);
        if (!direction || Math.abs(dot(direction, normal)) < 1e-7) continue;
        if (dot(direction, normal) < 0) direction = direction.map((v) => -v) as Point;
      }
    } else {
      const along = dot(normal, tangent);
      direction = unit(normal.map((v, k) => v - along * tangent[k]) as Point);
    }
    if (!direction) continue;
    // Every dash receives the same interpolated root translation. This keeps
    // curved-field explosion attached to the contour instead of shearing rays.
    const shift = subtract(interpolate(outputPoints), origin);
    if (!shift.every(Number.isFinite)) continue;
    for (const run of fadeSliceRay(origin, direction, sliceRayReach(s, i, salt), s.sliceRayFade))
      result.push({ points: run, outputPoints: run.map((v, k) => v + shift[k % 3]) });
  }
  return result;
}
