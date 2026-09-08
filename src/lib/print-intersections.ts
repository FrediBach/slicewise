import { exactAdjacentOverlap } from './exact-adjacent-overlap';
import type { TopologyMesh } from './mesh-topology';

export const PRINT_INTERSECTION_LIMITS = {
  triangles: 500_000,
  work: 20_000_000,
  samples: 32,
} as const;
export type PrintIntersectionReport = {
  status: 'passed' | 'failed' | 'budget-exceeded';
  /** Nonadjacent proximity remains conservative; adjacent candidates use exact signs. */
  toleranceMm: number;
  pairCount: number;
  adjacentPairCount: number;
  nonAdjacentPairCount: number;
  /** Flat pairs of triangle IDs, bounded independently of the full count. */
  trianglePairs: Uint32Array;
  /** False means work stopped early; pairCount is then only a lower bound. */
  complete: boolean;
  work: number;
};

type Vec = [number, number, number];
type Triangle = [Vec, Vec, Vec];
type Node = { bounds: number[]; start: number; end: number; left?: Node; right?: Node };
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const subtract = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const edges = (t: Triangle): Triangle => [
  subtract(t[1], t[0]),
  subtract(t[2], t[1]),
  subtract(t[0], t[2]),
];

/** Separating axes for triangles, including in-plane axes for coplanar pairs.
 * See https://www.geometrictools.com/Documentation/MethodOfSeparatingAxes.pdf.
 * This is a conservative floating-point test, not an exact predicate.
 */
function mayContact(a: Triangle, b: Triangle, tolerance: number) {
  const origin = a[0];
  a = a.map((v) => subtract(v, origin)) as Triangle;
  b = b.map((v) => subtract(v, origin)) as Triangle;
  const ae = edges(a),
    be = edges(b);
  const an = cross(ae[0], ae[1]),
    bn = cross(be[0], be[1]);
  const separates = (axis: Vec) => {
    const length = Math.hypot(...axis);
    if (!length || !Number.isFinite(length)) return false;
    const n = axis.map((v) => v / length) as Vec;
    const projection = (v: Vec) => v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    const ap = a.map(projection),
      bp = b.map(projection);
    return (
      Math.max(...ap) < Math.min(...bp) - tolerance || Math.max(...bp) < Math.min(...ap) - tolerance
    );
  };
  if (separates(an) || separates(bn)) return false;
  for (const e of ae) for (const f of be) if (separates(cross(e, f))) return false;
  for (const e of ae) if (separates(cross(an, e))) return false;
  for (const e of be) if (separates(cross(bn, e))) return false;
  return true;
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec): Vec => {
  const length = Math.hypot(...v);
  return v.map((x) => x / length) as Vec;
};

/** Shared IDs occur first in both triangles. For a shared vertex, intersect the
 * two triangle direction cones at that vertex. Nonparallel planes can share only
 * their intersection line; coplanar cones overlap iff an edge ray lies in the
 * other cone. A shared edge permits different planes or opposite coplanar sides.
 * This floating-point filter sends uncertain overlaps to an exact dyadic predicate.
 */
function approximateAdjacentOverlap(a: Triangle, b: Triangle, shared: number, tolerance: number) {
  if (shared === 3) return true;
  const ar = [subtract(a[1], a[0]), subtract(a[2], a[0])];
  const br = [subtract(b[1], b[0]), subtract(b[2], b[0])];
  const minimumLength = Math.min(
    ...ar.map((r) => Math.hypot(...r)),
    ...br.map((r) => Math.hypot(...r)),
  );
  if (minimumLength <= tolerance) return true;
  const angularTolerance = Math.max(64 * Number.EPSILON, tolerance / minimumLength);
  const au = ar.map(unit),
    bu = br.map(unit);
  const ac = cross(au[0], au[1]),
    bc = cross(bu[0], bu[1]);
  if (Math.min(Math.hypot(...ac), Math.hypot(...bc)) <= angularTolerance) return true;
  const an = unit(ac),
    bn = unit(bc);
  if (shared === 2) {
    if (Math.abs(dot(br[1], an)) > tolerance || Math.abs(dot(ar[1], bn)) > tolerance) return false;
    return dot(an, bn) >= 0;
  }
  const inCone = (ray: Vec, rays: Vec[], normal: Vec) =>
    dot(cross(rays[0], ray), normal) >= -angularTolerance &&
    dot(cross(ray, rays[1]), normal) >= -angularTolerance;
  const line = cross(an, bn);
  if (Math.hypot(...line) > angularTolerance) {
    const direction = unit(line),
      opposite = direction.map((x) => -x) as Vec;
    return (
      (inCone(direction, au, an) && inCone(direction, bu, bn)) ||
      (inCone(opposite, au, an) && inCone(opposite, bu, bn))
    );
  }
  return au.some((ray) => inCone(ray, bu, bn)) || bu.some((ray) => inCone(ray, au, an));
}

function adjacentMayOverlap(a: Triangle, b: Triangle, shared: number, tolerance: number) {
  return approximateAdjacentOverlap(a, b, shared, tolerance) && exactAdjacentOverlap(a, b, shared);
}

/**
 * Requires finite, indexed, nondegenerate triangles (the topology auditor checks
 * those first). Shared vertices/edges are allowed only when adjacent faces do
 * not overlap beyond them. Shell nesting is not tested. No input or cache is
 * mutated. A deterministic median BVH bounds work on spatially separated faces.
 */
export function auditSurfaceIntersections(
  mesh: TopologyMesh,
  workLimit: number = PRINT_INTERSECTION_LIMITS.work,
): PrintIntersectionReport {
  if (
    !Number.isSafeInteger(workLimit) ||
    workLimit < 0 ||
    workLimit > PRINT_INTERSECTION_LIMITS.work
  )
    throw new Error('Intersection work limit must be an integer within the supported budget.');
  const { V, T } = mesh;
  const count = T.length / 3;
  const pairs: number[] = [];
  let pairCount = 0,
    adjacentPairCount = 0,
    nonAdjacentPairCount = 0,
    work = 0;
  let toleranceMm = 1e-10,
    magnitude = 0;
  const finish = (complete: boolean): PrintIntersectionReport => ({
    status: !complete ? 'budget-exceeded' : pairCount ? 'failed' : 'passed',
    toleranceMm,
    pairCount,
    adjacentPairCount,
    nonAdjacentPairCount,
    trianglePairs: Uint32Array.from(pairs),
    complete,
    work,
  });
  if (!Number.isSafeInteger(count) || count > PRINT_INTERSECTION_LIMITS.triangles)
    return finish(false);
  if (count < 2) return finish(true);
  const bounds = new Float64Array(count * 6);
  const order = Uint32Array.from({ length: count }, (_, i) => i);
  for (let f = 0; f < count; f++) {
    for (let axis = 0; axis < 3; axis++) {
      const a = V[T[f * 3] * 3 + axis],
        b = V[T[f * 3 + 1] * 3 + axis],
        c = V[T[f * 3 + 2] * 3 + axis];
      magnitude = Math.max(magnitude, Math.abs(a), Math.abs(b), Math.abs(c));
      bounds[f * 6 + axis] = Math.min(a, b, c);
      bounds[f * 6 + axis + 3] = Math.max(a, b, c);
    }
  }
  toleranceMm = Math.max(toleranceMm, magnitude * Number.EPSILON * 64);
  const build = (start: number, end: number): Node => {
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++)
      for (let axis = 0; axis < 3; axis++) {
        box[axis] = Math.min(box[axis], bounds[order[i] * 6 + axis]);
        box[axis + 3] = Math.max(box[axis + 3], bounds[order[i] * 6 + axis + 3]);
      }
    const node: Node = { bounds: box, start, end };
    if (end - start <= 8) return node;
    let axis = 0;
    for (let i = 1; i < 3; i++) if (box[i + 3] - box[i] > box[axis + 3] - box[axis]) axis = i;
    order
      .subarray(start, end)
      .sort(
        (a, b) =>
          bounds[a * 6 + axis] / 2 +
            bounds[a * 6 + axis + 3] / 2 -
            (bounds[b * 6 + axis] / 2 + bounds[b * 6 + axis + 3] / 2) || a - b,
      );
    const middle = Math.floor((start + end) / 2);
    node.left = build(start, middle);
    node.right = build(middle, end);
    return node;
  };
  const root = build(0, count);
  const overlaps = (
    a: ArrayLike<number>,
    aOffset: number,
    other: ArrayLike<number>,
    offset = 0,
  ) => {
    for (let axis = 0; axis < 3; axis++)
      if (
        a[aOffset + axis] > other[offset + axis + 3] + toleranceMm ||
        other[offset + axis] > a[aOffset + axis + 3] + toleranceMm
      )
        return false;
    return true;
  };
  const ids = (f: number) => [T[f * 3], T[f * 3 + 1], T[f * 3 + 2]];
  const triangle = (vertices: number[]): Triangle =>
    vertices.map((id) => {
      const v = id * 3;
      return [V[v], V[v + 1], V[v + 2]];
    }) as Triangle;
  // Traverse unordered node pairs once. A self-pair partitions into LL, LR,
  // RR; disjoint subtrees partition by splitting one side. Thus every unordered
  // triangle pair reaches at most one leaf pair, without a root walk per face.
  const stack: [Node, Node][] = [[root, root]];
  while (stack.length) {
    if (work >= workLimit) return finish(false);
    work++;
    const [a, b] = stack.pop()!;
    if (!overlaps(a.bounds, 0, b.bounds)) continue;
    if (a === b && a.left && a.right) {
      stack.push([a.right, a.right], [a.left, a.right], [a.left, a.left]);
      continue;
    }
    if (a.left && a.right && (!b.left || a.end - a.start >= b.end - b.start)) {
      stack.push([a.right, b], [a.left, b]);
      continue;
    }
    if (b.left && b.right) {
      stack.push([a, b.right], [a, b.left]);
      continue;
    }
    for (let i = a.start; i < a.end; i++) {
      for (let j = a === b ? i + 1 : b.start; j < b.end; j++) {
        if (work >= workLimit) return finish(false);
        work++;
        const f = Math.min(order[i], order[j]),
          g = Math.max(order[i], order[j]);
        if (!overlaps(bounds, f * 6, bounds, g * 6)) continue;
        const fids = ids(f),
          gids = ids(g);
        // Each list has at most three entries; avoid allocating lookup sets per pair.
        const hasVertex = (vertices: number[], id: number) =>
          vertices[0] === id || vertices[1] === id || vertices[2] === id;
        const shared = fids.filter((id) => hasVertex(gids, id));
        const contact = shared.length
          ? adjacentMayOverlap(
              triangle([...shared, ...fids.filter((id) => !hasVertex(shared, id))]),
              triangle([...shared, ...gids.filter((id) => !hasVertex(shared, id))]),
              shared.length,
              toleranceMm,
            )
          : mayContact(triangle(fids), triangle(gids), toleranceMm);
        if (!contact) continue;
        if (shared.length) adjacentPairCount++;
        else nonAdjacentPairCount++;
        pairCount++;
        if (pairs.length < PRINT_INTERSECTION_LIMITS.samples * 2) pairs.push(f, g);
      }
    }
  }
  return finish(true);
}
