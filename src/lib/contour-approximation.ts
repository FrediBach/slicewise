/** Explicit approximation of one closed polyline; the source mesh is untouched. */
export const CONTOUR_APPROXIMATION_LIMITS = { vertices: 200_000, work: 2_000_000 } as const;
export type ContourApproximation = {
  points: Float64Array;
  /** Original loop vertex IDs in traversal order, without a repeated endpoint. */
  retainedVertices: Uint32Array;
  maximumDeviationMm: number;
  work: number;
};

/** Split at the farthest vertex from the first, then simplify both open arcs.
 * Every accepted replacement chord is within tolerance of every original arc
 * vertex. Convexity of distance to a segment bounds the intervening edges too;
 * continuity of projection along the arc bounds the reverse chord-to-arc distance.
 * This is a floating-point path-distance bound, not a topology or surface-normal
 * guarantee. In particular nearby loops or folds can change intersection behavior.
 */
export function approximateClosedContour(
  points: Float64Array,
  toleranceMm: number,
  workLimit: number = CONTOUR_APPROXIMATION_LIMITS.work,
): ContourApproximation {
  const count = points.length / 3;
  if (
    !Number.isInteger(count) ||
    count < 3 ||
    count > CONTOUR_APPROXIMATION_LIMITS.vertices ||
    !points.every(Number.isFinite)
  )
    throw new Error('Contour approximation requires 3–200000 finite vertices.');
  if (!Number.isFinite(toleranceMm) || toleranceMm <= 0)
    throw new Error('Contour approximation tolerance must be positive and finite.');
  if (
    !Number.isSafeInteger(workLimit) ||
    workLimit < 0 ||
    workLimit > CONTOUR_APPROXIMATION_LIMITS.work
  )
    throw new Error('Invalid contour approximation work budget.');
  let work = 0;
  const visit = () => {
    if (work >= workLimit) throw new Error('Contour approximation work budget exceeded.');
    work++;
  };
  const distance = (i: number, a: number, b: number) => {
    const ai = (a % count) * 3,
      bi = (b % count) * 3,
      pi = (i % count) * 3;
    const x = points[bi] - points[ai],
      y = points[bi + 1] - points[ai + 1],
      z = points[bi + 2] - points[ai + 2];
    const length = Math.hypot(x, y, z);
    const px = points[pi] - points[ai],
      py = points[pi + 1] - points[ai + 1],
      pz = points[pi + 2] - points[ai + 2];
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(length, px * (x / length) + py * (y / length) + pz * (z / length)));
    const result =
      length === 0
        ? Math.hypot(px, py, pz)
        : Math.hypot(px - (t * x) / length, py - (t * y) / length, pz - (t * z) / length);
    if (!Number.isFinite(result))
      throw new Error('Contour approximation measurement range exceeded.');
    return result;
  };
  let anchor = 1,
    farthest = 0;
  for (let i = 1; i < count; i++) {
    visit();
    const d = distance(i, 0, 0);
    if (d > farthest) {
      farthest = d;
      anchor = i;
    }
  }
  if (farthest === 0) throw new Error('Contour approximation requires a nondegenerate loop.');
  const retained = new Set([0, anchor]);
  const stack = [
    [anchor, count],
    [0, anchor],
  ];
  let maximumDeviationMm = 0;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maximum = 0,
      split = -1;
    for (let i = a + 1; i < b; i++) {
      visit();
      const d = distance(i, a, b);
      if (d > maximum) {
        maximum = d;
        split = i;
      }
    }
    if (maximum > toleranceMm) {
      retained.add(split);
      stack.push([split, b], [a, split]);
    } else maximumDeviationMm = Math.max(maximumDeviationMm, maximum);
  }
  // A closed tool must never collapse to a line, even with a loose tolerance.
  if (retained.size < 3) throw new Error('Contour approximation would collapse the closed loop.');
  const retainedVertices = Uint32Array.from([...retained].sort((a, b) => a - b));
  const output = new Float64Array(retainedVertices.length * 3);
  retainedVertices.forEach((id, i) => output.set(points.subarray(id * 3, id * 3 + 3), i * 3));
  return { points: output, retainedVertices, maximumDeviationMm, work };
}
