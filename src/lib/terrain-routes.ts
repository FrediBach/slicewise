/** Routes solved in model space on the actual Z-up terrain, before camera projection. */
import { mapRandom } from './map-features';
import type { MapSettings } from './map-settings';

type Mesh = { V: ArrayLike<number>; terrain?: boolean };
export interface TerrainGrid {
  n: number;
  x: number;
  y: number;
  step: number;
  heights: Float64Array;
}
export interface TerrainRoute {
  kind: 'road' | 'river';
  points: number[];
}
const neighbors = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 1],
  [1, -1],
] as const;
const gridCache = new WeakMap<Mesh, TerrainGrid | null>();
const routeCache = new WeakMap<Mesh, Map<string, TerrainRoute[]>>();

/** Welding can reorder vertices; reconstruct their grid from coordinates, never vertex order. */
export function terrainGrid(mesh: Mesh): TerrainGrid | null {
  if (!mesh.terrain) return null;
  if (gridCache.has(mesh)) return gridCache.get(mesh)!;
  const n = Math.sqrt(mesh.V.length / 3);
  if (!Number.isInteger(n) || n < 3 || n > 257) return null;
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    top = -Infinity;
  for (let i = 0; i < mesh.V.length; i += 3) {
    x = Math.min(x, mesh.V[i]);
    y = Math.min(y, mesh.V[i + 1]);
    right = Math.max(right, mesh.V[i]);
    top = Math.max(top, mesh.V[i + 1]);
  }
  const step = (right - x) / (n - 1);
  if (!(step > 0) || Math.abs(top - y - (right - x)) > step * 0.001) return null;
  const heights = new Float64Array(n * n).fill(NaN);
  for (let i = 0; i < mesh.V.length; i += 3) {
    const col = Math.round((mesh.V[i] - x) / step),
      row = Math.round((mesh.V[i + 1] - y) / step);
    if (
      col < 0 ||
      col >= n ||
      row < 0 ||
      row >= n ||
      Number.isFinite(heights[row * n + col]) ||
      Math.abs(mesh.V[i] - x - col * step) > step * 0.001 ||
      Math.abs(mesh.V[i + 1] - y - row * step) > step * 0.001
    )
      return null;
    heights[row * n + col] = mesh.V[i + 2];
  }
  const result = heights.every(Number.isFinite) ? { n, x, y, step, heights } : null;
  gridCache.set(mesh, result);
  return result;
}

/** Piecewise planar interpolation matching the terrain generator's triangle diagonal. */
export function terrainHeight(grid: TerrainGrid, x: number, y: number): number {
  const u = Math.max(0, Math.min(grid.n - 1, (x - grid.x) / grid.step));
  const v = Math.max(0, Math.min(grid.n - 1, (y - grid.y) / grid.step));
  const col = Math.min(grid.n - 2, Math.floor(u)),
    row = Math.min(grid.n - 2, Math.floor(v));
  const a = u - col,
    b = v - row,
    i = row * grid.n + col,
    h = grid.heights;
  return a + b <= 1
    ? h[i] * (1 - a - b) + h[i + 1] * a + h[i + grid.n] * b
    : h[i + grid.n + 1] * (a + b - 1) + h[i + 1] * (1 - b) + h[i + grid.n] * (1 - a);
}
function eachNeighbor(
  grid: TerrainGrid,
  i: number,
  visit: (j: number, distance: number) => void,
): void {
  const x = i % grid.n,
    y = Math.floor(i / grid.n);
  for (const [dx, dy] of neighbors)
    if (x + dx >= 0 && x + dx < grid.n && y + dy >= 0 && y + dy < grid.n)
      visit(i + dy * grid.n + dx, grid.step * Math.hypot(dx, dy));
}
function boundary(grid: TerrainGrid, i: number): boolean {
  return i % grid.n === 0 || i % grid.n === grid.n - 1 || i < grid.n || i >= grid.n * (grid.n - 1);
}
function point(grid: TerrainGrid, i: number): number[] {
  return [
    grid.x + (i % grid.n) * grid.step,
    grid.y + Math.floor(i / grid.n) * grid.step,
    grid.heights[i],
  ];
}

/** Strict descent: tributaries join a single receiver; pits remain real stopping points. */
export function terrainDrainage(grid: TerrainGrid): {
  receiver: Int32Array;
  flow: Float64Array;
  length: Float64Array;
} {
  const receiver = new Int32Array(grid.heights.length).fill(-1),
    flow = new Float64Array(grid.heights.length).fill(1),
    length = new Float64Array(grid.heights.length);
  const order = Array.from(grid.heights, (_, i) => i).sort(
    (a, b) => grid.heights[b] - grid.heights[a] || a - b,
  );
  for (const i of order) {
    let slope = 0;
    if (!boundary(grid, i))
      eachNeighbor(grid, i, (j, distance) => {
        const next = (grid.heights[i] - grid.heights[j]) / distance;
        if (next > slope + 1e-12) {
          slope = next;
          receiver[i] = j;
        }
      });
    if (receiver[i] >= 0) flow[receiver[i]] += flow[i];
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k],
      j = receiver[i];
    if (j >= 0)
      length[i] =
        length[j] +
        Math.hypot((i % grid.n) - (j % grid.n), Math.floor(i / grid.n) - Math.floor(j / grid.n)) *
          grid.step;
  }
  return { receiver, flow, length };
}
class Heap {
  private values: Array<[number, number]> = [];
  push(item: [number, number]) {
    this.values.push(item);
    let i = this.values.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.values[parent][1] <= item[1]) break;
      this.values[i] = this.values[parent];
      i = parent;
    }
    this.values[i] = item;
  }
  pop(): [number, number] | undefined {
    const first = this.values[0],
      last = this.values.pop();
    if (this.values.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1][1] < this.values[child][1])
          child++;
        if (last[1] <= this.values[child][1]) break;
        this.values[i] = this.values[child];
        i = child;
      }
      this.values[i] = last;
    }
    return first;
  }
}
export const MAX_ROAD_GRADE = 0.3;
/** Least-cost road: prefer short gentle traverses, reject edges steeper than a 30% grade. */
export function terrainRoad(grid: TerrainGrid, start: number, end: number): number[] {
  const costs = new Float64Array(grid.heights.length).fill(Infinity),
    previous = new Int32Array(grid.heights.length).fill(-1),
    heap = new Heap();
  costs[start] = 0;
  heap.push([start, 0]);
  let item: [number, number] | undefined;
  while ((item = heap.pop())) {
    const [i, cost] = item;
    if (cost > costs[i]) continue;
    if (i === end) break;
    eachNeighbor(grid, i, (j, distance) => {
      const grade = Math.abs(grid.heights[j] - grid.heights[i]) / distance;
      if (grade > MAX_ROAD_GRADE || boundary(grid, j)) return;
      const next = cost + distance * (1 + 80 * grade * grade);
      if (next < costs[j]) {
        costs[j] = next;
        previous[j] = i;
        heap.push([j, next]);
      }
    });
  }
  if (!Number.isFinite(costs[end])) return [];
  const route: number[] = [];
  for (let i = end; i >= 0; i = previous[i]) {
    route.push(i);
    if (i === start) break;
  }
  return route.reverse();
}

/** Round graph corners only where the draped segments still obey descent/road grade. */
function drapeRoute(
  grid: TerrainGrid,
  indexes: number[],
  river: boolean,
  fixed?: ReadonlySet<number>,
): number[] {
  const points = indexes.map((i) => point(grid, i));
  const validSegment = (a: number[], b: number[]) => {
    let prev = a;
    for (let j = 1; j <= 4; j++) {
      const x = a[0] + ((b[0] - a[0]) * j) / 4,
        y = a[1] + ((b[1] - a[1]) * j) / 4,
        z = terrainHeight(grid, x, y);
      const distance = Math.hypot(x - prev[0], y - prev[1]);
      if (river ? z > prev[2] + 1e-9 : Math.abs(z - prev[2]) > MAX_ROAD_GRADE * distance + 1e-9)
        return false;
      prev = [x, y, z];
    }
    return true;
  };
  for (let i = 1; i + 1 < points.length; i++) {
    if (fixed?.has(indexes[i])) continue;
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const x = b[0] * 0.6 + (a[0] + c[0]) * 0.2,
      y = b[1] * 0.6 + (a[1] + c[1]) * 0.2;
    const candidate = [x, y, terrainHeight(grid, x, y)];
    if (validSegment(a, candidate) && validSegment(candidate, c)) points[i] = candidate;
  }
  const result = [...points[0]];
  for (let i = 1; i < points.length; i++)
    for (let j = 1; j <= 4; j++) {
      const a = points[i - 1],
        b = points[i],
        x = a[0] + ((b[0] - a[0]) * j) / 4,
        y = a[1] + ((b[1] - a[1]) * j) / 4;
      result.push(x, y, terrainHeight(grid, x, y));
    }
  return result;
}

export function createTerrainRoutes(mesh: Mesh, settings: MapSettings): TerrainRoute[] {
  const grid = terrainGrid(mesh);
  if (!grid || (!settings.mapRoads && !settings.mapRivers)) return [];
  const key = `${settings.mapSeed}:${settings.mapRoads}:${settings.mapRivers}`;
  let cache = routeCache.get(mesh);
  if (!cache) {
    cache = new Map();
    routeCache.set(mesh, cache);
  }
  if (cache.has(key)) return cache.get(key)!;
  const result: TerrainRoute[] = [],
    span = grid.step * (grid.n - 1);
  if (settings.mapRivers) {
    const { receiver, flow, length } = terrainDrainage(grid);
    const rng = mapRandom(settings.mapSeed, 7139);
    const weights = Float64Array.from(
      flow,
      (area, i) => length[i] * length[i] * Math.log1p(area) * (0.9 + rng() * 0.2),
    );
    const sources = Array.from(flow, (_, i) => i)
      .filter((i) => flow[i] >= Math.max(3, grid.n * 0.02) && length[i] >= span * 0.12)
      .sort((a, b) => weights[b] - weights[a] || a - b);
    const used = new Set<number>();
    const riverPaths: number[][] = [],
      junctions = new Set<number>();
    let count = 0;
    for (const source of sources) {
      if (count >= settings.mapRivers) break;
      const indexes: number[] = [];
      for (let i = source; i >= 0; i = receiver[i]) {
        indexes.push(i);
        if (used.has(i)) break;
      }
      if (indexes.length < Math.max(6, grid.n * 0.06)) continue;
      if (used.has(indexes.at(-1)!)) junctions.add(indexes.at(-1)!);
      riverPaths.push(indexes);
      for (const i of indexes) used.add(i);
      count++;
    }
    for (const indexes of riverPaths)
      result.push({ kind: 'river', points: drapeRoute(grid, indexes, true, junctions) });
  }
  if (settings.mapRoads) {
    const rng = mapRandom(settings.mapSeed, 3191);
    // Choose endpoints within traversable regions, rather than asking a road to cross cliffs.
    const seen = new Uint8Array(grid.heights.length),
      regions: number[][] = [];
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || boundary(grid, start)) continue;
      const region = [start];
      seen[start] = 1;
      for (let cursor = 0; cursor < region.length; cursor++)
        eachNeighbor(grid, region[cursor], (j, distance) => {
          if (
            !seen[j] &&
            !boundary(grid, j) &&
            Math.abs(grid.heights[j] - grid.heights[region[cursor]]) <= MAX_ROAD_GRADE * distance
          ) {
            seen[j] = 1;
            region.push(j);
          }
        });
      if (region.length >= 20) regions.push(region);
    }
    regions.sort((a, b) => b.length - a.length || a[0] - b[0]);
    let count = 0;
    for (
      let attempt = 0;
      attempt < Math.min(24, regions.length * 3) && count < settings.mapRoads;
      attempt++
    ) {
      const region = regions[attempt % Math.min(8, regions.length)];
      const start = region[Math.floor(rng() * region.length)],
        a = point(grid, start);
      let end = start,
        farthest = 0;
      for (const i of region) {
        const b = point(grid, i),
          distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (distance > farthest) {
          end = i;
          farthest = distance;
        }
      }
      if (farthest < span * 0.12) continue;
      const indexes = terrainRoad(grid, start, end);
      if (indexes.length < 6) continue;
      result.push({ kind: 'road', points: drapeRoute(grid, indexes, false) });
      count++;
    }
  }
  if (cache.size >= 6) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
