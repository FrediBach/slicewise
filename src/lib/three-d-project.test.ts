import { describe, expect, it } from 'vitest';
import { weld } from './mesh';
import { deformMesh } from './mesh-deformation';
import { createThreeDProject, placeThreeDSource, sourceIdentity } from './three-d-project';

const raw = {
  verts: new Float64Array([10, 20, 30, 12, 20, 30, 10, 24, 30, 10, 20, 36]),
  tris: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
};
const source = () => {
  const mesh = weld(raw);
  return { mesh, normalization: mesh.normalization, imported: true };
};
describe('physical source contracts', () => {
  it('retains raw bounds and normalization and restores asymmetric millimeter dimensions', () => {
    const input = source();
    expect(input.normalization).toMatchObject({
      center: [11, 22, 33],
      rawMin: [10, 20, 30],
      rawMax: [12, 24, 36],
    });
    const before = input.mesh.V.slice();
    const project = { ...createThreeDProject('test'), sizeMode: 'mm' as const };
    const result = placeThreeDSource(input.mesh, input, project);
    result.dimensions.forEach((n, i) => expect(n).toBeCloseTo([2, 4, 6][i], 5));
    expect(result.min[2]).toBe(0);
    expect(result.min[0]).toBeCloseTo(-1);
    expect(result.min[1]).toBeCloseTo(-2);
    expect(input.mesh.V).toEqual(before);
    expect(result.T).not.toBe(input.mesh.T);
  });
  it('uses one uniform scale, fixed X/Y/Z orientation and explicit bed offsets', () => {
    const input = source(),
      project = createThreeDProject('test');
    project.longestMm = 120;
    project.rotation = [90, 0, 0];
    project.position = [12, -5, 3];
    const result = placeThreeDSource(input.mesh, input, project);
    result.dimensions.forEach((n, i) => expect(n).toBeCloseTo([40, 120, 80][i], 4));
    expect(result.min[2]).toBeCloseTo(3);
    expect(result.min[0]).toBeCloseTo(-8);
    const again = placeThreeDSource(input.mesh, input, project);
    expect(again).toEqual(result);
  });
  it('scales the shared deformed surface and preserves physical units after Object edits', () => {
    const input = source(),
      project = { ...createThreeDProject('test'), sizeMode: 'cm' as const };
    const shaped = deformMesh(input.mesh, {
      objectEnabled: true,
      objectStretch: true,
      objectScaleX: 200,
    });
    const result = placeThreeDSource(shaped, input, project);
    result.dimensions.forEach((n, i) => expect(n).toBeCloseTo([40, 40, 60][i], 4));
  });
  it('distinguishes source content and raw scale while associating identical local sources', () => {
    const a = source().mesh,
      b = source().mesh;
    expect(sourceIdentity(a, a.normalization)).toBe(sourceIdentity(b, b.normalization));
    b.V[0] += 0.01;
    expect(sourceIdentity(a)).not.toBe(sourceIdentity(b));
    expect(sourceIdentity(a, a.normalization)).not.toBe(
      sourceIdentity(a, { ...a.normalization!, radius: 200 }),
    );
  });
  it('rejects unsupported or invalid physical inputs without fabricating a solid', () => {
    const input = source(),
      project = createThreeDProject('test');
    expect(() =>
      placeThreeDSource({ ...input.mesh, T: new Uint32Array() }, input, project),
    ).toThrow('mesh surface');
    expect(() => placeThreeDSource(input.mesh, input, { ...project, longestMm: NaN })).toThrow(
      'dimension',
    );
    expect(() =>
      placeThreeDSource(input.mesh, { imported: false }, { ...project, sizeMode: 'in' }),
    ).toThrow('imported');
  });
});
