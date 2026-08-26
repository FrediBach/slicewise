import { describe, expect, it } from 'vitest';
import { explodeScalarFieldPoints, extractScalarFieldLevel } from './contour-engine';
import {
  createCylindricalScalarField,
  createGeodesicScalarField,
  createPlanarScalarField,
  createSphericalScalarField,
  resolveScalarFieldFeatures,
  scalarFieldCompatibility,
  type MeshScalarField,
} from './scalar-fields';

const mesh = { V: new Float32Array([-1, 2, 3, 4, -5, 6]) };

describe('scalar fields', () => {
  it('builds geodesic values along the folded surface graph instead of ambient radius', () => {
    const folded = {
      V: new Float32Array([-1, 0, 0, 0, 10, 0, 1, 0, 0, -0.9, 0, 0.1]),
      T: new Uint32Array([0, 1, 2, 2, 1, 3]),
    };
    const field = createGeodesicScalarField(folded, { direction: [-1, 0, 0] });

    expect(field.kind).toBe('intrinsic');
    expect(field.intrinsicDiagnostics?.seedVertex).toBe(0);
    expect(field.values[3]).toBeGreaterThan(3);
    expect(field.values[3]).toBeGreaterThan(
      20 *
        Math.hypot(
          folded.V[9] - folded.V[0],
          folded.V[10] - folded.V[1],
          folded.V[11] - folded.V[2],
        ),
    );
  });

  it('omits unreachable components and caches per-mesh seed distances', () => {
    const disconnected = {
      V: new Float32Array([0, 0, 1, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0]),
      T: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
    const first = createGeodesicScalarField(disconnected, { direction: [0, 0, 1] });
    const repeated = createGeodesicScalarField(disconnected, { direction: [0, 0, 1] });
    const replacement = createGeodesicScalarField(
      { V: disconnected.V.slice(), T: disconnected.T.slice() },
      { direction: [0, 0, 1] },
    );

    expect(first.values).toBe(repeated.values);
    expect(replacement.values).not.toBe(first.values);
    expect(first.min).toBe(0);
    expect(first.max).toBeGreaterThan(0);
    expect(first.intrinsicDiagnostics).toEqual({
      seedVertex: 0,
      reachableVertexCount: 3,
      skippedComponentCount: 1,
    });
    expect(Array.from(first.values).slice(3)).toEqual([Infinity, Infinity, Infinity]);
    const contour = extractScalarFieldLevel(disconnected, first, first.max * 0.5);
    expect(contour.segs.length).toBeGreaterThan(0);
    expect(contour.pts.every(Number.isFinite)).toBe(true);
  });

  it('bounds the geodesic distance cache to eight recently used seeds per mesh', () => {
    const vertexCount = 9;
    const vertices = [0, 0, 0];
    for (let index = 0; index < vertexCount; index++) {
      const angle = (index / vertexCount) * Math.PI * 2;
      vertices.push(Math.cos(angle), Math.sin(angle), 0);
    }
    const triangles: number[] = [];
    for (let index = 0; index < vertexCount; index++)
      triangles.push(0, index + 1, ((index + 1) % vertexCount) + 1);
    const radial = { V: Float64Array.from(vertices), T: Uint32Array.from(triangles) };
    const first = createGeodesicScalarField(radial, { direction: [1, 0, 0] });
    for (let index = 1; index < vertexCount; index++) {
      const angle = (index / vertexCount) * Math.PI * 2;
      createGeodesicScalarField(radial, {
        direction: [Math.cos(angle), Math.sin(angle), 0],
      });
    }
    const revisited = createGeodesicScalarField(radial, { direction: [1, 0, 0] });

    expect(revisited.values).not.toBe(first.values);
    expect(revisited.values).toEqual(first.values);
  });

  it('evaluates spherical wavefront values and normalized gradients', () => {
    const field = createSphericalScalarField(
      { V: new Float32Array([1, 2, 3, 4, 6, 3, 1, 2, 3]) },
      { center: [1, 2, 3] },
    );

    expect(Array.from(field.values)).toEqual([0, 5, 0]);
    expect(field.min).toBe(0);
    expect(field.max).toBe(5);
    expect(field.evaluate?.(1, 5, 7)).toBe(5);
    expect(field.gradient?.(1, 5, 7)).toEqual([0, 0.6, 0.8]);
    expect(field.gradient?.(1, 2, 3)).toBeNull();
    expect(field.cacheKey).toBe('analytic:sphere:1,2,3');
  });

  it('evaluates cylindrical radial distance around a normalized axis', () => {
    const field = createCylindricalScalarField(
      { V: new Float32Array([2, 2, 8, 5, 6, -10, 2, 2, 0]) },
      { center: [2, 2, 0], axis: [0, 0, 4] },
    );

    expect(Array.from(field.values)).toEqual([0, 5, 0]);
    expect(field.min).toBe(0);
    expect(field.max).toBe(5);
    expect(field.evaluate?.(5, 6, 20)).toBe(5);
    expect(field.gradient?.(5, 6, 20)).toEqual([0.6, 0.8, 0]);
    expect(field.gradient?.(2, 2, 20)).toBeNull();
    expect(field.cacheKey).toBe('analytic:cylinder:2,2,0:0,0,1');
  });

  it('constructs deterministic model and custom planar fields with separated cache keys', () => {
    const up = createPlanarScalarField(mesh, { axis: 'up', cutAz: 0, cutEl: 90 });
    const x = createPlanarScalarField(mesh, { axis: 'x', cutAz: 0, cutEl: 90 });
    const custom = createPlanarScalarField(mesh, { axis: 'custom', cutAz: 0, cutEl: 0 });

    expect(Array.from(up.values)).toEqual([3, 6]);
    expect(up.constantDirection).toEqual([0, 0, 1]);
    expect(up.cacheKey).not.toBe(x.cacheKey);
    expect(custom.cacheKey).not.toBe(x.cacheKey);
    expect(Array.from(custom.values)).toEqual(Array.from(x.values));
  });

  it('uses authoritative camera values while deliberately disabling its topology cache', () => {
    const values = new Float32Array([0.25, -0.75]);
    const field = createPlanarScalarField(mesh, {
      axis: 'cam',
      cutAz: 0,
      cutEl: 0,
      camera: { values, min: -0.75, max: 0.25, direction: [0, 1, 0] },
    });

    expect(field.values).toBe(values);
    expect(field.min).toBe(-0.75);
    expect(field.max).toBe(0.25);
    expect(field.constantDirection).toEqual([0, 1, 0]);
    expect(field.cacheKey).toBe('');
  });

  it('resolves incompatible feature combinations centrally and deterministically', () => {
    const analytic: MeshScalarField = {
      values: new Float32Array([0, 1]),
      min: 0,
      max: 1,
      kind: 'analytic',
      evaluate: (x, y, z) => x * x + y * y + z * z,
      gradient: (x, y, z) => [2 * x, 2 * y, 2 * z],
      cacheKey: 'analytic:sphere:0,0,0',
    };
    const intrinsic: MeshScalarField = {
      values: new Float32Array([0, 1]),
      min: 0,
      max: 1,
      kind: 'intrinsic',
      cacheKey: 'intrinsic:test',
    };
    const requested = {
      lfo: true,
      divergence: 120,
      continuousSpiral: true,
      explodeAmount: 80,
    };

    expect(resolveScalarFieldFeatures(analytic, requested)).toEqual({
      lfo: false,
      divergence: 0,
      continuousSpiral: false,
      explodeAmount: 80,
      explosion: 'local-gradient',
    });
    expect(resolveScalarFieldFeatures(intrinsic, requested)).toEqual({
      lfo: false,
      divergence: 0,
      continuousSpiral: false,
      explodeAmount: 0,
      explosion: 'none',
    });
    expect(scalarFieldCompatibility(intrinsic).gapEasing).toBe(true);
  });

  it('extracts stable finite contours from a synthetic nonlinear field', () => {
    const nonlinearMesh = {
      V: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, 0, 0, 0]),
      T: new Uint32Array([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]),
    };
    const evaluate = (x: number, y: number): number => x * x + y * y;
    const field: MeshScalarField = {
      values: new Float32Array([2, 2, 2, 2, 0]),
      min: 0,
      max: 2,
      kind: 'analytic',
      evaluate,
      gradient: (x, y) => [2 * x, 2 * y, 0],
      cacheKey: 'analytic:radial:0,0',
    };
    const options = { rootIterations: 20, adaptiveDepth: 2 };
    const first = extractScalarFieldLevel(nonlinearMesh, field, 0.5, options);
    const second = extractScalarFieldLevel(nonlinearMesh, field, 0.5, options);

    expect(first).toEqual(second);
    expect(first.segs.length).toBeGreaterThan(0);
    expect(first.pts.every(Number.isFinite)).toBe(true);
    for (let offset = 0; offset < first.pts.length; offset += 3)
      expect(evaluate(first.pts[offset], first.pts[offset + 1])).toBeCloseTo(0.5, 5);
  });

  it('explodes analytic levels along normalized local gradients', () => {
    const points = new Float32Array([1, 0, 0, 0, 1, 0]);
    const exploded = explodeScalarFieldPoints(
      points,
      { gradient: (x, y) => [2 * x, 2 * y, 0] },
      1,
      2,
      100,
    );

    expect(exploded).toEqual([2, 0, 0, 0, 2, 0]);
    expect(explodeScalarFieldPoints(points, {}, 1, 2, 100)).toEqual(Array.from(points));
  });

  it('skips non-finite field samples without leaking invalid contour coordinates', () => {
    const invalid = extractScalarFieldLevel(
      {
        V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        T: new Uint32Array([0, 1, 2]),
      },
      {
        values: new Float32Array([0, NaN, 1]),
        min: 0,
        max: 1,
        kind: 'intrinsic',
        cacheKey: 'intrinsic:invalid-fixture',
      },
      0.5,
    );

    expect(invalid).toEqual({ pts: [], segs: [] });
  });
});
