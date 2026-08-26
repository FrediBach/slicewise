import { describe, expect, it } from 'vitest';
import {
  selectDirectionalSeedVertex,
  surfaceGraphDistances,
  surfaceGraphVoronoi,
} from './mesh-geodesics';

describe('surface graph distances', () => {
  it('computes exact edge distances on a triangle', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 3, 0, 0, 0, 4, 0]),
      T: new Uint32Array([0, 1, 2]),
    };

    expect(Array.from(surfaceGraphDistances(mesh, [0]))).toEqual([0, 3, 4]);
  });

  it('uses the shortest edge route across a square grid', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
      T: new Uint32Array([0, 1, 2, 1, 3, 2]),
    };

    const single = surfaceGraphDistances(mesh, [0]);
    expect(Array.from(single)).toEqual([0, 1, 1, 2]);
    expect(Array.from(surfaceGraphDistances(mesh, [3, 0, 3]))).toEqual([0, 1, 1, 0]);
    expect(Array.from(surfaceGraphDistances(mesh, [0, 3]))).toEqual([0, 1, 1, 0]);
  });

  it('returns infinity outside seeded connected components', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0, 20, 0, 0]),
      T: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
    const distances = surfaceGraphDistances(mesh, [0]);

    expect(Array.from(distances.slice(0, 3))).toEqual([0, 1, 1]);
    expect(Array.from(distances.slice(3))).toEqual([Infinity, Infinity, Infinity, Infinity]);
  });

  it('handles tetrahedral and non-manifold graphs deterministically', () => {
    const tetrahedron = {
      V: new Float32Array([1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1]),
      T: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
    };
    const tetrahedronDistances = surfaceGraphDistances(tetrahedron, [0]);
    expect(Array.from(tetrahedronDistances)).toEqual([0, Math.sqrt(8), Math.sqrt(8), Math.sqrt(8)]);

    const nonManifold = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 1, 1, 0]),
      T: new Uint32Array([0, 1, 2, 1, 0, 3, 0, 1, 4]),
    };
    const first = surfaceGraphDistances(nonManifold, [2, 3]);
    const second = surfaceGraphDistances(nonManifold, [3, 2]);
    expect(first).toEqual(second);
    expect(Array.from(first).every(Number.isFinite)).toBe(true);
  });

  it('returns independent distance buffers while reusing cached topology', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      T: new Uint32Array([0, 1, 2]),
    };
    const first = surfaceGraphDistances(mesh, [0]);
    const second = surfaceGraphDistances(mesh, [0]);

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
    first[1] = 99;
    expect(second[1]).toBe(1);
  });

  it('ignores invalid seeds and supports an empty seed set', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      T: new Uint32Array([0, 1, 2]),
    };

    expect(Array.from(surfaceGraphDistances(mesh, [-1, 1.5, 99]))).toEqual([
      Infinity,
      Infinity,
      Infinity,
    ]);
  });
});

describe('directional mesh seeds', () => {
  it('selects the directional extreme and breaks exact ties by vertex index', () => {
    const mesh = {
      V: new Float32Array([1, 1, 0, 1, -1, 0, -1, 0, 0, 0, 0, 2]),
    };

    expect(selectDirectionalSeedVertex(mesh, [1, 0, 0])).toBe(0);
    expect(selectDirectionalSeedVertex(mesh, [-1, 0, 0])).toBe(2);
    expect(selectDirectionalSeedVertex(mesh, [0, 0, 4])).toBe(3);
  });

  it('is translation/scale independent and safely handles invalid directions', () => {
    const base = { V: new Float32Array([-1, 0, -1, 1, 0, -1, 0, 0, 2]) };
    const transformed = { V: new Float32Array([8, 20, 27, 12, 20, 27, 10, 20, 34]) };

    expect(selectDirectionalSeedVertex(base, [0, 0, 1])).toBe(2);
    expect(selectDirectionalSeedVertex(transformed, [0, 0, 1])).toBe(2);
    expect(selectDirectionalSeedVertex(base, [0, 0, 0])).toBe(2);
    expect(selectDirectionalSeedVertex({ V: new Float32Array([NaN, 0, 0]) }, [1, 0, 0])).toBeNull();
    expect(selectDirectionalSeedVertex({ V: new Float32Array() }, [1, 0, 0])).toBeNull();
  });
});

describe('surface graph Voronoi labels', () => {
  it('assigns equal-distance ties to the lower seed vertex independent of seed order', () => {
    const mesh = {
      V: new Float32Array([-2, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0]),
      T: new Uint32Array([0, 1, 2, 2, 3, 4]),
    };
    const forward = surfaceGraphVoronoi(mesh, [0, 4]);
    const reversed = surfaceGraphVoronoi(mesh, [4, 0]);

    expect(forward).toEqual(reversed);
    expect(Array.from(forward.distances)).toEqual([0, 1, 2, 1, 0]);
    expect(Array.from(forward.labels)).toEqual([0, 0, 0, 4, 4]);
  });

  it('labels seeded disconnected components and leaves the rest unreachable', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0]),
      T: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
    const result = surfaceGraphVoronoi(mesh, [0]);

    expect(Array.from(result.labels)).toEqual([0, 0, 0, -1, -1, -1]);
    expect(Array.from(result.distances).slice(3)).toEqual([Infinity, Infinity, Infinity]);
  });
});
