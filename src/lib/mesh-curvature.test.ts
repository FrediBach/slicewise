import { describe, expect, it } from 'vitest';
import { meshCurvature } from './mesh-curvature';

const octahedron = (scale = 1) => ({
  V: new Float64Array([
    scale,
    0,
    0,
    -scale,
    0,
    0,
    0,
    scale,
    0,
    0,
    -scale,
    0,
    0,
    0,
    scale,
    0,
    0,
    -scale,
  ]),
  T: new Uint32Array([0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5]),
});

describe('mesh curvature', () => {
  it('masks open boundaries and leaves a planar interior near zero', () => {
    const mesh = {
      V: new Float64Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, 0, 0, 0]),
      T: new Uint32Array([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]),
    };
    expect(meshCurvature(mesh, 'gaussian').values[4]).toBeCloseTo(0, 10);
    expect(meshCurvature(mesh, 'mean').values[4]).toBeCloseTo(0, 10);
    expect(Number.isNaN(meshCurvature(mesh, 'gaussian').values[0])).toBe(true);
  });

  it('has positive, consistently signed curvature on an outward sphere fixture', () => {
    const gaussian = [...meshCurvature(octahedron(), 'gaussian').values];
    const mean = [...meshCurvature(octahedron(), 'mean').values];
    expect(gaussian.every((value) => value > 0)).toBe(true);
    expect(mean.every((value) => value > 0)).toBe(true);
  });

  it('obeys inverse-square and inverse-length scale laws', () => {
    const gaussian1 = meshCurvature(octahedron(1), 'gaussian').values[0];
    const gaussian2 = meshCurvature(octahedron(2), 'gaussian').values[0];
    const mean1 = meshCurvature(octahedron(1), 'mean').values[0];
    const mean2 = meshCurvature(octahedron(2), 'mean').values[0];
    expect(gaussian2).toBeCloseTo(gaussian1 / 4, 10);
    expect(mean2).toBeCloseTo(mean1 / 2, 10);
  });

  it('finds negative Gaussian curvature on a closed saddle-like vertex', () => {
    const mesh = {
      V: new Float64Array([0, 0, 0, 1, 0, 1, 0, 1, -1, -1, 0, 1, 0, -1, -1]),
      T: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]),
    };
    // The outer ring is a boundary; the center remains a valid intrinsic sample.
    expect(meshCurvature(mesh, 'gaussian').values[0]).toBeLessThan(0);
  });

  it('keeps degenerate and non-manifold samples masked and smoothing deterministic', () => {
    const mesh = octahedron();
    const first = meshCurvature(mesh, 'mean', 3);
    const second = meshCurvature(mesh, 'mean', 3);
    expect(second).toBe(first);
    expect([...first.values].every(Number.isFinite)).toBe(true);

    const invalid = {
      V: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      T: new Uint32Array([0, 1, 1, 0, 1, 2]),
    };
    expect([...meshCurvature(invalid, 'gaussian').values].every(Number.isNaN)).toBe(true);
  });
});
