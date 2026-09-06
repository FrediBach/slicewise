/** Exact triangle intersections with bounded, diverging SVG segment curtains. */
export interface SvgSliceSettings {
  svgSlicePaths?: number[][];
  svgSliceScale?: number;
  svgSliceX?: number;
  svgSliceY?: number;
  svgSliceRotation?: number;
  cutAz: number;
  cutEl: number;
  divergence: number;
}
type Point = [number, number, number];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a: Point, b: Point, t: number): Point => a.map((v, i) => v + (b[i] - v) * t) as Point;
const finite = (v: number | undefined, fallback: number) => (Number.isFinite(v) ? v! : fallback);
const cache = new WeakMap<object, Map<string, { points: number[]; segments: number[] }[]>>();
export function svgSliceContours(
  mesh: { V: ArrayLike<number>; T: ArrayLike<number> },
  s: SvgSliceSettings,
) {
  const paths = s.svgSlicePaths ?? [];
  if (!paths.length) return []; // The upload control is ready; no cutting paths yet.
  if (paths.some((p) => p.length < 4 || p.length % 2 || p.some((v) => !Number.isFinite(v))))
    throw new Error('Invalid SVG slice paths.');
  const count = paths.reduce((n, p) => n + p.length / 2 - 1, 0);
  if (count > 20000)
    throw new Error(
      'SVG slicing is too complex. Simplify the SVG paths or reduce the model triangle count.',
    );
  const key = JSON.stringify(s);
  const entries = cache.get(mesh) ?? new Map();
  if (entries.has(key)) return entries.get(key)!;
  const az = (s.cutAz * Math.PI) / 180,
    el = (s.cutEl * Math.PI) / 180;
  const u: Point = [Math.sin(el) * Math.cos(az), Math.sin(el) * Math.sin(az), -Math.cos(el)];
  const v: Point = [-Math.sin(az), Math.cos(az), 0];
  const w: Point = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const vertices: Point[] = [];
  let minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < mesh.V.length; i += 3) {
    const p: Point = [mesh.V[i], mesh.V[i + 1], mesh.V[i + 2]];
    const local: Point = [dot(p, u), dot(p, v), dot(p, w)];
    vertices.push(local);
    minZ = Math.min(minZ, local[2]);
    maxZ = Math.max(maxZ, local[2]);
  }
  const k = Math.tan((Math.max(0, Math.min(160, s.divergence || 0)) * Math.PI) / 360);
  const scale = Math.max(1, Math.min(300, finite(s.svgSliceScale, 100))) / 100;
  const angle = (finite(s.svgSliceRotation, 0) * Math.PI) / 180;
  const ox = finite(s.svgSliceX, 0) / 100,
    oy = finite(s.svgSliceY, 0) / 100;
  // Reject spatially unrelated triangles before the expensive intersection work.
  const bounds = new Float64Array((mesh.T.length / 3) * 4);
  for (let t = 0; t < mesh.T.length; t += 3) {
    const a = vertices[mesh.T[t]],
      b = vertices[mesh.T[t + 1]],
      c = vertices[mesh.T[t + 2]];
    bounds.set(
      [
        Math.min(a[0], b[0], c[0]),
        Math.min(a[1], b[1], c[1]),
        Math.max(a[0], b[0], c[0]),
        Math.max(a[1], b[1], c[1]),
      ],
      (t / 3) * 4,
    );
  }
  const farScale = 1 + k * (maxZ - minZ);
  let candidates = 0,
    emitted = 0;
  const result = paths.map((path) => {
    const points: number[] = [],
      segments: number[] = [];
    const ids = new Map<string, number>(),
      edges = new Set<string>();
    const add = (p: Point) => {
      const world = u.map((_, i) => u[i] * p[0] + v[i] * p[1] + w[i] * p[2]);
      const id = world.map((x) => Math.round(x * 1e8)).join(',');
      if (!ids.has(id)) {
        ids.set(id, points.length / 3);
        points.push(...world);
      }
      return ids.get(id)!;
    };
    const xy = (i: number) => [
      scale * (path[i] * Math.cos(angle) - path[i + 1] * Math.sin(angle)),
      scale * (path[i] * Math.sin(angle) + path[i + 1] * Math.cos(angle)),
    ];
    for (let j = 0; j < path.length - 2; j += 2) {
      const a = xy(j),
        b = xy(j + 2),
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = dx * dx + dy * dy;
      if (len < 1e-18) continue;
      const factor = (p: Point) => 1 + k * (p[2] - minZ);
      const plane = (p: Point) =>
        dx * (p[1] - oy - a[1] * factor(p)) - dy * (p[0] - ox - a[0] * factor(p));
      const along = (p: Point) =>
        ((p[0] - ox - a[0] * factor(p)) * dx + (p[1] - oy - a[1] * factor(p)) * dy) / len;
      const minX = ox + Math.min(a[0], b[0], a[0] * farScale, b[0] * farScale) - 1e-9;
      const maxX = ox + Math.max(a[0], b[0], a[0] * farScale, b[0] * farScale) + 1e-9;
      const minY = oy + Math.min(a[1], b[1], a[1] * farScale, b[1] * farScale) - 1e-9;
      const maxY = oy + Math.max(a[1], b[1], a[1] * farScale, b[1] * farScale) + 1e-9;
      for (let t = 0; t < mesh.T.length; t += 3) {
        const offset = (t / 3) * 4;
        if (
          bounds[offset] > maxX ||
          bounds[offset + 2] < minX ||
          bounds[offset + 1] > maxY ||
          bounds[offset + 3] < minY
        )
          continue;
        if (++candidates > 20_000_000)
          throw new Error(
            'SVG slicing is too complex. Simplify the SVG paths or reduce the model triangle count.',
          );
        const tri = [vertices[mesh.T[t]], vertices[mesh.T[t + 1]], vertices[mesh.T[t + 2]]];
        const d = tri.map(plane);
        if (d.every((x) => Math.abs(x) < 1e-10)) continue; // Coplanar faces have no unique intersection.
        const hits: Point[] = [];
        for (let e = 0; e < 3; e++) {
          const n = (e + 1) % 3;
          if (Math.abs(d[e]) < 1e-10) hits.push(tri[e]);
          if (d[e] * d[n] < 0) hits.push(mix(tri[e], tri[n], d[e] / (d[e] - d[n])));
        }
        if (hits.length < 2) continue;
        let start = hits[0],
          end = hits[1];
        let lo = 0,
          hi = 1;
        for (const boundary of [(p: Point) => along(p), (p: Point) => factor(p) - along(p)]) {
          const x = boundary(start),
            y = boundary(end);
          if (x < 0 && y < 0) {
            hi = -1;
            break;
          }
          if (x < 0) lo = Math.max(lo, x / (x - y));
          if (y < 0) hi = Math.min(hi, x / (x - y));
        }
        if (hi - lo < 1e-10) continue;
        const original = start;
        start = mix(original, end, lo);
        end = mix(original, end, hi);
        const ai = add(start),
          bi = add(end),
          edge = ai < bi ? `${ai}:${bi}` : `${bi}:${ai}`;
        if (ai !== bi && !edges.has(edge)) {
          edges.add(edge);
          if (++emitted > 300_000)
            throw new Error(
              'Too many SVG intersections. Simplify the SVG paths or reduce the model triangle count.',
            );
          segments.push(ai, bi);
        }
      }
    }
    return { points, segments };
  });
  entries.set(key, result);
  if (entries.size > 4) entries.delete(entries.keys().next().value!);
  cache.set(mesh, entries);
  return result;
}
