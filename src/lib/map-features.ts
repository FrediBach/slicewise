/** Decorative cartographic linework, bounded to the convex footprint of finished contours. */
import type { LabelMask } from './mapAnnotations';
import type { MapSettings } from './map-settings';

type Point = [number, number];
export type MapFeatureKind = 'house' | 'landmark' | 'woodland' | 'road' | 'river';
export interface MapFeature {
  kind: MapFeatureKind;
  name: string;
  anchor: Point;
  runs: number[][];
  masks: LabelMask[];
}
export interface MapFeatureDomain {
  runs: readonly number[][];
  width: number;
  height: number;
  margin: number;
}
export function mapRandom(seed: number, salt: number): () => number {
  let state = (Math.imul(seed + 1, 0x9e3779b1) ^ salt) | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
const PREFIXES = [
  'ALDER',
  'BIRCH',
  'CEDAR',
  'FOX',
  'WILLOW',
  'RAVEN',
  'SILVER',
  'STONE',
  'PINE',
  'WEST',
  'NORTH',
  'EAST',
  'HIGH',
  'LOW',
  'ASH',
  'OAK',
  'FERN',
  'ELK',
  'GLEN',
  'MOSS',
];
export const MAP_PLACE_TYPES = [
  'RIDGE',
  'VALLEY',
  'PASS',
  'HOLLOW',
  'MEADOW',
  'FELL',
  'MOOR',
  'BASIN',
  'GORGE',
  'PLATEAU',
  'HEATH',
  'DOWNS',
  'BLUFF',
  'HIGHLANDS',
  'COMMON',
  'HAMLET',
  'VILLAGE',
  'CROSSING',
  'FARM',
  'LODGE',
];
export function mapPlaceName(index: number, seed: number, suffix?: string): string {
  const rng = mapRandom(seed, index * 7919 + 37);
  return `${PREFIXES[Math.floor(rng() * PREFIXES.length)]} ${suffix ?? MAP_PLACE_TYPES[index % MAP_PLACE_TYPES.length]}`;
}
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function hullOf(runs: readonly number[][]): Point[] {
  const points: Point[] = [];
  for (const run of runs) {
    const step = Math.max(2, Math.ceil(run.length / 64 / 2) * 2);
    for (let i = 0; i + 1 < run.length; i += step)
      if (Number.isFinite(run[i]) && Number.isFinite(run[i + 1])) points.push([run[i], run[i + 1]]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const point of points) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function moved(run: number[], x: number, y: number, scale: number, angle = 0): number[] {
  const result: number[] = [],
    c = Math.cos(angle),
    s = Math.sin(angle);
  for (let i = 0; i < run.length; i += 2)
    result.push(
      x + scale * (run[i] * c - run[i + 1] * s),
      y + scale * (run[i] * s + run[i + 1] * c),
    );
  return result;
}
function box(x: number, y: number, width: number, height: number): LabelMask {
  return { x: x - width / 2, y: y - height / 2, width, height, angle: 0, padding: 0.15 };
}
function offsetRun(run: number[], width: number, grow = false): number[] {
  const result: number[] = [];
  for (let i = 0; i < run.length; i += 2) {
    const a = Math.max(0, i - 2),
      b = Math.min(run.length - 2, i + 2);
    const dx = run[b] - run[a],
      dy = run[b + 1] - run[a + 1],
      length = Math.hypot(dx, dy) || 1;
    const offset = width * (grow ? 0.3 + (0.7 * i) / (run.length - 2) : 1);
    result.push(run[i] - (dy / length) * offset, run[i + 1] + (dx / length) * offset);
  }
  return result;
}
function corridor(run: number[], width: number): LabelMask[] {
  const masks: LabelMask[] = [];
  for (let i = 2; i < run.length; i += 2) {
    const dx = run[i] - run[i - 2],
      dy = run[i + 1] - run[i - 1],
      angle = Math.atan2(dy, dx);
    masks.push({
      x: run[i - 2] + (Math.sin(angle) * width) / 2,
      y: run[i - 1] - (Math.cos(angle) * width) / 2,
      width: Math.hypot(dx, dy),
      height: width,
      angle,
      padding: 0.15,
    });
  }
  return masks;
}
const LANDMARKS = [
  {
    name: 'CHAPEL',
    runs: [
      [-1.4, 1.4, -1.4, -0.4, 0, -1.5, 1.4, -0.4, 1.4, 1.4, -1.4, 1.4],
      [0, -1.5, 0, -2.7],
      [-0.7, -2.1, 0.7, -2.1],
    ],
  },
  {
    name: 'LOOKOUT',
    runs: [
      [-1.2, 1.6, -0.6, -1.6, 0.6, -1.6, 1.2, 1.6],
      [-1.4, -1.6, 1.4, -1.6],
      [-0.8, 0, 0.8, 0],
      [-0.7, -0.6, 0.7, 0.8],
    ],
  },
  {
    name: 'RUINS',
    runs: [
      [-1.6, 1.3, -1.6, -1.1, -0.7, -1.1, -0.7, -0.4, 0, -0.4],
      [0.5, -1.1, 1.6, -1.1, 1.6, 1.3, -0.3, 1.3],
      [-0.8, 0.3, -0.2, 0.3],
    ],
  },
  {
    name: 'CAMP',
    runs: [
      [-1.8, 1.3, 0, -1.6, 1.8, 1.3, -1.8, 1.3],
      [0, -1.6, 0, 1.3, 0.8, 0.1],
    ],
  },
  {
    name: 'SUMMIT',
    runs: [
      [-1.6, 1.1, 0, -1.7, 1.6, 1.1, -1.6, 1.1],
      [-0.5, -0.8, 0, -0.3, 0.5, -0.8],
    ],
  },
  {
    name: 'SPRING',
    runs: [
      [-1.3, 0.6, -0.7, 0.2, 0, 0.6, 0.7, 0.2, 1.3, 0.6],
      [0, 0, 0, -1.6],
      [-0.6, -1, 0, -1.6, 0.6, -1],
    ],
  },
];

export function createMapFeatures(domain: MapFeatureDomain, settings: MapSettings): MapFeature[] {
  const hull = hullOf(domain.runs);
  if (hull.length < 3) return [];
  const inset = Math.max(3, domain.margin);
  const left = Math.max(inset, Math.min(...hull.map((p) => p[0]))),
    right = Math.min(domain.width - inset, Math.max(...hull.map((p) => p[0])));
  const top = Math.max(inset, Math.min(...hull.map((p) => p[1]))),
    bottom = Math.min(domain.height - inset, Math.max(...hull.map((p) => p[1])));
  const w = right - left,
    h = bottom - top;
  if (w < 14 || h < 14) return [];
  const inside = (x: number, y: number) =>
    x >= left &&
    x <= right &&
    y >= top &&
    y <= bottom &&
    hull.every((a, i) => cross(a, hull[(i + 1) % hull.length], [x, y]) >= -1e-7);
  const size = ((Math.min(domain.width, domain.height) / 150) * settings.mapSymbolScale) / 100;
  const seed = settings.mapSeed;
  const siteRng = mapRandom(seed, 31415);
  const sites: Point[] = [];
  for (let attempt = 0; attempt < 80 && sites.length < 9; attempt++) {
    const p: Point = [left + w * (0.15 + siteRng() * 0.7), top + h * (0.15 + siteRng() * 0.7)];
    if (inside(...p)) sites.push(p);
  }
  if (!sites.length) return [];
  const result: MapFeature[] = [];
  const accept = (feature: MapFeature) => {
    if (feature.runs.every((run) => run.every((_, i) => i % 2 || inside(run[i], run[i + 1])))) {
      result.push(feature);
      return true;
    }
    return false;
  };
  const occupied: Array<[number, number, number]> = [];
  for (const kind of ['landmark', 'house', 'woodland'] as const) {
    const salt = { landmark: 4001, house: 6007, woodland: 8009 }[kind];
    const rng = mapRandom(seed, salt);
    const count = {
      landmark: settings.mapLandmarks,
      house: settings.mapBuildings,
      woodland: settings.mapWoodland,
    }[kind];
    let placed = 0;
    for (let attempt = 0; attempt < count * 25 && placed < count; attempt++) {
      const site = sites[attempt % sites.length];
      const x =
        kind === 'house' ? site[0] + (rng() - 0.5) * w * 0.22 : left + w * (0.12 + rng() * 0.76);
      const y =
        kind === 'house' ? site[1] + (rng() - 0.5) * h * 0.22 : top + h * (0.12 + rng() * 0.76);
      // Mix isolated trees and groves without changing earlier placements as the count grows.
      const singleTree = kind === 'woodland' && (placed + seed) % 2 === 0;
      const radius = size * (kind === 'woodland' ? (singleTree ? 1.8 : 4) : 2.5);
      if (!inside(x, y) || occupied.some((p) => Math.hypot(x - p[0], y - p[1]) < radius + p[2]))
        continue;
      let runs: number[][] = [],
        masks: LabelMask[],
        name: string;
      if (kind === 'landmark') {
        const landmark = LANDMARKS[placed % LANDMARKS.length];
        runs = landmark.runs.map((run) => moved(run, x, y, size));
        masks = [box(x, y - size * 0.4, size * 3.8, size * 4.8)];
        name = mapPlaceName(placed + 80, seed, landmark.name);
      } else if (kind === 'house') {
        const angle = (rng() - 0.5) * 1.2;
        runs = [
          [-1, -0.7, 1, -0.7, 1, 0.7, -1, 0.7, -1, -0.7],
          [-1, 0, 1, 0],
        ].map((run) => moved(run, x, y, size, angle));
        masks = [box(x, y, size * 2.5, size * 2.5)];
        name = mapPlaceName(placed + 100, seed, placed % 3 ? 'HAMLET' : 'FARM');
      } else {
        const trees = singleTree
          ? [[0, 0]]
          : [
              [-1.8, 0.8],
              [0, -1.2],
              [1.8, 0.8],
            ];
        for (const [tx, ty] of trees)
          runs.push(
            ...[
              [-0.9, 0.6, 0, -1.2, 0.9, 0.6, -0.9, 0.6],
              [0, 0.6, 0, 1.2],
            ].map((run) => moved(run, x + tx * size, y + ty * size, size)),
          );
        masks = [box(x, y, size * (singleTree ? 2.1 : 5.7), size * (singleTree ? 2.7 : 5))];
        name = mapPlaceName(placed + 120, seed, singleTree ? 'TREE' : 'WOOD');
      }
      if (accept({ kind, name, anchor: [x, y], runs, masks })) {
        occupied.push([x, y, radius]);
        placed++;
      }
    }
  }
  return result;
}

/** Route centrelines already follow the terrain and have passed through projection/effects. */
export function terrainRouteFeature(
  kind: 'road' | 'river',
  runs: number[][],
  index: number,
  settings: MapSettings,
  size: number,
): MapFeature {
  const width = size * (kind === 'road' ? 0.35 : 0.22);
  const longest = runs.reduce((a, b) => (a.length >= b.length ? a : b), [] as number[]);
  const middle = Math.floor(longest.length / 4) * 2;
  return {
    kind,
    name: mapPlaceName(
      index + (kind === 'road' ? 20 : 40),
      settings.mapSeed,
      kind === 'road' ? 'ROAD' : 'RIVER',
    ),
    anchor: [longest[middle] ?? 0, longest[middle + 1] ?? 0],
    runs: runs.flatMap((run) => [
      offsetRun(run, width, kind === 'river'),
      offsetRun(run, -width, kind === 'river'),
    ]),
    masks: runs.flatMap((run) => corridor(run, width)),
  };
}
