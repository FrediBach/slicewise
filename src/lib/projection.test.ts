import { describe, expect, it } from 'vitest';
import {
  cameraBasis,
  distortLens,
  projectCameraPoint,
  projectMesh,
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
});
