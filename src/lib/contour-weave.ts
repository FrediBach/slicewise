import { resolveWeaveSettings, type ContourWeaveSettings } from './contour-weave-settings';

type Vec3 = [number, number, number];
export interface SurfaceWeaveMesh {
  V: ArrayLike<number>;
  T: ArrayLike<number>;
}
export interface SurfaceWeaveThread {
  family: 'warp' | 'weft';
  index: number;
  /** Indexed 3D segments, ready for chaining before camera projection. */
  points: number[];
  segments: number[];
}
interface ThreadBuilder extends SurfaceWeaveThread {
  vertices: Map<string, number>;
  edges: Set<string>;
}
interface Sample {
  point: Vec3;
  other: number;
}
const EPS = 1e-9;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const modulo = (n: number, d: number) => ((n % d) + d) % d;
function warpOver(u: number, v: number, pattern: string, phase: number): boolean {
  if (pattern === 'warp') return true;
  if (pattern === 'weft') return false;
  if (pattern === 'twill') return modulo(u + v + phase, 4) < 2;
  if (pattern === 'basket') return modulo(Math.floor(u / 2) + Math.floor(v / 2) + phase, 2) === 0;
  return modulo(u + v + phase, 2) === 0;
}
function emit(builder: ThreadBuilder, a: Vec3, b: Vec3): void {
  if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < EPS) return;
  const vertex = (p: Vec3): number => {
    const key = p.map((value) => Math.round(value * 1e8)).join(',');
    const known = builder.vertices.get(key);
    if (known !== undefined) return known;
    const index = builder.points.length / 3;
    builder.vertices.set(key, index);
    builder.points.push(...p);
    return index;
  };
  const ai = vertex(a),
    bi = vertex(b);
  const key = ai < bi ? `${ai}:${bi}` : `${bi}:${ai}`;
  if (ai === bi || builder.edges.has(key)) return;
  builder.edges.add(key);
  builder.segments.push(ai, bi);
}
const cache = new WeakMap<SurfaceWeaveMesh, Map<string, SurfaceWeaveThread[]>>();

/**
 * Two scalar-coordinate families on ONE mesh. Iso-lines and every gap are
 * interpolated inside source triangles, before projection or visibility.
 * Crossings use material (u,v) indexes, never screen-space intersections.
 * The mesh is immutable, so the bounded cache is independent of camera state.
 */
export function createSurfaceWeave(
  mesh: SurfaceWeaveMesh,
  input: Partial<ContourWeaveSettings>,
  lineCount: number,
  /** Reference sheet millimetres per normalized model unit, independent of camera/zoom. */
  referenceScale: number,
  strokeWidth: number,
): SurfaceWeaveThread[] {
  const s = resolveWeaveSettings(input);
  if (!s.contourWeave || !mesh.T.length || mesh.V.length < 9) return [];
  const count = Math.max(2, Math.min(400, Math.round(lineCount) || 40));
  const mm = Number.isFinite(referenceScale) && referenceScale > EPS ? referenceScale : 80;
  const pen = Number.isFinite(strokeWidth) ? Math.max(0, strokeWidth) : 0.35;
  const key = JSON.stringify([s, count, mm, pen]);
  let entries = cache.get(mesh);
  const known = entries?.get(key);
  if (known) return known;
  const az = (s.weaveAzimuth * Math.PI) / 180,
    tilt = (s.weaveElevation * Math.PI) / 180;
  const normal: Vec3 = [
    Math.sin(tilt) * Math.cos(az),
    Math.sin(tilt) * Math.sin(az),
    Math.cos(tilt),
  ];
  const across: Vec3 = [
    Math.cos(tilt) * Math.cos(az),
    Math.cos(tilt) * Math.sin(az),
    -Math.sin(tilt),
  ];
  const around: Vec3 = [-Math.sin(az), Math.cos(az), 0];
  const vertices = Math.floor(mesh.V.length / 3);
  const height = new Float64Array(vertices),
    transverse = new Float64Array(vertices);
  let low = Infinity,
    high = -Infinity;
  for (let i = 0; i < vertices; i++) {
    const p: Vec3 = [mesh.V[i * 3], mesh.V[i * 3 + 1], mesh.V[i * 3 + 2]];
    height[i] = dot(p, normal);
    low = Math.min(low, height[i]);
    high = Math.max(high, height[i]);
  }
  // A flat mesh still gets a fabric; avoid unbounded density on a zero-span axis.
  const span = Math.max(0.1, high - low);
  if (!Number.isFinite(span)) return [];
  const middle = (low + high) / 2;
  const angle = (s.weaveAngle * Math.PI) / 180;
  const frequencies = [count / span, ((count / span) * s.weaveDensity) / 100];
  for (let i = 0; i < vertices; i++) {
    const p: Vec3 = [mesh.V[i * 3], mesh.V[i * 3 + 1], mesh.V[i * 3 + 2]];
    const twist = ((s.weaveRoll + ((height[i] - middle) / span) * s.weaveTwist) * Math.PI) / 180;
    transverse[i] =
      (Math.cos(angle) * (height[i] - middle) +
        Math.sin(angle) * (dot(p, across) * Math.cos(twist) + dot(p, around) * Math.sin(twist))) *
        frequencies[1] +
      s.weaveShift / 100;
    height[i] = (height[i] - middle) * frequencies[0] + 0.25;
  }
  const fields = [height, transverse];
  const builders = new Map<string, ThreadBuilder>();
  let emitted = 0,
    candidates = 0;
  for (let triangle = 0; triangle + 2 < mesh.T.length; triangle += 3) {
    const ids = [mesh.T[triangle], mesh.T[triangle + 1], mesh.T[triangle + 2]];
    if (ids.some((i) => i < 0 || i >= vertices || !Number.isInteger(i))) continue;
    const points = ids.map((i) => [mesh.V[i * 3], mesh.V[i * 3 + 1], mesh.V[i * 3 + 2]] as Vec3);
    if (points.some((p) => !p.every(Number.isFinite))) continue;
    for (let family = 0; family < 2; family++) {
      if (s.weaveOutput === (family === 0 ? 'weft' : 'warp')) continue;
      const own = ids.map((i) => fields[family][i]),
        other = ids.map((i) => fields[1 - family][i]);
      const ribbon = ((s.weaveWidth / mm) * frequencies[family]) / 2;
      const offsets = ribbon > EPS ? [-ribbon, ribbon] : [0];
      const requestedGap =
        (((s.weaveWidth + pen) / 2 + s.weaveGap + pen / 2) / mm) * frequencies[1 - family];
      const gap =
        requestedGap + ((Math.min(0.45, requestedGap) - requestedGap) * s.weaveProtection) / 100;
      for (let side = 0; side < offsets.length; side++) {
        const offset = offsets[side];
        const first = Math.ceil(Math.min(...own) - offset),
          last = Math.floor(Math.max(...own) - offset);
        for (let index = first; index <= last; index++) {
          if (++candidates > 2000000)
            throw new Error('Surface weave is too dense. Reduce Line count or Weft density.');
          const level = index + offset;
          const hits: Sample[] = [];
          for (let edge = 0; edge < 3; edge++) {
            const next = (edge + 1) % 3;
            if (!(
              (own[edge] < level && own[next] >= level) ||
              (own[next] < level && own[edge] >= level)
            ))
              continue;
            const t = (level - own[edge]) / (own[next] - own[edge]);
            hits.push({
              point: lerp(points[edge], points[next], t),
              other: other[edge] + (other[next] - other[edge]) * t,
            });
          }
          if (hits.length !== 2) continue;
          const [a, b] = hits,
            delta = b.other - a.other;
          const cuts = [0, 1];
          const start = Math.ceil(Math.min(a.other, b.other) - gap),
            end = Math.floor(Math.max(a.other, b.other) + gap);
          if (end - start > 4000)
            throw new Error(
              'Surface weave clearance is too large for this density. Reduce Crossing clearance or Weft density.',
            );
          const intervals: Array<[number, number]> = [];
          for (let crossing = start; crossing <= end; crossing++) {
            const above = warpOver(
              family === 0 ? index : crossing,
              family === 0 ? crossing : index,
              s.weavePattern,
              s.weavePhase,
            );
            if (above === (family === 0)) continue;
            intervals.push([crossing - gap, crossing + gap]);
            if (Math.abs(delta) > EPS)
              for (const bound of [crossing - gap, crossing + gap]) {
                const t = (bound - a.other) / delta;
                if (t > EPS && t < 1 - EPS) cuts.push(t);
              }
          }
          cuts.sort((a, b) => a - b);
          const id = `${family}:${index}:${side}`;
          let builder = builders.get(id);
          if (!builder) {
            builder = {
              family: family === 0 ? 'warp' : 'weft',
              index,
              points: [],
              segments: [],
              vertices: new Map(),
              edges: new Set(),
            };
            builders.set(id, builder);
          }
          for (let c = 0; c + 1 < cuts.length; c++) {
            const t0 = cuts[c],
              t1 = cuts[c + 1];
            if (t1 - t0 < EPS) continue;
            const value = a.other + (delta * (t0 + t1)) / 2;
            const removed = intervals.some(([from, to]) => value > from && value < to);
            if (removed !== (s.weaveOutput === 'crossings')) continue;
            emit(builder, lerp(a.point, b.point, t0), lerp(a.point, b.point, t1));
            if (++emitted > 300000)
              throw new Error(
                'Surface weave is too dense. Reduce Line count, Weft density, or Ribbon width.',
              );
          }
        }
      }
    }
  }
  const result: SurfaceWeaveThread[] = [];
  for (const builder of builders.values())
    if (builder.segments.length)
      result.push({
        family: builder.family,
        index: builder.index,
        points: builder.points,
        segments: builder.segments,
      });
  result.sort((a, b) => a.family.localeCompare(b.family) || a.index - b.index);
  if (!entries) {
    entries = new Map();
    cache.set(mesh, entries);
  }
  if (entries.size >= 4) entries.delete(entries.keys().next().value!);
  entries.set(key, result);
  return result;
}
