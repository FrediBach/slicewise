import { describe, expect, it } from 'vitest';
import { getMeshTopology } from './mesh-topology';

describe('mesh topology', () => {
  it('builds unique weighted edges and boundary adjacency for a triangle', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 3, 0, 0, 0, 4, 0]),
      T: new Uint32Array([0, 1, 2]),
    };
    const topology = getMeshTopology(mesh);

    expect(Array.from(topology.edgeVertices)).toEqual([0, 1, 0, 2, 1, 2]);
    expect(Array.from(topology.edgeLengths)).toEqual([3, 4, 5]);
    expect(Array.from(topology.edgeFaceCounts)).toEqual([1, 1, 1]);
    expect(Array.from(topology.boundaryEdges)).toEqual([0, 1, 0, 2, 1, 2]);
    expect(Array.from(topology.adjacencyOffsets)).toEqual([0, 2, 4, 6]);
    expect(topology.componentCount).toBe(1);
    expect(Array.from(topology.componentSizes)).toEqual([3]);
    expect(Array.from(topology.isolatedVertices)).toEqual([]);
  });

  it('deduplicates shared edges and recognizes a closed tetrahedron', () => {
    const square = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
      T: new Uint32Array([0, 1, 2, 1, 3, 2]),
    };
    const squareTopology = getMeshTopology(square);
    expect(squareTopology.edgeVertices).toHaveLength(10);
    expect(squareTopology.duplicateEdgeCount).toBe(1);
    expect(Array.from(squareTopology.edgeFaceCounts)).toEqual([1, 1, 2, 1, 1]);
    expect(squareTopology.boundaryEdges).toHaveLength(8);

    const tetrahedron = {
      V: new Float32Array([1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1]),
      T: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
    };
    const tetrahedronTopology = getMeshTopology(tetrahedron);
    expect(tetrahedronTopology.edgeVertices).toHaveLength(12);
    expect(Array.from(tetrahedronTopology.edgeFaceCounts)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(tetrahedronTopology.boundaryEdges).toHaveLength(0);
    expect(tetrahedronTopology.nonManifoldEdges).toHaveLength(0);
  });

  it('labels disconnected components and isolated vertices deterministically', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0, 20, 0, 0]),
      T: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
    const topology = getMeshTopology(mesh);

    expect(topology.componentCount).toBe(3);
    expect(Array.from(topology.componentLabels)).toEqual([0, 0, 0, 1, 1, 1, 2]);
    expect(Array.from(topology.componentSizes)).toEqual([3, 3, 1]);
    expect(Array.from(topology.isolatedVertices)).toEqual([6]);
  });

  it('reports zero-length, degenerate, invalid, and non-manifold input safely', () => {
    const mesh = {
      V: new Float32Array([
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        0,
        0,
        -1,
        0,
        1,
        1,
        0,
        2,
        0,
        0,
        2,
        0,
        0,
        Number.NaN,
        0,
        0,
      ]),
      T: new Int32Array([0, 1, 2, 1, 0, 3, 0, 1, 4, 0, 2, 2, 5, 6, 2, 5, 7, 6, 0, 99, 1]),
    };
    const topology = getMeshTopology(mesh);

    expect(topology.nonManifoldEdges).toEqual(new Uint32Array([0, 1]));
    expect(topology.zeroLengthEdgeCount).toBe(2);
    expect(topology.invalidEdgeCount).toBe(2);
    expect(topology.degenerateTriangleCount).toBe(1);
    expect(topology.invalidTriangleCount).toBe(1);
    expect(Array.from(topology.edgeLengths).every((length) => length > 0)).toBe(true);
    expect(Array.from(topology.adjacentEdgeLengths).every(Number.isFinite)).toBe(true);
  });

  it('reuses the cached topology object for the same installed mesh', () => {
    const mesh = {
      V: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      T: new Uint32Array([0, 1, 2]),
    };

    expect(getMeshTopology(mesh)).toBe(getMeshTopology(mesh));
    expect(getMeshTopology({ ...mesh })).not.toBe(getMeshTopology(mesh));
  });
});
