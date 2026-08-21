import { describe, expect, it } from "vitest";
import {
  parseOBJ,
  parsePLY,
  parseSTL,
  radialColumnDemo,
  ringTorus,
  sphereDemo,
  tetrapodDemo,
  torusKnot,
  vertexNormals,
  weld,
} from "./mesh";

const bufferOf = (value: string) => new TextEncoder().encode(value).buffer as ArrayBuffer;

const binaryStl = () => {
  const buffer = new ArrayBuffer(84 + 50);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true);
  const values = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
  values.forEach((value, index) => view.setFloat32(84 + index * 4, value, true));
  return buffer;
};

const binaryPly = () => {
  const header = bufferOf(`ply
format binary_little_endian 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
`);
  const buffer = new ArrayBuffer(header.byteLength + 36 + 13);
  new Uint8Array(buffer).set(new Uint8Array(header));
  const view = new DataView(buffer);
  let offset = header.byteLength;
  for (const value of [0, 0, 0, 1, 0, 0, 0, 1, 0]) {
    view.setFloat32(offset, value, true);
    offset += 4;
  }
  view.setUint8(offset, 3);
  offset += 1;
  for (const index of [0, 1, 2]) {
    view.setInt32(offset, index, true);
    offset += 4;
  }
  return buffer;
};

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

  it("parses binary STL triangles", () => {
    const mesh = parseSTL(binaryStl());

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

  it("parses binary little-endian PLY data", () => {
    const mesh = parsePLY(binaryPly());

    expect(Array.from(mesh.verts)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(mesh.tris)).toEqual([0, 1, 2]);
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

describe("procedural demo meshes", () => {
  it.each([
    ["torus knot", () => torusKnot(2, 3, 1, 0.2, 12, 4)],
    ["ripple sphere", () => sphereDemo("ripple", 12, 6)],
    ["rounded cube", () => sphereDemo("cube", 12, 6)],
    ["diamond", () => sphereDemo("diamond", 12, 6)],
    ["ring torus", () => ringTorus(0.7, 0.2, 12, 6)],
    ["twisted column", () => radialColumnDemo("twist", 12, 6)],
    ["hourglass", () => radialColumnDemo("hourglass", 12, 6)],
    ["tetrapod", () => tetrapodDemo(12, 6)],
  ])("creates finite, indexed %s geometry", (_name, create) => {
    const mesh = create();
    const vertexCount = mesh.verts.length / 3;

    expect(mesh.verts.length).toBeGreaterThan(0);
    expect(mesh.tris.length).toBeGreaterThan(0);
    expect(mesh.tris.length % 3).toBe(0);
    expect(Array.from(mesh.verts).every(Number.isFinite)).toBe(true);
    expect(Math.max(...mesh.tris)).toBeLessThan(vertexCount);
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
