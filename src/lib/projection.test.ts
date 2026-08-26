import { describe, expect, it } from 'vitest';
import {
  cameraBasis,
  distortLens,
  inverseTransformPoincareDisk,
  projectCameraPoint,
  projectCameraPointResult,
  projectMesh,
  projectPolylineAdaptive,
  projectWorldPoint,
  resolveLens,
  resolveProjectionWarpMode,
  transformPoincareDisk,
  warpKleinPoincare,
} from './projection';

const expectPointCloseTo = (actual: readonly number[], expected: readonly number[]): void => {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < actual.length; index++)
    expect(actual[index]).toBeCloseTo(expected[index], 6);
};

const poincareDistance = (a: readonly number[], b: readonly number[]): number => {
  const delta2 = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const denominator = (1 - a[0] ** 2 - a[1] ** 2) * (1 - b[0] ** 2 - b[1] ** 2);
  return Math.acosh(1 + (2 * delta2) / denominator);
};

describe('projection', () => {
  it('builds a stable camera basis through orientation and roll', () => {
    const basis = cameraBasis(0, 0, 0);
    expectPointCloseTo(basis.f, [-1, 0, 0]);
    expectPointCloseTo(basis.r, [0, 1, 0]);
    expectPointCloseTo(basis.u, [0, 0, 1]);

    const rolled = cameraBasis(0, 0, 90);
    expectPointCloseTo(rolled.f, [-1, 0, 0]);
    expectPointCloseTo(rolled.r, [0, 0, 1]);
    expectPointCloseTo(rolled.u, [0, -1, 0]);
  });

  it('projects an orthographic point without applying inactive lens stages', () => {
    expectPointCloseTo(projectCameraPoint(0.6, -0.25, 0.4, 40, 60, 50, 50, 0, 0, 0), [84, 60]);
  });

  it('records perspective projection endpoints and ignores focal length at zero strength', () => {
    const orthographic = projectCameraPoint(0.6, -0.25, 0.4, 40, 60, 50, 18, 0, 0, 0);
    const longOrthographic = projectCameraPoint(0.6, -0.25, 0.4, 40, 60, 50, 300, 0, 0, 0);
    const perspective = projectCameraPoint(0.6, -0.25, 0.4, 40, 60, 50, 18, 100, 0, 0);

    expectPointCloseTo(orthographic, [84, 60]);
    expectPointCloseTo(longOrthographic, orthographic);
    expectPointCloseTo(perspective, [90, 62.5]);
  });

  it('preserves the Klein and Poincare endpoints with geometric interpolation', () => {
    expectPointCloseTo(warpKleinPoincare(0.8, 0, 0), [0.8, 0]);
    expectPointCloseTo(warpKleinPoincare(0.8, 0, 50), [Math.sqrt(0.4), 0]);
    expectPointCloseTo(warpKleinPoincare(0.8, 0, 100), [0.5, 0]);
  });

  describe('Poincare disk Mobius transformations', () => {
    it('is identity for neutral parameters and zero strength', () => {
      const point: [number, number] = [0.35, -0.42];
      expectPointCloseTo(
        transformPoincareDisk(...point, { translation: [0, 0], rotation: 0 }).point,
        point,
      );
      expectPointCloseTo(
        transformPoincareDisk(...point, {
          translation: [0.7, -0.4],
          rotation: 1.3,
          strength: 0,
        }).point,
        point,
      );
    });

    it('keeps representative interior points strictly inside the disk', () => {
      const parameters = { translation: [0.62, -0.31] as [number, number], rotation: 0.8 };
      for (const point of [
        [0, 0],
        [0.2, -0.4],
        [-0.7, 0.1],
        [0.93, 0.2],
      ] as const) {
        const transformed = transformPoincareDisk(point[0], point[1], parameters);
        expect(transformed.status).toBe('valid');
        expect(Math.hypot(...transformed.point)).toBeLessThan(1);
      }
    });

    it('restores representative points after applying the inverse', () => {
      const parameters = {
        translation: [0.48, 0.36] as [number, number],
        rotation: -1.1,
        strength: 0.65,
      };
      for (const point of [
        [0, 0],
        [0.25, 0.5],
        [-0.82, 0.12],
      ] as const) {
        const transformed = transformPoincareDisk(point[0], point[1], parameters);
        const restored = inverseTransformPoincareDisk(...transformed.point, parameters);
        expect(restored.status).toBe('valid');
        expectPointCloseTo(restored.point, point);
      }
    });

    it('preserves hyperbolic distance for interior point pairs', () => {
      const parameters = { translation: [-0.44, 0.23] as [number, number], rotation: 2.2 };
      const pairs = [
        [
          [0.1, 0.2],
          [-0.3, 0.5],
        ],
        [
          [-0.72, -0.1],
          [0.61, -0.32],
        ],
      ] as const;
      for (const [a, b] of pairs) {
        const transformedA = transformPoincareDisk(a[0], a[1], parameters).point;
        const transformedB = transformPoincareDisk(b[0], b[1], parameters).point;
        expect(poincareDistance(transformedA, transformedB)).toBeCloseTo(
          poincareDistance(a, b),
          10,
        );
      }
    });

    it('keeps near-boundary and overflow values finite and monotonic', () => {
      const parameters = { translation: [0.92, 0.2] as [number, number], rotation: 0.35 };
      const nearBoundary = transformPoincareDisk(1 - 1e-12, 0, parameters);
      expect(nearBoundary.status).toBe('valid');
      expect(nearBoundary.point.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...nearBoundary.point)).toBeLessThan(1);

      const boundary = transformPoincareDisk(1, 0, parameters);
      const outside = transformPoincareDisk(1.4, 0, parameters);
      expect(boundary.status).toBe('clipped-at-domain');
      expect(outside.status).toBe('clipped-at-domain');
      expect(boundary.point.every(Number.isFinite)).toBe(true);
      expect(outside.point.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...boundary.point)).toBeCloseTo(1, 10);
      expect(Math.hypot(...outside.point)).toBeCloseTo(1.4, 10);
    });

    it('composes rotations and interpolates parameters instead of output points', () => {
      const point: [number, number] = [0.3, -0.2];
      const first = transformPoincareDisk(...point, { translation: [0, 0], rotation: 0.4 });
      const composed = transformPoincareDisk(...first.point, {
        translation: [0, 0],
        rotation: 0.7,
      });
      const direct = transformPoincareDisk(...point, { translation: [0, 0], rotation: 1.1 });
      expectPointCloseTo(composed.point, direct.point);

      const target = { translation: [0.6, -0.2] as [number, number], rotation: 1.2 };
      const halfway = transformPoincareDisk(...point, { ...target, strength: 0.5 });
      const halfParameters = transformPoincareDisk(...point, {
        translation: [0.3, -0.1],
        rotation: 0.6,
      });
      expectPointCloseTo(halfway.point, halfParameters.point);
    });

    it('bounds translation parameters and rejects non-finite inputs', () => {
      const bounded = transformPoincareDisk(0.1, 0.2, {
        translation: [20, -10],
        rotation: 0,
      });
      expect(bounded.status).toBe('valid');
      expect(Math.hypot(...bounded.point)).toBeLessThan(1);
      expect(transformPoincareDisk(NaN, 0, { translation: [0, 0], rotation: 0 }).status).toBe(
        'invalid',
      );
      expect(transformPoincareDisk(0, 0, { translation: [Infinity, 0], rotation: 0 }).status).toBe(
        'invalid',
      );
    });
  });

  describe('projection warp selection', () => {
    it('resolves old snapshots from the legacy exponent and honors an explicit mode', () => {
      expect(resolveProjectionWarpMode(undefined, 0)).toBe('none');
      expect(resolveProjectionWarpMode(undefined, 65)).toBe('klein-poincare');
      expect(resolveProjectionWarpMode('none', 65)).toBe('none');
      expect(resolveProjectionWarpMode('mobius', 65)).toBe('mobius');
    });

    it('applies Mobius navigation after perspective and before optical distortion', () => {
      const projected = projectCameraPointResult(0.4, 0.2, 0, 40, 60, 50, 50, 0, 0, 30, {
        mode: 'mobius',
        mobiusDirection: 30,
        mobiusDisplacement: 45,
        mobiusRotation: -20,
        mobiusStrength: 70,
      });
      const direction = (30 * Math.PI) / 180;
      const mobius = transformPoincareDisk(0.4, 0.2, {
        translation: [Math.cos(direction) * 0.45, Math.sin(direction) * 0.45],
        rotation: (-20 * Math.PI) / 180,
        strength: 0.7,
      });
      const distorted = distortLens(mobius.point[0], mobius.point[1], 30);

      expect(projected.status).toBe('valid');
      expectPointCloseTo(projected.point.slice(0, 2), [
        60 + distorted[0] * 40,
        50 - distorted[1] * 40,
      ]);
    });

    it('keeps explicit none neutral even when a legacy exponent remains stored', () => {
      const neutral = projectCameraPoint(0.6, -0.25, 0.4, 40, 60, 50, 50, 0, 0, 0);
      const explicitNone = projectCameraPoint(0.6, -0.25, 0.4, 40, 60, 50, 50, 0, 100, 0, {
        mode: 'none',
      });
      expectPointCloseTo(explicitNone, neutral);
    });
  });

  it('records neutral, barrel, and pincushion distortion fixtures', () => {
    expectPointCloseTo(distortLens(0.5, 0.25, 0), [0.5, 0.25]);
    expectPointCloseTo(distortLens(0.5, 0.25, -60), [0.4651162791, 0.2325581395]);
    expectPointCloseTo(distortLens(0.5, 0.25, 60), [0.5375, 0.26875]);
  });

  it('projects a deterministic mesh fixture into sheet coordinates and depth', () => {
    const projection = projectMesh(
      {
        V: new Float32Array([0, 1, 0.5, 0, -0.25, -0.75, -0.4, 0.5, 0]),
      },
      cameraBasis(0, 0, 0),
      120,
      100,
      10,
      1.25,
      3,
      -4,
      50,
      0,
      0,
      0,
    );

    expectPointCloseTo(Array.from(projection.sx), [113, 50.5, 88]);
    expectPointCloseTo(Array.from(projection.sy), [21, 83.5, 46]);
    expectPointCloseTo(Array.from(projection.sd), [0, 0, 0.4]);
    expect(projection.dmin).toBeCloseTo(0, 6);
    expect(projection.dmax).toBeCloseTo(0.4, 6);
  });

  it('retains legacy lens presets while preferring explicit distortion', () => {
    expect(resolveLens({})).toEqual([50, 0]);
    expect(resolveLens({ lensFocalLength: 18, lens: 'fisheye', lensAmount: 50 })).toEqual([
      18, -50,
    ]);
    expect(resolveLens({ lensFocalLength: 500, lens: 'fisheye', lensDistortion: 20 })).toEqual([
      300, 20,
    ]);
  });

  it('reports safe disk-domain clipping and invalid projection singularities explicitly', () => {
    const clipped = projectCameraPointResult(1.2, 0, 0, 40, 60, 50, 50, 0, 100, 0);
    expect(clipped.status).toBe('clipped-at-domain');
    expect(clipped.point.every(Number.isFinite)).toBe(true);

    const singular = projectCameraPointResult(0.2, 0.1, 2, 40, 60, 50, 18, 100, 0, 0);
    expect(singular.status).toBe('invalid');
    expect(singular.point.slice(0, 2).every(Number.isNaN)).toBe(true);

    const orthographic = projectCameraPointResult(0.2, 0.1, 2, 40, 60, 50, 18, 0, 0, 0);
    expect(orthographic.status).toBe('valid');
    expect(orthographic.point.every(Number.isFinite)).toBe(true);
  });

  it('adaptively follows a nonlinear projected segment within bounded work', () => {
    const points = new Float64Array([0, -0.8, 0.5, 0, 0.8, 0.5]);
    const projection = projectMesh(
      { V: points },
      cameraBasis(0, 0, 0),
      120,
      100,
      10,
      1,
      0,
      0,
      50,
      0,
      100,
      0,
    );
    const coarse = projectPolylineAdaptive(points, [0, 1], projection, {
      tolerance: 0.5,
      maxDepth: 8,
    });
    const fine = projectPolylineAdaptive(points, [0, 1], projection, {
      tolerance: 0.01,
      maxDepth: 8,
    });

    expect(coarse.runs).toHaveLength(1);
    expect(fine.runs).toHaveLength(1);
    expect(fine.runs[0].points.length).toBeGreaterThan(coarse.runs[0].points.length);
    expect(fine.runs[0].points.length).toBeGreaterThan(6);
    expect(fine.runs[0].points.every(Number.isFinite)).toBe(true);
    expect(fine.truncated).toBe(false);

    let maximumError = 0;
    const projectedRun = fine.runs[0].points;
    for (let sample = 0; sample <= 100; sample++) {
      const t = sample / 100;
      const point = projectWorldPoint(0, -0.8 + 1.6 * t, 0.5, projection).point;
      let nearest = Infinity;
      for (let offset = 0; offset + 5 < projectedRun.length; offset += 3) {
        const ax = projectedRun[offset],
          ay = projectedRun[offset + 1],
          bx = projectedRun[offset + 3],
          by = projectedRun[offset + 4];
        const dx = bx - ax,
          dy = by - ay,
          length2 = dx * dx + dy * dy;
        const chordT = length2
          ? Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / length2))
          : 0;
        nearest = Math.min(
          nearest,
          Math.hypot(point[0] - (ax + dx * chordT), point[1] - (ay + dy * chordT)),
        );
      }
      maximumError = Math.max(maximumError, nearest);
    }
    expect(maximumError).toBeLessThanOrEqual(0.011);
  });

  it('does not subdivide an affine projection and keeps paired output samples aligned', () => {
    const points = new Float64Array([0, -0.8, 0.5, 0, 0.8, 0.5]);
    const outputPoints = new Float64Array([0, -0.8, 0.7, 0, 0.8, 0.7]);
    const projection = projectMesh(
      { V: points },
      cameraBasis(0, 0, 0),
      120,
      100,
      10,
      1,
      0,
      0,
      50,
      0,
      0,
      0,
    );
    const result = projectPolylineAdaptive(points, [0, 1], projection, {
      tolerance: 0.001,
      outputPoints,
    });

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].points).toHaveLength(6);
    expect(result.runs[0].outputPoints).toHaveLength(result.runs[0].points.length);
    expect(result.runs[0].outputPoints[1]).not.toBe(result.runs[0].points[1]);
  });

  it('splits invalid samples and enforces the requested node bound', () => {
    const reference = new Float64Array([0, -0.8, 0.5, 0, 0.8, 0.5]);
    const projection = projectMesh(
      { V: reference },
      cameraBasis(0, 0, 0),
      120,
      100,
      10,
      1,
      0,
      0,
      50,
      0,
      100,
      60,
    );
    const invalid = projectPolylineAdaptive(
      new Float64Array([0, -0.8, 0.5, NaN, 0, 0, 0, 0.8, 0.5]),
      [0, 1, 2],
      projection,
      { tolerance: 0.001, maxDepth: 3, maxNodes: 32 },
    );
    expect(invalid.invalidSamples).toBeGreaterThan(0);
    expect(invalid.runs.flatMap((run) => run.points).every(Number.isFinite)).toBe(true);

    const bounded = projectPolylineAdaptive(reference, [0, 1], projection, {
      tolerance: 0.000001,
      maxDepth: 12,
      maxNodes: 8,
    });
    expect(bounded.runs[0].points.length / 3).toBeLessThanOrEqual(8);
    expect(bounded.truncated).toBe(true);
  });
});
