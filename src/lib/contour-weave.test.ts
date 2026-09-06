import { describe, expect, it } from 'vitest';
import {
  createSurfaceWeave,
  type SurfaceWeaveMesh,
  type SurfaceWeaveThread,
} from './contour-weave';
import { WEAVE_DEFAULTS, resolveWeaveSettings } from './contour-weave-settings';
import { normalizeParameterSnapshot } from './parameter-migrations';
import { computeContours, type ContourSettings } from './contour-engine';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { torusKnot } from './demo-meshes';
import { weld, vertexNormals } from './mesh';
const enabled = {
  ...WEAVE_DEFAULTS,
  contourWeave: true,
  weaveAzimuth: 0,
  weaveElevation: 0,
  weaveRoll: 0,
};
const sheet = (y: number): SurfaceWeaveMesh => ({
  V: [-1, y, -1, 1, y, -1, 1, y, 1, -1, y, 1],
  T: [0, 1, 2, 0, 2, 3],
});
const length = (threads: SurfaceWeaveThread[]) =>
  threads.reduce((sum, t) => {
    for (let i = 0; i < t.segments.length; i += 2) {
      const a = t.segments[i] * 3,
        b = t.segments[i + 1] * 3;
      sum += Math.hypot(
        t.points[a] - t.points[b],
        t.points[a + 1] - t.points[b + 1],
        t.points[a + 2] - t.points[b + 2],
      );
    }
    return sum;
  }, 0);

describe('surface weave', () => {
  it('creates both families entirely on the original triangles', () => {
    const mesh = sheet(0.3);
    const result = createSurfaceWeave(mesh, enabled, 12, 80, 0.35);
    expect(new Set(result.map((t) => t.family))).toEqual(new Set(['warp', 'weft']));
    for (const thread of result) {
      for (let i = 0; i < thread.points.length; i += 3) {
        expect(thread.points[i]).toBeGreaterThanOrEqual(-1);
        expect(thread.points[i]).toBeLessThanOrEqual(1);
        expect(thread.points[i + 1]).toBeCloseTo(0.3);
        expect(thread.points[i + 2]).toBeGreaterThanOrEqual(-1);
        expect(thread.points[i + 2]).toBeLessThanOrEqual(1);
      }
    }
  });
  it('weaves flat horizontal artwork with the default fabric orientation', () => {
    const flat = { V: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], T: [0, 1, 2, 0, 2, 3] };
    const result = createSurfaceWeave(
      flat,
      { ...WEAVE_DEFAULTS, contourWeave: true },
      16,
      80,
      0.35,
    );
    expect(result.some((t) => t.family === 'warp')).toBe(true);
    expect(result.some((t) => t.family === 'weft')).toBe(true);
    for (const t of result)
      for (let i = 2; i < t.points.length; i += 3) expect(t.points[i]).toBe(0);
  });
  it('keeps separate folds separate even when they overlap in projection', () => {
    const front = sheet(0.4),
      back = sheet(-0.4);
    const together = {
      V: [...Array.from(front.V), ...Array.from(back.V)],
      T: [...Array.from(front.T), ...Array.from(back.T, (v) => v + 4)],
    };
    const isolated = createSurfaceWeave(front, enabled, 16, 80, 0.35);
    const result = createSurfaceWeave(together, enabled, 16, 80, 0.35);
    expect(length(result)).toBeCloseTo(length(isolated) * 2, 6);
    for (const t of result)
      for (let i = 0; i < t.segments.length; i += 2)
        expect(t.points[t.segments[i] * 3 + 1]).toBe(t.points[t.segments[i + 1] * 3 + 1]);
  });
  it('alternates over/under using surface thread indexes and supports fixed layering', () => {
    const mesh = sheet(0);
    const plain = createSurfaceWeave(mesh, enabled, 12, 80, 0.35);
    for (const weavePattern of ['twill', 'basket', 'warp', 'weft'])
      expect(createSurfaceWeave(mesh, { ...enabled, weavePattern }, 12, 80, 0.35)).not.toEqual(
        plain,
      );
    expect(createSurfaceWeave(mesh, { ...enabled, weavePhase: 1 }, 12, 80, 0.35)).not.toEqual(
      plain,
    );
    const warpOver = createSurfaceWeave(mesh, { ...enabled, weavePattern: 'warp' }, 12, 80, 0.35);
    expect(length(warpOver.filter((t) => t.family === 'warp'))).toBeGreaterThan(
      length(plain.filter((t) => t.family === 'warp')),
    );
  });
  it('returns complementary cut fragments without ever leaving the surface', () => {
    const mesh = sheet(0);
    const kept = createSurfaceWeave(mesh, enabled, 12, 80, 0.35);
    const fragments = createSurfaceWeave(
      mesh,
      { ...enabled, weaveOutput: 'crossings' },
      12,
      80,
      0.35,
    );
    const uncut = createSurfaceWeave(mesh, { ...enabled, weaveGap: 0 }, 12, 80, 0);
    expect(length(kept) + length(fragments)).toBeCloseTo(length(uncut), 6);
    expect(length(fragments)).toBeGreaterThan(0);
    for (const family of ['warp', 'weft'])
      expect(
        createSurfaceWeave(mesh, { ...enabled, weaveOutput: family }, 12, 80, 0.35).every(
          (t) => t.family === family,
        ),
      ).toBe(true);
  });
  it('keeps material-cell gaps bounded but permits deliberately destructive settings', () => {
    const mesh = sheet(0);
    const safe = createSurfaceWeave(mesh, { ...enabled, weaveGap: 15 }, 20, 80, 0.35);
    const destructive = createSurfaceWeave(
      mesh,
      { ...enabled, weaveGap: 15, weaveProtection: 0 },
      20,
      80,
      0.35,
    );
    expect(length(safe)).toBeGreaterThan(length(destructive));
    expect(length(safe)).toBeGreaterThan(0);
  });
  it('changes density, twist, slide, and fabric orientation on the same mesh', () => {
    const mesh = makeContourMesh();
    const plain = createSurfaceWeave(mesh, enabled, 16, 80, 0.35);
    for (const changes of [
      { weaveAzimuth: 35 },
      { weaveElevation: 30 },
      { weaveAngle: 60 },
      { weaveDensity: 150 },
      { weaveShift: 50 },
      { weaveTwist: 140 },
      { weaveWidth: 0.8 },
    ]) {
      const result = createSurfaceWeave(mesh, { ...enabled, ...changes }, 16, 80, 0.35);
      expect(result).not.toEqual(plain);
      expect(result.flatMap((t) => t.points).every(Number.isFinite)).toBe(true);
    }
  });
  it('reuses deterministic camera-independent mesh geometry and rejects non-mesh sources', () => {
    const mesh = makeContourMesh();
    const result = createSurfaceWeave(mesh, enabled, 16, 80, 0.35);
    expect(createSurfaceWeave(mesh, enabled, 16, 80, 0.35)).toBe(result);
    expect(createSurfaceWeave({ V: mesh.V, T: [] }, enabled, 16, 80, 0.35)).toEqual([]);
    expect(createSurfaceWeave(mesh, {}, 16, 80, 0.35)).toEqual([]);
  });
  it('migrates obsolete copy-transform controls and targets without mutating the snapshot', () => {
    const stored = {
      ...contourSettings,
      weaveRotation: 60,
      weaveScale: 180,
      weaveOffsetX: 20,
      weaveStride: 3,
      morphTargets: { weaveRotation: 90, weaveTwist: 120 },
      morphTargets2: { weaveOffsetX: 50 },
      weaveGap: 0,
    } as ContourSettings;
    const restored = normalizeParameterSnapshot(stored);
    expect(restored).not.toHaveProperty('weaveRotation');
    expect(restored).not.toHaveProperty('weaveScale');
    expect(restored.morphTargets).toEqual({ weaveTwist: 120 });
    expect(restored.morphTargets2).toEqual({});
    expect(restored.weaveGap).toBe(0);
    expect(stored).toHaveProperty('weaveRotation', 60);
    expect(resolveWeaveSettings({ weaveAngle: Infinity, weaveDensity: -50 })).toMatchObject({
      weaveAngle: 90,
      weaveDensity: 25,
    });
  });
  it('projects and hides both families on a single mesh, with stable colour morphs and physical gaps', () => {
    const raw = weld(torusKnot(2, 3, 1, 0.26, 120, 16));
    const mesh = { ...raw, N: vertexNormals(raw.V, raw.T) };
    const config = {
      ...contourSettings,
      ...enabled,
      lines: 24,
      pw: 210,
      ph: 210,
      hide: true,
      sil: false,
    };
    const result = computeContours(mesh, config, false);
    expect(result.svg).toContain(enabled.weaveColor);
    expect(result.toolpaths).toHaveLength(2);
    expect(result.toolpaths.every((g) => g.preserveGaps && g.runs.length)).toBe(true);
    const shown = computeContours(mesh, { ...config, hide: false }, false);
    const runLength = (runs: number[][]) =>
      runs.reduce((sum, run) => {
        for (let i = 2; i < run.length; i += 2)
          sum += Math.hypot(run[i] - run[i - 2], run[i + 1] - run[i - 1]);
        return sum;
      }, 0);
    expect(runLength(shown.toolpaths.flatMap((g) => g.runs))).toBeGreaterThan(
      runLength(result.toolpaths.flatMap((g) => g.runs)),
    );
    expect(computeContours(mesh, { ...config, az: config.az + 35 }, false).svg).not.toBe(
      result.svg,
    );
    expect(computeContours(mesh, config, true).toolpaths).toEqual([]);
    const ribbonSource = computeContours(
      mesh,
      { ...config, weaveWidth: 0.7 },
      false,
    ).sequenceSource!;
    expect(new Set(ribbonSource.slices.map((slice) => slice.index)).size).toBe(
      ribbonSource.slices.length,
    );
    expect(
      computeContours(mesh, { ...config, weaveColor: config.color }, false).toolpaths,
    ).toHaveLength(1);
    const morph = computeContours(
      mesh,
      {
        ...config,
        morphEnabled: true,
        morphSteps: 2,
        morphTargets: { weaveTwist: 100, weaveColor: '#123456' },
      },
      false,
    );
    expect(morph.svg).toContain('#123456');
    expect(morph.svg.match(/data-morph-x-step=/g)).toHaveLength(2);
    const lineArt = {
      V: new Float32Array([-1, 0, 0, 1, 0, 0]),
      T: new Uint32Array(),
      lineArt: { offsets: new Uint32Array([0, 2]) },
    };
    expect(computeContours(lineArt, config, false).svg).toBe(
      computeContours(lineArt, { ...config, contourWeave: false }, false).svg,
    );
  });
});
