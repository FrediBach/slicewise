import { resolveSliceRaySettings, type SliceRaySettings } from './slice-rays-settings';

type Point = [number, number, number];
type Edge = { a: Point; b: Point; length: number };
const cross2 = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** Closed planar slices define material by even/odd parity, independent of winding.
 * Open contours have no reliable inside and are deliberately excluded.
 * Returns independent 3D pen-down segments, including physical fade gaps.
 */
export function createSliceRays(
  points: ArrayLike<number>,
  polylines: readonly (readonly number[])[],
  normal: readonly number[],
  settings: Partial<SliceRaySettings>,
  salt = 0,
): number[][] {
  const s = resolveSliceRaySettings(settings);
  if (!s.sliceRays || !s.sliceRayAmount || !s.sliceRayLength) return [];
  if (normal.length !== 3 || !normal.every(Number.isFinite) || Math.hypot(...normal) < 1e-9)
    return [];
  const dropped = normal.reduce(
    (best, v, i) => (Math.abs(v) > Math.abs(normal[best]) ? i : best),
    0,
  );
  const u = (dropped + 1) % 3,
    v = (dropped + 2) % 3;
  const point = (i: number): Point => [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
  const edges: Edge[] = [];
  let total = 0;
  for (const poly of polylines) {
    if (poly.length < 4 || poly[0] !== poly.at(-1)) continue;
    const ring = poly.map(point);
    if (!ring.every((p) => p.every(Number.isFinite))) continue;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (length < 1e-10) continue;
      edges.push({ a, b, length });
      total += length;
    }
  }
  if (!edges.length || !Number.isFinite(total)) return [];
  const inside = (x: number, y: number) => {
    let odd = false;
    for (const { a, b } of edges)
      if (a[v] > y !== b[v] > y && x < a[u] + ((y - a[v]) * (b[u] - a[u])) / (b[v] - a[v]))
        odd = !odd;
    return odd;
  };
  // Bound parity/intersection work on unusually complex sections.
  const count = Math.min(s.sliceRayAmount, Math.max(1, Math.floor(2_000_000 / edges.length)));
  const output: number[][] = [];
  let edgeIndex = 0,
    traversed = 0;
  for (let i = 0; i < count; i++) {
    const distance = ((i + 0.5) / count) * total;
    while (edgeIndex < edges.length - 1 && traversed + edges[edgeIndex].length < distance)
      traversed += edges[edgeIndex++].length;
    const { a, b, length } = edges[edgeIndex];
    // A sample exactly on a polygon vertex has two possible tangents. Keep it
    // just inside the selected edge so the parity probes resolve a unique side.
    const t = Math.max(1e-5, Math.min(1 - 1e-5, (distance - traversed) / length));
    const origin = a.map((value, k) => value + (b[k] - value) * t) as Point;
    const tangent = b.map((value, k) => (value - a[k]) / length);
    const direction: Point = [
      tangent[1] * normal[2] - tangent[2] * normal[1],
      tangent[2] * normal[0] - tangent[0] * normal[2],
      tangent[0] * normal[1] - tangent[1] * normal[0],
    ];
    const magnitude = Math.hypot(...direction);
    if (magnitude < 1e-9) continue;
    for (let k = 0; k < 3; k++) direction[k] /= magnitude;
    const epsilon = Math.min(1e-6, length * 1e-4);
    const plusInside = inside(
      origin[u] + direction[u] * epsilon,
      origin[v] + direction[v] * epsilon,
    );
    const minusInside = inside(
      origin[u] - direction[u] * epsilon,
      origin[v] - direction[v] * epsilon,
    );
    if (plusInside === minusInside) continue;
    if (plusInside) for (let k = 0; k < 3; k++) direction[k] *= -1;
    const hash = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
    // Mesh normalization uses a diameter of two model units.
    let reach =
      (s.sliceRayLength / 50) * (1 - (s.sliceRayVariation / 100) * (hash - Math.floor(hash)));
    for (const edge of edges) {
      if (edge === edges[edgeIndex]) continue;
      const ex = edge.b[u] - edge.a[u],
        ey = edge.b[v] - edge.a[v];
      const determinant = cross2(direction[u], direction[v], ex, ey);
      if (Math.abs(determinant) < 1e-12) continue;
      const ox = edge.a[u] - origin[u],
        oy = edge.a[v] - origin[v];
      const hit = cross2(ox, oy, ex, ey) / determinant;
      const along = cross2(ox, oy, direction[u], direction[v]) / determinant;
      if (hit > epsilon && along >= 0 && along <= 1) reach = Math.min(reach, hit - epsilon);
    }
    if (reach <= epsilon) continue;
    const emit = (start: number, end: number) => {
      if (end - start <= epsilon) return;
      output.push([
        ...origin.map((value, k) => value + direction[k] * start),
        ...origin.map((value, k) => value + direction[k] * end),
      ]);
    };
    const fade = s.sliceRayFade / 100;
    const solid = reach * (1 - fade);
    if (!fade) emit(0, reach);
    else {
      // Six progressively shorter strokes and wider gaps suggest decreasing light.
      const cell = (reach - solid) / 6;
      emit(0, solid + cell * 0.85);
      for (let dash = 1; dash < 6; dash++)
        emit(solid + dash * cell, solid + (dash + 0.85 - dash * 0.13) * cell);
    }
  }
  return output;
}
