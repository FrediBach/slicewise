export type DiskPoint = readonly [x: number, y: number];

export type PoincareGeodesic =
  | { kind: 'diameter'; direction: DiskPoint }
  | { kind: 'circle'; center: DiskPoint; radius: number };

export interface HyperbolicTilingOptions {
  p: number;
  q: number;
  depth: number;
  maxEdges?: number;
  arcTolerance?: number;
}

export const HYPERBOLIC_TILING_DEFAULTS = {
  tilingP: 7,
  tilingQ: 3,
  tilingDepth: 4,
  tilingDiskScale: 92,
} as const;

export interface HyperbolicTiling {
  points: Float32Array;
  offsets: Uint32Array;
  edges: ReadonlyArray<readonly [DiskPoint, DiskPoint]>;
  tileCount: number;
  truncated: boolean;
}

const TAU = Math.PI * 2;
const DISK_EPSILON = 1e-10;
const KEY_SCALE = 1e7;

const pointKey = ([x, y]: DiskPoint): string =>
  `${Math.round(x * KEY_SCALE)},${Math.round(y * KEY_SCALE)}`;

const edgeKey = (a: DiskPoint, b: DiskPoint): string => {
  const ka = pointKey(a),
    kb = pointKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

function finitePoint(point: DiskPoint): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function clampInsideDisk(point: DiskPoint): DiskPoint {
  const radius = Math.hypot(point[0], point[1]);
  if (radius < 1 - DISK_EPSILON) return point;
  if (!Number.isFinite(radius) || radius === 0) throw new Error('Tiling reflection became invalid');
  const scale = (1 - DISK_EPSILON) / radius;
  return [point[0] * scale, point[1] * scale];
}

export function isHyperbolicPair(p: number, q: number): boolean {
  return Number.isInteger(p) && Number.isInteger(q) && p >= 3 && q >= 3 && (p - 2) * (q - 2) > 4;
}

/** Euclidean disk radius of the vertices of the centred regular {p,q} polygon. */
export function fundamentalPolygonRadius(p: number, q: number): number {
  if (!isHyperbolicPair(p, q))
    throw new Error(`{${p},${q}} is not hyperbolic; choose (p − 2)(q − 2) > 4`);
  const coshRadius = 1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q));
  return Math.sqrt((coshRadius - 1) / (coshRadius + 1));
}

/** The unique disk geodesic through two points, including the diameter limit. */
export function poincareGeodesic(a: DiskPoint, b: DiskPoint): PoincareGeodesic {
  if (!finitePoint(a) || !finitePoint(b)) throw new Error('Geodesic endpoints must be finite');
  const determinant = a[0] * b[1] - a[1] * b[0];
  if (Math.abs(determinant) < 1e-12) {
    const length = Math.hypot(a[0], a[1]) || Math.hypot(b[0], b[1]);
    if (length === 0) throw new Error('A geodesic needs two distinct points');
    const source = Math.hypot(a[0], a[1]) ? a : b;
    return { kind: 'diameter', direction: [source[0] / length, source[1] / length] };
  }
  const da = (a[0] * a[0] + a[1] * a[1] + 1) * 0.5;
  const db = (b[0] * b[0] + b[1] * b[1] + 1) * 0.5;
  const cx = (da * b[1] - a[1] * db) / determinant;
  const cy = (a[0] * db - da * b[0]) / determinant;
  const radiusSquared = cx * cx + cy * cy - 1;
  if (!(radiusSquared > 0) || !Number.isFinite(radiusSquared))
    throw new Error('Could not construct a finite Poincaré geodesic');
  return { kind: 'circle', center: [cx, cy], radius: Math.sqrt(radiusSquared) };
}

function reflectPoint(point: DiskPoint, geodesic: PoincareGeodesic): DiskPoint {
  if (geodesic.kind === 'diameter') {
    const [dx, dy] = geodesic.direction;
    const projection = point[0] * dx + point[1] * dy;
    return clampInsideDisk([2 * projection * dx - point[0], 2 * projection * dy - point[1]]);
  }
  const dx = point[0] - geodesic.center[0],
    dy = point[1] - geodesic.center[1],
    distanceSquared = dx * dx + dy * dy;
  if (!(distanceSquared > 0)) throw new Error('Cannot reflect the geodesic circle centre');
  const scale = (geodesic.radius * geodesic.radius) / distanceSquared;
  return clampInsideDisk([geodesic.center[0] + dx * scale, geodesic.center[1] + dy * scale]);
}

export function samplePoincareGeodesic(
  a: DiskPoint,
  b: DiskPoint,
  tolerance = 0.0015,
): DiskPoint[] {
  const geodesic = poincareGeodesic(a, b);
  if (geodesic.kind === 'diameter') return [a, b];
  const start = Math.atan2(a[1] - geodesic.center[1], a[0] - geodesic.center[0]);
  const end = Math.atan2(b[1] - geodesic.center[1], b[0] - geodesic.center[0]);
  let delta = ((end - start + Math.PI) % TAU) - Math.PI;
  if (delta === -Math.PI) delta = Math.PI;
  const safeTolerance = Math.max(1e-6, tolerance);
  const anglePerSegment =
    geodesic.radius <= safeTolerance
      ? Math.PI
      : 2 * Math.acos(Math.max(-1, Math.min(1, 1 - safeTolerance / geodesic.radius)));
  const segments = Math.max(1, Math.min(64, Math.ceil(Math.abs(delta) / anglePerSegment)));
  const points: DiskPoint[] = [];
  for (let index = 0; index <= segments; index++) {
    if (index === 0) points.push(a);
    else if (index === segments) points.push(b);
    else {
      const angle = start + (delta * index) / segments;
      points.push([
        geodesic.center[0] + geodesic.radius * Math.cos(angle),
        geodesic.center[1] + geodesic.radius * Math.sin(angle),
      ]);
    }
  }
  return points;
}

export function generateHyperbolicTiling(options: HyperbolicTilingOptions): HyperbolicTiling {
  const p = Math.round(options.p),
    q = Math.round(options.q),
    depth = Math.max(0, Math.min(8, Math.round(options.depth)));
  if (!isHyperbolicPair(p, q))
    throw new Error(`{${p},${q}} is not hyperbolic; choose (p − 2)(q − 2) > 4`);
  const maxEdges = Math.max(p, Math.min(50_000, Math.round(options.maxEdges ?? 12_000)));
  const radius = fundamentalPolygonRadius(p, q);
  const initialVertices: DiskPoint[] = Array.from({ length: p }, (_, index) => {
    const angle = Math.PI / 2 + (TAU * index) / p;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  type Tile = { center: DiskPoint; vertices: DiskPoint[]; level: number };
  const queue: Tile[] = [{ center: [0, 0], vertices: initialVertices, level: 0 }];
  const seenTiles = new Set<string>([pointKey([0, 0])]);
  const edgeKeys = new Set<string>();
  const edges: Array<readonly [DiskPoint, DiskPoint]> = [];
  let cursor = 0,
    truncated = false;
  while (cursor < queue.length && !truncated) {
    const tile = queue[cursor++];
    for (let index = 0; index < p; index++) {
      const a = tile.vertices[index],
        b = tile.vertices[(index + 1) % p],
        key = edgeKey(a, b);
      if (!edgeKeys.has(key)) {
        if (edges.length >= maxEdges) {
          truncated = true;
          break;
        }
        edgeKeys.add(key);
        edges.push([a, b]);
      }
      if (tile.level >= depth) continue;
      const geodesic = poincareGeodesic(a, b);
      const center = reflectPoint(tile.center, geodesic);
      const centerKey = pointKey(center);
      if (seenTiles.has(centerKey)) continue;
      const vertices = tile.vertices.map((vertex) => reflectPoint(vertex, geodesic));
      if (!vertices.every((vertex) => finitePoint(vertex) && Math.hypot(...vertex) < 1)) continue;
      seenTiles.add(centerKey);
      queue.push({ center, vertices, level: tile.level + 1 });
    }
  }

  const sampled = edges.map(([a, b]) =>
    samplePoincareGeodesic(a, b, options.arcTolerance ?? 0.0015),
  );
  const pointCount = sampled.reduce((sum, run) => sum + run.length, 0);
  const points = new Float32Array(pointCount * 2),
    offsets = new Uint32Array(sampled.length + 1);
  let pointOffset = 0;
  for (let runIndex = 0; runIndex < sampled.length; runIndex++) {
    offsets[runIndex] = pointOffset;
    for (const point of sampled[runIndex]) {
      points[pointOffset * 2] = point[0];
      points[pointOffset * 2 + 1] = point[1];
      pointOffset++;
    }
  }
  offsets[sampled.length] = pointOffset;
  return { points, offsets, edges, tileCount: seenTiles.size, truncated };
}
