import { describe, expect, it } from 'vitest';
import { generateTerrain } from './generative-terrain';
import {
  MAX_ROAD_GRADE,
  createTerrainRoutes,
  terrainDrainage,
  terrainGrid,
  terrainHeight,
  terrainRoad,
  type TerrainGrid,
} from './terrain-routes';
import { MAP_DEFAULTS } from './map-settings';
import { computeContours } from './contour-engine';
import { contourSettings } from '../test/fixtures/contours';
import { weld } from './mesh';

function grid(n: number, height: (x: number, y: number) => number): TerrainGrid {
  return {
    n,
    x: 0,
    y: 0,
    step: 1,
    heights: Float64Array.from({ length: n * n }, (_, i) => height(i % n, Math.floor(i / n))),
  };
}

describe('terrain-aware routes', () => {
  it('routes water down a valley to the boundary and accumulates tributaries', () => {
    const g = grid(15, (x, y) => Math.abs(x - 7) * 0.4 + (14 - y) * 0.1);
    const { receiver, flow } = terrainDrainage(g);
    let i = 2 * g.n + 3;
    const visited = new Set<number>();
    while (receiver[i] >= 0) {
      expect(visited.has(i)).toBe(false);
      visited.add(i);
      const j = receiver[i];
      expect(g.heights[j]).toBeLessThan(g.heights[i]);
      expect(flow[j]).toBeGreaterThan(flow[i]);
      i = j;
    }
    expect(i).toBe(14 * g.n + 7);
    expect(flow[i]).toBeGreaterThan(100);
  });

  it('stops water in genuine depressions instead of drawing uphill to the map edge', () => {
    const g = grid(11, (x, y) => ((x - 5) ** 2 + (y - 5) ** 2) * 0.1);
    const drainage = terrainDrainage(g);
    expect(drainage.receiver[5 * 11 + 5]).toBe(-1);
    let i = 2 * 11 + 2;
    while (drainage.receiver[i] >= 0) i = drainage.receiver[i];
    expect(i).toBe(5 * 11 + 5);
  });

  it('detours through a gentle pass and refuses a cliff with no pass', () => {
    const g = grid(17, (x, y) => (x === 8 && y < 12 ? 4 : 0));
    const route = terrainRoad(g, 5 * 17 + 3, 5 * 17 + 13);
    expect(route.length).toBeGreaterThan(10);
    expect(route.some((i) => Math.floor(i / 17) >= 12)).toBe(true);
    for (let k = 1; k < route.length; k++) {
      const a = route[k - 1],
        b = route[k];
      const distance = Math.hypot((a % 17) - (b % 17), Math.floor(a / 17) - Math.floor(b / 17));
      expect(Math.abs(g.heights[a] - g.heights[b]) / distance).toBeLessThanOrEqual(MAX_ROAD_GRADE);
    }
    const cliff = grid(17, (x) => (x >= 8 ? 4 : 0));
    expect(terrainRoad(cliff, 5 * 17 + 3, 5 * 17 + 13)).toEqual([]);
  });

  it('reconstructs welded terrain and keeps all routes draped on the surface', () => {
    const terrain = generateTerrain();
    const normalized = weld({ verts: terrain.positions, tris: terrain.indices });
    const mesh = { ...normalized, terrain: true };
    const g = terrainGrid(mesh)!;
    expect(g).not.toBeNull();
    const routes = createTerrainRoutes(mesh, MAP_DEFAULTS);
    expect(routes.some((r) => r.kind === 'river')).toBe(true);
    expect(routes.some((r) => r.kind === 'road')).toBe(true);
    expect(createTerrainRoutes(mesh, MAP_DEFAULTS)).toEqual(routes);
    for (const route of routes)
      for (let i = 0; i < route.points.length; i += 3) {
        const [x, y, z] = route.points.slice(i, i + 3);
        expect(z).toBeCloseTo(terrainHeight(g, x, y), 7);
        if (i > 0) {
          const dz = z - route.points[i - 1],
            distance = Math.hypot(x - route.points[i - 3], y - route.points[i - 2]);
          if (route.kind === 'river') expect(dz).toBeLessThanOrEqual(1e-8);
          else expect(Math.abs(dz)).toBeLessThanOrEqual(MAX_ROAD_GRADE * distance + 1e-8);
        }
      }
    expect(createTerrainRoutes({ ...normalized }, MAP_DEFAULTS)).toEqual([]);
    expect(createTerrainRoutes(mesh, { ...MAP_DEFAULTS, mapRoads: 0, mapRivers: 0 })).toEqual([]);
  });

  it('projects routes with the terrain and omits them for other sources', () => {
    const terrain = generateTerrain({ terrainRes: 64 });
    const mesh = { V: terrain.positions, T: terrain.indices, N: terrain.normals, terrain: true };
    const settings = { ...contourSettings, topographicMap: true, hide: false, el: 65, lines: 30 };
    const result = computeContours(mesh, settings, false);
    expect(result.svg).toMatch(/data-map-feature="(river|road)"/);
    expect(result.svg).not.toContain('data-map-feature="lake"');
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    const generic = computeContours({ ...mesh, terrain: false }, settings, false);
    expect(generic.svg).not.toMatch(/data-map-feature="(river|road|lake)"/);
    const noRoutes = computeContours(mesh, { ...settings, mapRoads: 0, mapRivers: 0 }, false);
    expect(noRoutes.svg).not.toMatch(/data-map-feature="(river|road)"/);
  });
});

it('keeps tributary junctions connected after draping and corner rounding', () => {
  const g = grid(31, (x, y) => Math.abs(x - 15) * 0.2 + (30 - y) * 0.03);
  const V = Float64Array.from({ length: 31 * 31 * 3 }, (_, i) => {
    const vertex = Math.floor(i / 3);
    return i % 3 === 0 ? vertex % 31 : i % 3 === 1 ? Math.floor(vertex / 31) : g.heights[vertex];
  });
  const rivers = createTerrainRoutes(
    { V, terrain: true },
    { ...MAP_DEFAULTS, mapRoads: 0, mapRivers: 6 },
  );
  expect(rivers.length).toBeGreaterThan(1);
  expect(
    rivers.slice(1).some((river, index) => {
      const end = river.points.slice(-3);
      return rivers.slice(0, index + 1).some((trunk) => {
        for (let i = 0; i < trunk.points.length - 3; i += 3)
          if (end.every((value, axis) => Math.abs(value - trunk.points[i + axis]) < 1e-8))
            return true;
        return false;
      });
    }),
  ).toBe(true);
});
