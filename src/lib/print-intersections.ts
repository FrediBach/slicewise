import type { TopologyMesh } from './mesh-topology';

export const PRINT_INTERSECTION_LIMITS = {
  triangles: 250_000,
  work: 5_000_000,
  samples: 32,
} as const;
export type PrintIntersectionReport = {
  status: 'passed' | 'failed' | 'budget-exceeded';
  /** Contacts inside the declared numerical tolerance are conservatively rejected. */
  toleranceMm: number;
  pairCount: number;
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

/**
 * Requires finite, indexed, nondegenerate triangles (the topology auditor checks
 * those first). Pairs sharing ANY indexed vertex are excluded, so this does not
 * certify all self-intersections or shell nesting. No input or geometry cache is
 * mutated. A deterministic median BVH bounds work on spatially separated faces.
 */
export function auditNonAdjacentIntersections(
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
    work = 0;
  let toleranceMm = 1e-10,
    magnitude = 0;
  const finish = (complete: boolean): PrintIntersectionReport => ({
    status: !complete ? 'budget-exceeded' : pairCount ? 'failed' : 'passed',
    toleranceMm,
    pairCount,
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
  const overlaps = (f: number, other: ArrayLike<number>, offset = 0) => {
    for (let axis = 0; axis < 3; axis++)
      if (
        bounds[f * 6 + axis] > other[offset + axis + 3] + toleranceMm ||
        other[offset + axis] > bounds[f * 6 + axis + 3] + toleranceMm
      )
        return false;
    return true;
  };
  const triangle = (f: number): Triangle =>
    [0, 1, 2].map((corner) => {
      const v = T[f * 3 + corner] * 3;
      return [V[v], V[v + 1], V[v + 2]];
    }) as Triangle;
  for (let f = 0; f < count; f++) {
    const stack = [root];
    while (stack.length) {
      if (work >= workLimit) return finish(false);
      work++;
      const node = stack.pop()!;
      if (!overlaps(f, node.bounds)) continue;
      if (node.left && node.right) {
        stack.push(node.right, node.left);
        continue;
      }
      for (let i = node.start; i < node.end; i++) {
        if (work >= workLimit) return finish(false);
        work++;
        const g = order[i];
        if (g <= f || !overlaps(f, bounds, g * 6)) continue;
        let adjacent = false;
        for (let a = 0; a < 3; a++)
          for (let b = 0; b < 3; b++) if (T[f * 3 + a] === T[g * 3 + b]) adjacent = true;
        if (adjacent || !mayContact(triangle(f), triangle(g), toleranceMm)) continue;
        pairCount++;
        if (pairs.length < PRINT_INTERSECTION_LIMITS.samples * 2) pairs.push(f, g);
      }
    }
  }
  return finish(true);
}
