import { describe, expect, it } from 'vitest';
import { createSliceRays } from './slice-rays';
import { SLICE_RAY_DEFAULTS, resolveSliceRaySettings } from './slice-rays-settings';
import { normalizeParameterSnapshot } from './parameter-migrations';
import { computeContours } from './contour-engine';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';

const square = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
const ring = [0, 1, 2, 3, 0];
const settings = {
  ...SLICE_RAY_DEFAULTS,
  sliceRays: true,
  sliceRayAmount: 4,
  sliceRayLength: 10,
  sliceRayVariation: 0,
  sliceRayFade: 0,
};
const length = (r: number[]) => Math.hypot(r[3] - r[0], r[4] - r[1], r[5] - r[2]);

describe('slice rays', () => {
  it('retains sparse rays when arc-length samples land exactly on corners', () => {
    for (const sliceRayAmount of [1, 2, 8])
      expect(
        createSliceRays(square, [ring], [0, 0, 1], { ...settings, sliceRayAmount }),
      ).toHaveLength(sliceRayAmount);
  });

  it('emits the requested count outward in the slice plane regardless of winding', () => {
    const rays = createSliceRays(square, [ring], [0, 0, 1], settings);
    expect(rays).toHaveLength(4);
    for (const r of rays) {
      expect(length(r)).toBeCloseTo(0.2);
      expect(r[2]).toBe(0);
      expect(r[5]).toBe(0);
      expect(Math.max(Math.abs(r[3]), Math.abs(r[4]))).toBeCloseTo(1.2);
    }
    const reversed = createSliceRays(square, [[...ring].reverse()], [0, 0, -1], settings);
    expect(reversed.map((r) => r.join(',')).sort()).toEqual(rays.map((r) => r.join(',')).sort());
  });

  it('keeps rays on tilted planes', () => {
    const tilt = (values: number[]) =>
      values.flatMap((_, i) =>
        i % 3 ? [] : [values[i], values[i + 1] / Math.sqrt(2), values[i + 1] / Math.sqrt(2)],
      );
    const rays = createSliceRays(tilt(square), [ring], [0, -Math.SQRT1_2, Math.SQRT1_2], settings);
    expect(rays).toHaveLength(4);
    for (const ray of rays) {
      expect(ray[1]).toBeCloseTo(ray[2]);
      expect(ray[4]).toBeCloseTo(ray[5]);
      expect(length(ray)).toBeCloseTo(0.2);
    }
  });

  it('preserves fade gaps when only a morph target has fading', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        sliceRays: true,
        sliceRayFade: 0,
        lines: 4,
        morphEnabled: true,
        morphSteps: 2,
        morphTargets: { sliceRayFade: 100 },
      },
      false,
    );
    expect(result.toolpaths.length).toBeGreaterThan(0);
    expect(result.toolpaths.every((group) => group.preserveGaps)).toBe(true);
  });

  it('points hole rays into empty space and stops at the opposite boundary', () => {
    const points = [...square, -0.2, -0.2, 0, 0.2, -0.2, 0, 0.2, 0.2, 0, -0.2, 0.2, 0];
    const rays = createSliceRays(points, [ring, [4, 5, 6, 7, 4]], [0, 0, 1], {
      ...settings,
      sliceRayAmount: 24,
      sliceRayLength: 100,
    });
    const holes = rays.filter((r) => Math.max(Math.abs(r[0]), Math.abs(r[1])) < 0.3);
    expect(holes).toHaveLength(4);
    for (const r of holes) {
      expect(Math.abs(r[3])).toBeLessThanOrEqual(0.2);
      expect(Math.abs(r[4])).toBeLessThanOrEqual(0.2);
      expect(length(r)).toBeCloseTo(0.4, 4);
    }
  });

  it('keeps rays out of the opposite arm of a concave slice', () => {
    const points = [
      -1, -1, 0, 1, -1, 0, 1, 1, 0, 0.3, 1, 0, 0.3, 0, 0, -0.3, 0, 0, -0.3, 1, 0, -1, 1, 0,
    ];
    const rays = createSliceRays(points, [[0, 1, 2, 3, 4, 5, 6, 7, 0]], [0, 0, 1], {
      ...settings,
      sliceRayAmount: 100,
      sliceRayLength: 100,
    });
    const inward = rays.filter(
      (r) => Math.abs(Math.abs(r[0]) - 0.3) < 1e-8 && r[1] > 0 && r[1] < 1,
    );
    expect(inward.length).toBeGreaterThan(0);
    for (const r of inward) expect(Math.abs(r[3])).toBeLessThan(0.3);
  });

  it('creates deterministic variation and real, widening fade gaps', () => {
    const faded = { ...settings, sliceRayVariation: 80, sliceRayFade: 100 };
    const rays = createSliceRays(square, [ring], [0, 0, 1], faded, 3);
    expect(rays).toEqual(createSliceRays(square, [ring], [0, 0, 1], faded, 3));
    expect(rays).not.toEqual(createSliceRays(square, [ring], [0, 0, 1], faded, 4));
    expect(rays).toHaveLength(24);
    expect(length(rays[0])).toBeGreaterThan(length(rays[5]));
    const gap = (i: number) => Math.hypot(rays[i + 1][0] - rays[i][3], rays[i + 1][1] - rays[i][4]);
    expect(gap(0)).toBeGreaterThan(0);
    expect(gap(4)).toBeGreaterThan(gap(0));
  });

  it('preserves zero settings, skips open/invalid geometry, and migrates old snapshots', () => {
    for (const patch of [{ sliceRays: false }, { sliceRayAmount: 0 }, { sliceRayLength: 0 }])
      expect(createSliceRays(square, [ring], [0, 0, 1], { ...settings, ...patch })).toEqual([]);
    expect(createSliceRays(square, [[0, 1, 2]], [0, 0, 1], settings)).toEqual([]);
    expect(createSliceRays(square, [ring], [0, 0, 0], settings)).toEqual([]);
    expect(resolveSliceRaySettings({ sliceRayLength: NaN, sliceRayAmount: Infinity })).toEqual(
      SLICE_RAY_DEFAULTS,
    );
    const old = { ...contourSettings, sliceRays: undefined, sliceRayLength: undefined };
    expect(normalizeParameterSnapshot(old).sliceRayLength).toBe(12);
    expect(normalizeParameterSnapshot(old).sliceRays).toBe(false);
  });

  it('adds projected plotter paths, protects fade gaps, and leaves sequence features unchanged', () => {
    const mesh = makeContourMesh();
    const base = { ...contourSettings, lines: 8, sil: false, hide: false };
    const plain = computeContours(mesh, base, false);
    const rays = computeContours(mesh, { ...base, sliceRays: true }, false);
    expect(rays.paths).toBeGreaterThan(plain.paths);
    expect(rays.toolpaths.flatMap((g) => g.runs).length).toBeGreaterThan(
      plain.toolpaths.flatMap((g) => g.runs).length,
    );
    expect(rays.toolpaths.every((g) => g.preserveGaps)).toBe(true);
    expect(rays.sequenceSource).toEqual(plain.sequenceSource);
    expect(rays.svg).not.toMatch(/NaN|Infinity/);
    const quick = computeContours(mesh, { ...base, sliceRays: true }, true);
    expect(quick.paths).toBeGreaterThan(computeContours(mesh, base, true).paths);
    const hiddenBase = computeContours(mesh, { ...base, hide: true }, false);
    const hiddenRays = computeContours(mesh, { ...base, hide: true, sliceRays: true }, false);
    expect(hiddenRays.paths).toBeGreaterThan(hiddenBase.paths);
    expect(hiddenRays.svg).not.toMatch(/NaN|Infinity/);
    for (const patch of [
      { axis: 'svg', svgSlicePaths: [[-1, 0, 1, 0]] },
      { spiral: true },
      { contourWeave: true },
    ]) {
      expect(computeContours(mesh, { ...base, ...patch, sliceRays: true }, false).svg).toBe(
        computeContours(mesh, { ...base, ...patch, sliceRays: false }, false).svg,
      );
    }
  });
});
