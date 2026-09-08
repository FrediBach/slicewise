import { describe, expect, it } from 'vitest';
import { extractPlanarSlices, chainSliceSegments, SliceGeometryError } from './slice-geometry';
import { solidBox } from '../test/fixtures/solid';
import { extractScalarFieldLevel } from './contour-engine';
import { createPlanarScalarField } from './scalar-fields';

describe('authored planar slice geometry', () => {
  it('keeps ordered levels, closed run offsets and exact triangle ownership in detached buffers', () => {
    const mesh = solidBox(),
      original = structuredClone(mesh);
    const field = {
      kind: 'planar' as const,
      normal: [0, 0, 2] as [number, number, number],
      levels: [-12, 0, 18],
    };
    const geometry = extractPlanarSlices(mesh, field, 7);
    expect(geometry).toEqual(extractPlanarSlices(mesh, field, 7));
    expect(geometry).toEqual(structuredClone(geometry));
    expect(geometry.sourceRevision).toBe(7);
    expect(geometry.field.normal).toEqual([0, 0, 1]);
    expect(geometry.truncated).toBe(false);
    for (const slice of geometry.slices) {
      expect(slice.level).toBe(field.levels[slice.index]);
      expect(slice.position).toBe((slice.level + 25) / 50);
      expect([...slice.closed]).toEqual([1]);
      expect([...slice.runOffsets]).toEqual([0, 9]);
      expect(slice.runPoints[0]).toBe(slice.runPoints[8]);
      for (let s = 0; s < slice.triangles.length; s++) {
        const face = slice.triangles[s];
        expect(Math.hypot(...slice.normals.subarray(s * 3, s * 3 + 3))).toBeCloseTo(1);
        for (let end = 0; end < 2; end++) {
          const weights = slice.barycentrics.subarray(s * 6 + end * 3, s * 6 + end * 3 + 3);
          expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
          expect(weights.every((w) => w >= 0 && w <= 1)).toBe(true);
          const point = slice.segments[s * 2 + end];
          for (let axis = 0; axis < 3; axis++) {
            const reconstructed = weights.reduce(
              (sum, w, v) => sum + w * mesh.V[mesh.T[face * 3 + v] * 3 + axis],
              0,
            );
            expect(slice.points[point * 3 + axis]).toBeCloseTo(reconstructed, 10);
          }
          expect(slice.points[point * 3 + 2]).toBeCloseTo(slice.level, 10);
        }
      }
    }
    expect(mesh).toEqual(original);
    geometry.slices[0].points.fill(99);
    expect(mesh).toEqual(original);
    expect(field.normal).toEqual([0, 0, 2]);
  });

  it('matches the existing unsmoothed drawing intersections on generic planes', () => {
    const mesh = solidBox();
    const field = createPlanarScalarField(mesh, { axis: 'custom', cutAz: 31, cutEl: 47 });
    const level = 3.7;
    const current = extractScalarFieldLevel(mesh, field, level);
    const slice = extractPlanarSlices(
      mesh,
      { kind: 'planar', normal: field.constantDirection!, levels: [level] },
      0,
    ).slices[0];
    const points = (v: ArrayLike<number>) =>
      Array.from({ length: v.length / 3 }, (_, i) =>
        Array.from({ length: 3 }, (_, axis) => v[i * 3 + axis].toFixed(4)).join(','),
      ).sort();
    expect(points(slice.points)).toEqual(points(current.pts));
    expect(chainSliceSegments(current.pts, current.segs)).toHaveLength(1);
  });

  it('handles cuts through authored edges/vertices without duplicate or zero-length spans', () => {
    const slices = extractPlanarSlices(
      solidBox(),
      {
        kind: 'planar',
        normal: [1, 1, 0],
        levels: [5 / Math.sqrt(2), 35 / Math.sqrt(2)],
      },
      0,
    ).slices;
    expect([...slices[0].closed]).toEqual([1]);
    for (let i = 0; i < slices[0].segments.length; i += 2)
      expect(slices[0].segments[i]).not.toBe(slices[0].segments[i + 1]);
    expect(slices[1].segments).toHaveLength(0); // tangent edge, no enclosed section
    const tangent = extractPlanarSlices(
      solidBox(),
      { kind: 'planar', normal: [1, 1, 1], levels: [60 / Math.sqrt(3)] },
      0,
    );
    expect(tangent.slices[0].segments).toHaveLength(0);
  });

  it('keeps coincident but topologically distinct surfaces in separate runs', () => {
    const box = solidBox();
    const mesh = {
      V: new Float32Array([...box.V, ...box.V]),
      T: new Uint32Array([...box.T, ...box.T.map((i) => i + 8)]),
    };
    const slice = extractPlanarSlices(mesh, { kind: 'planar', normal: [0, 0, 1], levels: [0] }, 0)
      .slices[0];
    expect([...slice.closed]).toEqual([1, 1]);
    expect(slice.runOffsets).toHaveLength(3);
  });

  it('identifies open paths and rejects ambiguous coplanar cuts', () => {
    const box = solidBox();
    const open = { ...box, T: box.T.slice(0, -6) };
    const slice = extractPlanarSlices(open, { kind: 'planar', normal: [0, 0, 1], levels: [0] }, 0)
      .slices[0];
    expect([...slice.closed]).toEqual([0]);
    expect(() =>
      extractPlanarSlices(box, { kind: 'planar', normal: [0, 0, 1], levels: [25] }, 0),
    ).toThrow(/overlaps a source face/);
  });

  it('rejects branching cuts instead of choosing arbitrary connections', () => {
    // Two tetrahedra share exactly one vertex on the cutting plane.
    const mesh = {
      V: new Float32Array([0, 0, 0, 2, 0, 1, 2, 2, -1, 2, -2, -1, -2, 0, 1, -2, 2, -1, -2, -2, -1]),
      T: new Uint32Array([0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2, 0, 4, 5, 0, 6, 4, 0, 5, 6, 4, 6, 5]),
    };
    expect(() =>
      extractPlanarSlices(mesh, { kind: 'planar', normal: [0, 0, 1], levels: [0] }, 0),
    ).toThrow(/branches/);
  });

  it('rejects invalid inputs and budgets rather than truncating an extraction', () => {
    const mesh = solidBox(),
      field = {
        kind: 'planar' as const,
        normal: [0, 0, 1] as [number, number, number],
        levels: [0],
      };
    for (const normal of [
      [0, 0, 0],
      [NaN, 0, 1],
    ] as [number, number, number][])
      expect(() => extractPlanarSlices(mesh, { ...field, normal }, 0)).toThrow(SliceGeometryError);
    expect(() => extractPlanarSlices(mesh, { ...field, levels: [1, 0] }, 0)).toThrow(/increasing/);
    expect(() => extractPlanarSlices(mesh, { ...field, levels: Array(513).fill(0) }, 0)).toThrow(
      /budget/,
    );
    expect(() => extractPlanarSlices({ ...mesh, T: new Uint32Array([0, 0, 0]) }, field, 0)).toThrow(
      /Degenerate/,
    );
    expect(() => extractPlanarSlices(mesh, field, -1)).toThrow(/revision/);
    expect(() => extractPlanarSlices(mesh, field, 0, 0)).toThrow(/tolerance/);
  });
});
