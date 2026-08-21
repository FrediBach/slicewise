import { describe, expect, it } from "vitest";
import { generateMesh, GEN_DEFAULTS } from "./generativeMesh";

describe("generateMesh", () => {
  it("produces a deterministic, closed, indexed mesh at minimum resolution", () => {
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

  it("returns unit-length normals", () => {
    const mesh = generateMesh({ ...GEN_DEFAULTS, genRes: 32, genBlend: 0 });
    const sampledLengths: number[] = [];
    for (let index = 0; index < mesh.normals.length; index += Math.max(3, Math.floor(mesh.normals.length / 60 / 3) * 3)) {
      sampledLengths.push(Math.hypot(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]));
    }

    for (const length of sampledLengths) expect(length).toBeCloseTo(1, 4);
  });
});
