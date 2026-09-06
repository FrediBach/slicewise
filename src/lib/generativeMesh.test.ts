import { describe, expect, it } from 'vitest';
import { generateMesh, GEN_DEFAULTS, meshToStl, type GenField } from './generativeMesh';
import { parseSTL } from './mesh';

describe('generateMesh', () => {
  it('produces a deterministic, closed, indexed mesh at minimum resolution', () => {
    const params = { ...GEN_DEFAULTS, genSeed: 17, genRes: 32, genBlend: 0 };
    const first = generateMesh(params, { diagnostics: true });
    const second = generateMesh(params, { diagnostics: true });

    expect(first.stats.vertexCount).toBeGreaterThan(0);
    expect(first.stats.triangleCount).toBeGreaterThan(0);
    expect(first.positions).toHaveLength(first.stats.vertexCount * 3);
    expect(first.normals).toHaveLength(first.positions.length);
    expect(first.indices).toHaveLength(first.stats.triangleCount * 3);
    expect(first.stats.openEdges).toBe(0);
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(Array.from(first.indices)).toEqual(Array.from(second.indices));
  });

  it('returns unit-length normals', () => {
    const mesh = generateMesh({ ...GEN_DEFAULTS, genRes: 32, genBlend: 0 });
    const sampledLengths: number[] = [];
    for (
      let index = 0;
      index < mesh.normals.length;
      index += Math.max(3, Math.floor(mesh.normals.length / 60 / 3) * 3)
    ) {
      sampledLengths.push(
        Math.hypot(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]),
      );
    }

    for (const length of sampledLengths) expect(length).toBeCloseTo(1, 4);
  });

  it.each<GenField>(['gyroid', 'schwarzP', 'diamond', 'neovius', 'metaballs', 'supershape'])(
    'generates finite %s field geometry',
    (field) => {
      const mesh = generateMesh({ ...GEN_DEFAULTS, genField: field, genRes: 32 });

      expect(mesh.stats.vertexCount).toBeGreaterThan(0);
      expect(mesh.stats.triangleCount).toBeGreaterThan(0);
      expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
      expect(Array.from(mesh.normals).every(Number.isFinite)).toBe(true);
      expect(Math.max(...mesh.indices)).toBeLessThan(mesh.stats.vertexCount);
    },
  );

  it('serializes generated geometry as a parseable binary STL', () => {
    const generated = generateMesh({ ...GEN_DEFAULTS, genRes: 32, genBlend: 0 });
    const stl = meshToStl(generated);
    const parsed = parseSTL(stl);

    expect(stl.byteLength).toBe(84 + generated.stats.triangleCount * 50);
    expect(parsed.tris).toHaveLength(generated.indices.length);
    expect(parsed.verts).toHaveLength(generated.indices.length * 3);
    expect(Array.from(parsed.verts).every(Number.isFinite)).toBe(true);
  });
});
