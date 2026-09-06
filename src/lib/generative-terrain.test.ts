import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import { computeContours } from './contour-engine';
import { generateTerrain } from './generative-terrain';
import { getMeshTopology } from './mesh-topology';

const asMesh = (mesh: ReturnType<typeof generateTerrain>) => ({
  V: mesh.positions,
  T: mesh.indices,
  N: mesh.normals,
});

describe('generative terrain', () => {
  it('is deterministic with exactly one upward surface and four open square edges', () => {
    const terrain = generateTerrain({ terrainRes: 32 });
    expect(terrain.positions).toEqual(generateTerrain({ terrainRes: 32 }).positions);
    expect(terrain.positions).not.toEqual(
      generateTerrain({ terrainRes: 32, terrainSeed: 18 }).positions,
    );
    const topology = getMeshTopology(asMesh(terrain));
    expect(topology.boundaryEdges.length / 2).toBe(4 * 32);
    expect(topology.nonManifoldEdges).toHaveLength(0);
    expect(topology.componentCount).toBe(1);
    expect(terrain.indices.length / 3).toBe(32 * 32 * 2);
    const edgeHeights: number[] = [];
    for (let i = 0; i < terrain.positions.length; i += 3) {
      const [x, y, z] = terrain.positions.slice(i, i + 3);
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
      if (Math.abs(x) === 1 || Math.abs(y) === 1) edgeHeights.push(z);
      expect(terrain.normals[i + 2]).toBeGreaterThan(0);
      expect(Math.hypot(...terrain.normals.slice(i, i + 3))).toBeCloseTo(1, 5);
    }
    expect(Math.max(...edgeHeights) - Math.min(...edgeHeights)).toBeGreaterThan(0.3);
    for (let i = 0; i < terrain.indices.length; i += 3) {
      const [a, b, c] = terrain.indices.slice(i, i + 3).map((index) => index * 3);
      const v = terrain.positions;
      expect(
        (v[b] - v[a]) * (v[c + 1] - v[a + 1]) - (v[b + 1] - v[a + 1]) * (v[c] - v[a]),
      ).toBeGreaterThan(0);
    }
  });

  it('changes vertical relief without moving landforms and bounds invalid inputs', () => {
    const flat = generateTerrain({ terrainRes: 32, terrainRelief: 20 });
    const steep = generateTerrain({ terrainRes: 32, terrainRelief: 80 });
    for (let i = 0; i < flat.positions.length; i++)
      expect(steep.positions[i]).toBeCloseTo(flat.positions[i] * (i % 3 === 2 ? 4 : 1), 6);
    const safe = generateTerrain({
      terrainRes: -Infinity,
      terrainSeed: NaN,
      terrainScale: 999,
      terrainErosion: 100,
    });
    expect(safe.positions.every(Number.isFinite)).toBe(true);
    expect(safe.normals.every(Number.isFinite)).toBe(true);
  });

  it.each(['terrainScale', 'terrainRidges', 'terrainDetail', 'terrainErosion'] as const)(
    '%s changes landforms without changing the square topology',
    (key) => {
      const a = generateTerrain({ terrainRes: 40, [key]: key === 'terrainScale' ? 1 : 0 });
      const b = generateTerrain({ terrainRes: 40, [key]: key === 'terrainScale' ? 5 : 100 });
      expect(a.positions).not.toEqual(b.positions);
      expect(a.indices).toEqual(b.indices);
      for (let i = 0; i < a.positions.length; i++)
        if (i % 3 !== 2) expect(a.positions[i]).toBe(b.positions[i]);
    },
  );

  it('slices the open landscape with and without hidden-line removal and map annotations', () => {
    const mesh = asMesh(generateTerrain({ terrainRes: 40 }));
    for (const hide of [false, true]) {
      const result = computeContours(
        mesh,
        {
          ...contourSettings,
          axis: 'up',
          el: 60,
          lines: 40,
          hide,
          sil: true,
          topographicMap: true,
        },
        false,
      );
      expect(result.svg).not.toMatch(/NaN|Infinity/);
      expect(result.svg).toContain('data-map-label=');
      expect(result.svg).toMatch(/data-altitudes="[0-9,]+"/);
      expect(result.toolpaths.flatMap((group) => group.runs).length).toBeGreaterThan(30);
      for (const group of result.toolpaths)
        if (group.runWeights) expect(group.runWeights.length).toBe(group.runs.length);
    }
  });
});
