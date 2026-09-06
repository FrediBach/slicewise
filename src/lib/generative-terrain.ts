/** Seeded, Z-up square height fields. No skirt, base, or edge falloff. */
import type { GeneratedMesh } from './generativeMesh';

export interface TerrainParams {
  terrainSeed: number;
  terrainRelief: number;
  terrainScale: number;
  terrainRidges: number;
  terrainDetail: number;
  terrainErosion: number;
  terrainRes: number;
}

export const TERRAIN_DEFAULTS: TerrainParams = {
  terrainSeed: 7,
  terrainRelief: 55,
  terrainScale: 2.4,
  terrainRidges: 65,
  terrainDetail: 45,
  terrainErosion: 40,
  terrainRes: 160,
};

// Also defines the UI bounds; source parameters are deliberately not morphable.
export const TERRAIN_CONTROLS = [
  { id: 'terrainSeed', label: 'Terrain seed', min: 0, max: 9999, step: 1 },
  { id: 'terrainRelief', label: 'Vertical relief', min: 5, max: 100, step: 1, unit: '%' },
  { id: 'terrainScale', label: 'Landform frequency', min: 0.5, max: 6, step: 0.1 },
  { id: 'terrainRidges', label: 'Mountain ridges', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'terrainDetail', label: 'Surface detail', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'terrainErosion', label: 'Erosion', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'terrainRes', label: 'Terrain resolution', min: 32, max: 256, step: 1 },
] as const;

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Quintic gradient noise avoids the grid-aligned terraces of value noise. */
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const dx = x - ix,
    dy = y - iy;
  const fade = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);
  const dot = (a: number, b: number, u: number, v: number) => {
    const angle = (hash(a, b, seed) / 4294967296) * Math.PI * 2;
    return Math.cos(angle) * u + Math.sin(angle) * v;
  };
  const a = dot(ix, iy, dx, dy),
    b = dot(ix + 1, iy, dx - 1, dy);
  const c = dot(ix, iy + 1, dx, dy - 1),
    d = dot(ix + 1, iy + 1, dx - 1, dy - 1);
  const u = fade(dx),
    v = fade(dy);
  return 1.6 * ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v);
}

/** Drainage incision followed by conservative talus relaxation, with open outlets. */
function erode(heights: Float64Array, n: number, amount: number): void {
  if (amount === 0) return;
  const cell = 2 / (n - 1);
  const order = Array.from(heights, (_, i) => i).sort((a, b) => heights[b] - heights[a] || a - b);
  const drainage = new Float64Array(heights.length).fill(cell * cell);
  const incision = new Float64Array(heights.length);
  for (const i of order) {
    const x = i % n,
      y = Math.floor(i / n);
    let receiver = -1,
      slope = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= n || y + dy < 0 || y + dy >= n) continue;
        const j = i + dy * n + dx;
        const gradient = (heights[i] - heights[j]) / (cell * Math.hypot(dx, dy));
        if (gradient > slope) {
          slope = gradient;
          receiver = j;
        }
      }
    if (receiver >= 0) {
      drainage[receiver] += drainage[i];
      incision[i] = amount * Math.min(0.12, Math.sqrt(drainage[i]) * Math.sqrt(slope) * 0.18);
    }
  }
  for (let i = 0; i < heights.length; i++) heights[i] -= incision[i];
  const delta = new Float64Array(heights.length);
  for (let iteration = 0; iteration < 12; iteration++) {
    delta.fill(0);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        for (const j of [x + 1 < n ? i + 1 : -1, y + 1 < n ? i + n : -1]) {
          if (j < 0) continue;
          const diff = heights[i] - heights[j];
          const transfer =
            Math.sign(diff) * Math.max(0, Math.abs(diff) - cell * 0.65) * 0.12 * amount;
          delta[i] -= transfer;
          delta[j] += transfer;
        }
      }
    for (let i = 0; i < heights.length; i++) heights[i] += delta[i];
  }
}

export function generateTerrain(input: Partial<TerrainParams> = {}): GeneratedMesh {
  const started = Date.now();
  const p = { ...TERRAIN_DEFAULTS };
  for (const control of TERRAIN_CONTROLS) {
    const value = input[control.id];
    if (typeof value === 'number' && Number.isFinite(value))
      p[control.id] = Math.max(control.min, Math.min(control.max, value));
  }
  const seed = Math.round(p.terrainSeed),
    res = Math.round(p.terrainRes),
    n = res + 1;
  const heights = new Float64Array(n * n);
  const detail = p.terrainDetail / 100,
    ridges = p.terrainRidges / 100;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = ((x / res) * 2 - 1) * p.terrainScale + 17.3;
      const v = ((y / res) * 2 - 1) * p.terrainScale - 9.1;
      const wx = u + 0.7 * noise(u * 0.6, v * 0.6, seed + 101);
      const wy = v + 0.7 * noise(u * 0.6 + 31, v * 0.6, seed + 211);
      const broad = noise(wx * 0.48, wy * 0.48, seed + 307);
      let elevation = broad * 0.42,
        amplitude = 0.5,
        frequency = 1,
        weight = 1;
      for (let octave = 0; octave < 6; octave++) {
        // Stop before sub-grid frequencies alias into spurious tiny contours.
        if (frequency * p.terrainScale > res / 4) break;
        const sample = noise(wx * frequency, wy * frequency, seed + octave * 7919);
        const ridge = Math.pow(1 - Math.abs(sample), 2);
        elevation += amplitude * ((1 - ridges) * sample + ridges * (ridge - 0.55) * weight);
        weight = Math.max(0.15, Math.min(1, ridge * 1.8));
        amplitude *= 0.28 + detail * 0.3;
        frequency *= 2.07;
      }
      heights[y * n + x] = elevation;
    }
  erode(heights, n, p.terrainErosion / 100);
  let min = Infinity,
    max = -Infinity;
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  const relief = (p.terrainRelief / 100) * 1.25;
  const positions = new Float32Array(n * n * 3),
    normals = new Float32Array(positions.length);
  const indices = new Uint32Array(res * res * 6);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      positions[i * 3] = (x / res) * 2 - 1;
      positions[i * 3 + 1] = (y / res) * 2 - 1;
      positions[i * 3 + 2] = ((heights[i] - min) / (max - min || 1) - 0.5) * relief;
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const left = Math.max(0, x - 1),
        right = Math.min(res, x + 1);
      const down = Math.max(0, y - 1),
        up = Math.min(res, y + 1);
      const dx =
        (positions[(y * n + right) * 3 + 2] - positions[(y * n + left) * 3 + 2]) /
        (((right - left) * 2) / res);
      const dy =
        (positions[(up * n + x) * 3 + 2] - positions[(down * n + x) * 3 + 2]) /
        (((up - down) * 2) / res);
      const length = Math.hypot(dx, dy, 1);
      normals.set([-dx / length, -dy / length, 1 / length], i * 3);
      if (x < res && y < res)
        indices.set([i, i + 1, i + n, i + 1, i + n + 1, i + n], (y * res + x) * 6);
    }
  return {
    positions,
    normals,
    indices,
    stats: {
      vertexCount: n * n,
      triangleCount: res * res * 2,
      samples: n * n,
      ms: Date.now() - started,
    },
  };
}
