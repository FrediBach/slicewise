import { describe, expect, it } from 'vitest';
import { createSliceNormalCollector, createSurfaceSliceRays } from './slice-ray-surface';
import { SLICE_RAY_DEFAULTS } from './slice-rays-settings';
import { computeContours, type ContourSettings } from './contour-engine';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';

const settings = {
  ...SLICE_RAY_DEFAULTS,
  sliceRays: true,
  sliceRayAmount: 4,
  sliceRayFade: 0,
  sliceRayVariation: 0,
};
const points = [-1, 0, 0, 1, 0, 0];
const normals = [0, 0, 1, 0, 0, 1];

describe('surface slice rays', () => {
  it('uses interpolated normals and falls back to authored face winding', () => {
    const mesh = { V: [0, 0, 0, 1, 0, 0, 0, 1, 0], N: [0, 0, 1, 0, 1, 1, 1, 0, 1] };
    const collector = createSliceNormalCollector(mesh);
    collector.triangle(0, 1, 2);
    collector.add(0, [0.25, 0.25, 0]);
    expect(collector.normals[0]).toBeCloseTo(collector.normals[1]);
    expect(collector.normals[2]).toBeCloseTo(collector.normals[0] * 4);
    const face = createSliceNormalCollector({ V: mesh.V });
    face.triangle(0, 1, 2);
    face.add(0, [0.25, 0.25, 0]);
    expect(face.normals).toEqual([0, 0, 1]);
  });

  it('emits outward from open intrinsic contours with winding-independent path direction', () => {
    const rays = createSurfaceSliceRays(points, [[0, 1]], normals, undefined, settings);
    expect(rays).toHaveLength(4);
    for (const { points: ray } of rays) {
      expect(ray[3]).toBe(ray[0]);
      expect(ray[4]).toBe(ray[1]);
      expect(ray[5]).toBeCloseTo(0.24);
    }
    const reversed = createSurfaceSliceRays(points, [[1, 0]], normals, undefined, settings);
    expect(reversed.every((r) => r.points[5] > 0)).toBe(true);
  });

  it('uses local field tangents and skips singular or indeterminate directions', () => {
    const rays = createSurfaceSliceRays(points, [[0, 1]], normals, () => [0, 1, 1], settings);
    expect(rays).toHaveLength(4);
    for (const { points: ray } of rays) {
      expect(ray[4] + ray[5]).toBeCloseTo(0);
      expect(ray[5]).toBeGreaterThan(0);
      expect(Math.hypot(ray[4], ray[5])).toBeCloseTo(0.24);
    }
    expect(createSurfaceSliceRays(points, [[0, 1]], normals, () => null, settings)).toEqual([]);
    expect(createSurfaceSliceRays(points, [[0, 1]], normals, () => [0, 0, 1], settings)).toEqual(
      [],
    );
    expect(createSurfaceSliceRays(points, [[0, 1]], [], undefined, settings)).toEqual([]);
    expect(
      createSurfaceSliceRays(points, [[0, 1]], normals, undefined, {
        ...settings,
        sliceRayAmount: 0,
      }),
    ).toEqual([]);
  });

  it('keeps all fade dashes translated with their interpolated exploded root', () => {
    const rays = createSurfaceSliceRays(
      points,
      [[0, 1]],
      normals,
      undefined,
      { ...settings, sliceRayAmount: 1, sliceRayFade: 100 },
      0,
      [-1, 0, 1, 1, 0, 3],
    );
    expect(rays).toHaveLength(6);
    for (const ray of rays) {
      expect(ray.outputPoints[2] - ray.points[2]).toBeCloseTo(2);
      expect(ray.outputPoints[5] - ray.points[5]).toBeCloseTo(2);
    }
  });

  const modes: Partial<ContourSettings>[] = [
    { axis: 'spherical', waveCenterX: 30, explodeAmount: 25 },
    { axis: 'cylindrical', cylinderAzimuth: 30, cylinderElevation: 45 },
    { axis: 'geodesic', geodesicMode: 'single' },
    { axis: 'geodesic', geodesicMode: 'nearest' },
    { axis: 'geodesic', geodesicMode: 'difference' },
    { axis: 'geodesic', geodesicMode: 'voronoi' },
    { axis: 'curvature' },
    { axis: 'up', divergence: 35, explodeAmount: 20 },
    { axis: 'up', sliceLfo: true },
    { axis: 'custom', sliceLfo: true, divergence: 35 },
  ];
  it.each(modes)(
    'adds finite, exportable rays for %j without affecting source features',
    (patch) => {
      const mesh = makeContourMesh();
      const base = { ...contourSettings, lines: 6, sil: false, hide: false, quality: 3, ...patch };
      const plain = computeContours(mesh, base, false);
      const rays = computeContours(mesh, { ...base, sliceRays: true }, false);
      expect(rays.paths).toBeGreaterThan(plain.paths);
      expect(rays.toolpaths.flatMap((g) => g.runs).length).toBeGreaterThan(
        plain.toolpaths.flatMap((g) => g.runs).length,
      );
      expect(rays.toolpaths.some((g) => g.preserveGaps)).toBe(true);
      expect(rays.sequenceSource).toEqual(plain.sequenceSource);
      expect(rays.svg).not.toMatch(/NaN|Infinity/);
      const again = computeContours(mesh, { ...base, sliceRays: true }, false);
      expect(again.svg).toBe(rays.svg);
      const quick = computeContours(mesh, { ...base, sliceRays: true }, true);
      expect(quick.paths).toBeGreaterThan(computeContours(mesh, base, true).paths);
      const hidden = computeContours(mesh, { ...base, sliceRays: true, hide: true }, false);
      expect(hidden.svg).not.toMatch(/NaN|Infinity/);
    },
  );
});
