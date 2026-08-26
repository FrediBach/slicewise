import { describe, expect, it } from 'vitest';
import {
  cameraBasis,
  distortLens,
  projectCameraPoint,
  projectCameraPointResult,
  projectMesh,
  projectPolylineAdaptive,
  projectWorldPoint,
  resolveLens,
  warpKleinPoincare,
} from './projection';

const expectPointCloseTo = (actual: readonly number[], expected: readonly number[]): void => {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < actual.length; index++)
    expect(actual[index]).toBeCloseTo(expected[index], 6);
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
