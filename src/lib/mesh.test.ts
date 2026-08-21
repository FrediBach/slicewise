import { describe, expect, it } from "vitest";
import { parseOBJ, parsePLY, parseSTL, vertexNormals, weld } from "./mesh";

const bufferOf = (value: string) => new TextEncoder().encode(value).buffer as ArrayBuffer;

describe("mesh parsers", () => {
  it("triangulates OBJ polygons and resolves negative indices", () => {
    const polygon = parseOBJ([
      "v 0 0 0",
      "v 1 0 0",
      "v 1 1 0",
      "v 0 1 0",
      "f -4 -3 -2 -1",
    ].join("\n"));

    expect(Array.from(polygon.tris)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(polygon.verts).toHaveLength(12);
  });

  it("parses ASCII STL facets", () => {
    const mesh = parseSTL(bufferOf(`solid triangle
      facet normal 0 0 1
        outer loop
          vertex 0 0 0
          vertex 1 0 0
          vertex 0 1 0
        endloop
      endfacet
    endsolid triangle`));

    expect(Array.from(mesh.tris)).toEqual([0, 1, 2]);
    expect(Array.from(mesh.verts)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it("parses and triangulates ASCII PLY faces", () => {
    const mesh = parsePLY(bufferOf(`ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
1 0 0
1 1 0
0 1 0
4 0 1 2 3
`));

    expect(Array.from(mesh.tris)).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("reports unsupported point-only inputs clearly", () => {
    expect(() => parseOBJ("v 0 0 0\nv 1 0 0")).toThrow(/No faces/);
    expect(() => parsePLY(bufferOf(`ply
format ascii 1.0
element vertex 1
property float x
property float y
property float z
end_header
0 0 0
`))).toThrow(/no faces/i);
  });
});

describe("mesh normalization", () => {
  it("welds duplicate vertices, removes degenerate faces, and normalizes radius", () => {
    const mesh = weld({
      verts: Float64Array.from([0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0]),
      tris: Uint32Array.from([0, 1, 2, 0, 3, 1]),
    });

    expect(mesh.V).toHaveLength(9);
    expect(Array.from(mesh.T)).toEqual([0, 1, 2]);
    const radii = Array.from({ length: mesh.V.length / 3 }, (_, index) =>
      Math.hypot(mesh.V[index * 3], mesh.V[index * 3 + 1], mesh.V[index * 3 + 2]),
    );
    expect(Math.max(...radii)).toBeCloseTo(1, 6);
  });

  it("creates unit vertex normals with consistent winding", () => {
    const vertices = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = vertexNormals(vertices, Uint32Array.from([0, 1, 2]));

    expect(Array.from(normals)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });
});
