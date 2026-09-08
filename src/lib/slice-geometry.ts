import type { SolidMesh } from './solid-kernel';

type Vec3 = [number, number, number];
type NumericArray = ArrayLike<number> & Iterable<number>;

export type PlanarSliceField = {
  kind: 'planar';
  /** Normal is normalized before use; levels measure mm along that unit normal. */
  normal: Vec3;
  levels: readonly number[];
  /** Optional per-level normals for a fan of nonparallel planar slices. */
  planeNormals?: readonly Vec3[];
};

export type SurfaceSlice = {
  index: number;
  level: number;
  position: number;
  points: Float64Array;
  segments: Uint32Array;
  /** One authored triangle and geometric normal per segment. */
  triangles: Uint32Array;
  normals: Float64Array;
  /** Two XYZ barycentric triples per segment, relative to its authored triangle. */
  barycentrics: Float64Array;
  runOffsets: Uint32Array;
  runPoints: Uint32Array;
  /** Closed runs repeat their first point at the end. */
  closed: Uint8Array;
};

export const SLICE_GEOMETRY_LIMITS = {
  triangles: 250_000,
  levels: 512,
  triangleLevelPairs: 8_000_000,
  segments: 200_000,
} as const;

export class SliceGeometryError extends Error {
  constructor(
    public readonly code: 'input' | 'budget' | 'coplanar' | 'branch',
    message: string,
    public readonly sliceIndex?: number,
    public readonly triangleIndex?: number,
  ) {
    super(message);
    this.name = 'SliceGeometryError';
  }
}

/**
 * Strict authored-triangle intersections for the manufacturing feasibility trial.
 * Topological edge/vertex identities join paths; nearby XYZ coordinates never do.
 * A failed or ambiguous extraction throws, never returning a truncated slice set.
 */
export function extractPlanarSlices(
  mesh: SolidMesh,
  field: PlanarSliceField,
  sourceRevision: number,
  toleranceMm = 1e-7,
) {
  const { V, T } = mesh;
  const fail = (message: string): never => {
    throw new SliceGeometryError('input', message);
  };
  if (field.kind !== 'planar') fail('Only planar fields are supported by this trial.');
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) fail('Invalid source revision.');
  if (!Number.isFinite(toleranceMm) || toleranceMm <= 0)
    fail('Choose a positive finite slice tolerance.');
  if (!V.length || V.length % 3 || !T.length || T.length % 3) fail('Incomplete mesh buffers.');
  if (
    T.length / 3 > SLICE_GEOMETRY_LIMITS.triangles ||
    V.length / 3 > SLICE_GEOMETRY_LIMITS.triangles * 3 ||
    field.levels.length > SLICE_GEOMETRY_LIMITS.levels ||
    (T.length / 3) * field.levels.length > SLICE_GEOMETRY_LIMITS.triangleLevelPairs
  )
    throw new SliceGeometryError(
      'budget',
      'Slice extraction budget exceeded. Reduce mesh detail or slice count.',
    );
  if (!V.every(Number.isFinite) || T.some((v) => v >= V.length / 3))
    fail('Invalid mesh coordinates or indices.');
  if (!field.normal.every(Number.isFinite)) fail('Slice direction must be finite.');
  const length = Math.hypot(...field.normal);
  if (!length || !Number.isFinite(length)) fail('Slice direction must be nonzero and finite.');
  const normal = field.normal.map((v) => v / length) as Vec3;
  if (field.planeNormals && field.planeNormals.length !== field.levels.length)
    fail('Each slice level requires a plane normal.');
  const planeNormals = field.planeNormals?.map((direction) => {
    const magnitude = Math.hypot(...direction);
    if (
      direction.length !== 3 ||
      !direction.every(Number.isFinite) ||
      !Number.isFinite(magnitude) ||
      !magnitude
    )
      fail('Slice plane normals must be finite and nonzero.');
    return direction.map((v) => v / magnitude) as Vec3;
  });
  const levels = [...field.levels];
  if (levels.some((v, i) => !Number.isFinite(v) || (!planeNormals && i > 0 && v <= levels[i - 1])))
    fail('Slice levels must be finite and parallel levels strictly increasing.');
  const values = new Float64Array(V.length / 3);
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const value = V[i * 3] * normal[0] + V[i * 3 + 1] * normal[1] + V[i * 3 + 2] * normal[2];
    values[i] = value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const faceNormals = new Float64Array(T.length);
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i] * 3,
      b = T[i + 1] * 3,
      c = T[i + 2] * 3;
    const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]];
    const v = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const magnitude = Math.hypot(...n);
    if (!magnitude) fail(`Degenerate source triangle ${i / 3}.`);
    faceNormals.set(
      n.map((v) => v / magnitude),
      i,
    );
  }
  let totalSegments = 0;
  const slices = levels.map((level, index): SurfaceSlice => {
    if (planeNormals) {
      min = Infinity;
      max = -Infinity;
      const direction = planeNormals[index];
      for (let i = 0; i < values.length; i++) {
        const value =
          V[i * 3] * direction[0] + V[i * 3 + 1] * direction[1] + V[i * 3 + 2] * direction[2];
        values[i] = value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }

    const points: number[] = [],
      segments: number[] = [],
      triangles: number[] = [];
    const barycentrics: number[] = [],
      normals: number[] = [];
    const roots = new Map<string, number>();
    type End = { point: number; weights: Vec3 };
    const onEdges = new Map<string, { ends: [End, End]; triangle: number; signs: number[] }>();
    const root = (a: number, b: number, t: number) => {
      const key = a === b ? `v${a}` : `e${Math.min(a, b)}:${Math.max(a, b)}`;
      let point = roots.get(key);
      if (point === undefined) {
        if (points.length / 3 >= SLICE_GEOMETRY_LIMITS.segments * 2)
          throw new SliceGeometryError('budget', 'Slice point budget exceeded.', index);
        point = points.length / 3;
        for (let k = 0; k < 3; k++) points.push(V[a * 3 + k] + (V[b * 3 + k] - V[a * 3 + k]) * t);
        roots.set(key, point);
      }
      return point;
    };
    const emit = (a: End, b: End, triangle: number) => {
      if (a.point === b.point) return;
      if (++totalSegments > SLICE_GEOMETRY_LIMITS.segments)
        throw new SliceGeometryError(
          'budget',
          'Slice segment budget exceeded. Reduce slice count.',
          index,
        );
      segments.push(a.point, b.point);
      triangles.push(triangle);
      barycentrics.push(...a.weights, ...b.weights);
      normals.push(...faceNormals.subarray(triangle * 3, triangle * 3 + 3));
    };
    for (let triangle = 0; triangle < T.length / 3; triangle++) {
      const ids = [T[triangle * 3], T[triangle * 3 + 1], T[triangle * 3 + 2]];
      const d = ids.map((id) => values[id] - level);
      const signs = d.map((v) => (Math.abs(v) <= toleranceMm ? 0 : Math.sign(v)));
      const zeros = signs.flatMap((v, i) => (v === 0 ? [i] : []));
      if (zeros.length === 3)
        throw new SliceGeometryError(
          'coplanar',
          'A slice overlaps a source face. Move that slice level.',
          index,
          triangle,
        );
      const vertex = (local: number): End => {
        const weights: Vec3 = [0, 0, 0];
        weights[local] = 1;
        return { point: root(ids[local], ids[local], 0), weights };
      };
      const edge = (a: number, b: number): End => {
        const t = d[a] / (d[a] - d[b]);
        const weights: Vec3 = [0, 0, 0];
        weights[a] = 1 - t;
        weights[b] = t;
        return { point: root(ids[a], ids[b], t), weights };
      };
      if (zeros.length === 2) {
        const [a, b] = zeros,
          third = 3 - a - b;
        const key = `${Math.min(ids[a], ids[b])}:${Math.max(ids[a], ids[b])}`;
        const stored = onEdges.get(key);
        if (stored) stored.signs.push(signs[third]);
        else onEdges.set(key, { ends: [vertex(a), vertex(b)], triangle, signs: [signs[third]] });
      } else if (zeros.length === 1) {
        const a = zeros[0],
          b = (a + 1) % 3,
          c = (a + 2) % 3;
        if (signs[b] !== signs[c]) emit(vertex(a), edge(b, c), triangle);
      } else if (!signs.every((v) => v === signs[0])) {
        const ends: End[] = [];
        for (let a = 0; a < 3; a++) {
          const b = (a + 1) % 3;
          if (signs[a] !== signs[b]) ends.push(edge(a, b));
        }
        emit(ends[0], ends[1], triangle);
      }
    }
    for (const { ends, triangle, signs } of onEdges.values()) {
      if (signs.length > 2)
        throw new SliceGeometryError(
          'branch',
          'A slice meets a non-manifold source edge.',
          index,
          triangle,
        );
      // Opposite sides cross the plane; same-side edge contacts are tangencies.
      if (signs.length === 1 || signs[0] !== signs[1]) emit(...ends, triangle);
    }
    const degrees = new Uint32Array(points.length / 3);
    for (const point of segments) {
      if (++degrees[point] > 2)
        throw new SliceGeometryError(
          'branch',
          'A slice branches at a source vertex. Move the slice or repair the source.',
          index,
        );
    }
    const runs = chainSliceSegments(points, segments);
    const offsets = [0];
    const runPoints: number[] = [],
      closed: number[] = [];
    for (const run of runs) {
      for (const point of run) runPoints.push(point);
      offsets.push(runPoints.length);
      closed.push(Number(run[0] === run[run.length - 1]));
    }
    return {
      index,
      level,
      position: max === min ? 0 : (level - min) / (max - min),
      points: Float64Array.from(points),
      segments: Uint32Array.from(segments),
      triangles: Uint32Array.from(triangles),
      normals: Float64Array.from(normals),
      barycentrics: Float64Array.from(barycentrics),
      runOffsets: Uint32Array.from(offsets),
      runPoints: Uint32Array.from(runPoints),
      closed: Uint8Array.from(closed),
    };
  });
  return {
    sourceRevision,
    field: { kind: 'planar' as const, normal, levels, ...(planeNormals ? { planeNormals } : {}) },
    toleranceMm,
    truncated: false as const,
    slices,
  };
}

/** Shared drawing run order, preserved verbatim during extraction. */
export function chainSliceSegments(pts: NumericArray, segs: NumericArray): number[][] {
  const n = pts.length / 3;
  const head = new Int32Array(n).fill(-1);
  const nextRef = new Int32Array(segs.length).fill(-1);
  for (let s = 0; s < segs.length; s++) {
    // adjacency: linked list per node
    const v = segs[s];
    nextRef[s] = head[v];
    head[v] = s;
  }
  const used = new Uint8Array(segs.length / 2);
  const deg = new Uint8Array(n);
  for (const v of segs) if (deg[v] < 255) deg[v]++;

  const polys: number[][] = [];
  const walk = (start: number): void => {
    const line: number[] = [start];
    let cur = start;
    for (;;) {
      let picked = -1,
        other = -1;
      for (let s = head[cur]; s !== -1; s = nextRef[s]) {
        const si = s >> 1;
        if (used[si]) continue;
        picked = si;
        other = segs[s ^ 1];
        break;
      }
      if (picked === -1) break;
      used[picked] = 1;
      line.push(other);
      cur = other;
      if (cur === start) break; // closed loop
    }
    if (line.length > 1) polys.push(line);
  };
  for (let v = 0; v < n; v++) if (deg[v] === 1) walk(v); // open runs first
  for (let s = 0; s < segs.length; s += 2) if (!used[s >> 1]) walk(segs[s]); // then loops
  return polys;
}
