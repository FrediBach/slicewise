'use strict';

export interface TopologyMesh {
  V: ArrayLike<number>;
  T: ArrayLike<number>;
}

/**
 * Compact, deterministic topology derived from one installed mesh.
 *
 * Edge arrays contain only finite, positive-length edges. Diagnostic counts
 * report malformed input that was skipped. Components include isolated
 * vertices, each as a one-vertex component.
 */
export interface MeshTopology {
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** Flat `[a, b, ...]` pairs in ascending lexicographic order. */
  readonly edgeVertices: Uint32Array;
  readonly edgeLengths: Float64Array;
  /** Number of distinct valid triangles incident to each edge. */
  readonly edgeFaceCounts: Uint32Array;
  readonly adjacencyOffsets: Uint32Array;
  readonly adjacentVertices: Uint32Array;
  readonly adjacentEdgeLengths: Float64Array;
  readonly boundaryEdges: Uint32Array;
  readonly nonManifoldEdges: Uint32Array;
  readonly isolatedVertices: Uint32Array;
  readonly componentLabels: Int32Array;
  readonly componentSizes: Uint32Array;
  readonly componentCount: number;
  /** Repeated undirected edge occurrences after the first, including ordinary shared edges. */
  readonly duplicateEdgeCount: number;
  readonly zeroLengthEdgeCount: number;
  readonly invalidEdgeCount: number;
  readonly invalidTriangleCount: number;
  readonly degenerateTriangleCount: number;
}

interface EdgeAccumulator {
  a: number;
  b: number;
  faceCount: number;
  occurrences: number;
}

const topologyCache = new WeakMap<TopologyMesh, MeshTopology>();

const edgeKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

function buildMeshTopology(mesh: TopologyMesh): MeshTopology {
  const vertexCount = Math.floor(mesh.V.length / 3);
  const triangleCount = Math.floor(mesh.T.length / 3);
  const edgesByKey = new Map<string, EdgeAccumulator>();
  let invalidTriangleCount = 0,
    degenerateTriangleCount = 0;

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const offset = triangle * 3;
    const vertices = [mesh.T[offset], mesh.T[offset + 1], mesh.T[offset + 2]];
    if (
      !vertices.every((vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < vertexCount)
    ) {
      invalidTriangleCount++;
      continue;
    }
    if (vertices[0] === vertices[1] || vertices[1] === vertices[2] || vertices[2] === vertices[0])
      degenerateTriangleCount++;

    const triangleEdges: ReadonlyArray<readonly [number, number]> = [
      [vertices[0], vertices[1]],
      [vertices[1], vertices[2]],
      [vertices[2], vertices[0]],
    ];
    const countedFaces = new Set<string>();
    for (const [first, second] of triangleEdges) {
      const a = Math.min(first, second),
        b = Math.max(first, second);
      const key = edgeKey(a, b);
      let edge = edgesByKey.get(key);
      if (!edge) {
        edge = { a, b, faceCount: 0, occurrences: 0 };
        edgesByKey.set(key, edge);
      }
      edge.occurrences++;
      if (!countedFaces.has(key)) {
        edge.faceCount++;
        countedFaces.add(key);
      }
    }
  }

  const accumulatedEdges = Array.from(edgesByKey.values()).sort((left, right) =>
    left.a === right.a ? left.b - right.b : left.a - right.a,
  );
  const validEdges: Array<EdgeAccumulator & { length: number }> = [];
  let duplicateEdgeCount = 0,
    zeroLengthEdgeCount = 0,
    invalidEdgeCount = 0;
  for (const edge of accumulatedEdges) {
    duplicateEdgeCount += Math.max(0, edge.occurrences - 1);
    const ai = edge.a * 3,
      bi = edge.b * 3;
    const coordinates = [
      mesh.V[ai],
      mesh.V[ai + 1],
      mesh.V[ai + 2],
      mesh.V[bi],
      mesh.V[bi + 1],
      mesh.V[bi + 2],
    ];
    if (!coordinates.every(Number.isFinite)) {
      invalidEdgeCount++;
      continue;
    }
    const length = Math.hypot(
      coordinates[3] - coordinates[0],
      coordinates[4] - coordinates[1],
      coordinates[5] - coordinates[2],
    );
    if (!Number.isFinite(length)) {
      invalidEdgeCount++;
      continue;
    }
    if (length <= 1e-12) {
      zeroLengthEdgeCount++;
      continue;
    }
    validEdges.push({ ...edge, length });
  }

  const edgeVertices = new Uint32Array(validEdges.length * 2);
  const edgeLengths = new Float64Array(validEdges.length);
  const edgeFaceCounts = new Uint32Array(validEdges.length);
  const degrees = new Uint32Array(vertexCount);
  const boundary: number[] = [],
    nonManifold: number[] = [];
  for (let index = 0; index < validEdges.length; index++) {
    const edge = validEdges[index];
    edgeVertices[index * 2] = edge.a;
    edgeVertices[index * 2 + 1] = edge.b;
    edgeLengths[index] = edge.length;
    edgeFaceCounts[index] = edge.faceCount;
    degrees[edge.a]++;
    degrees[edge.b]++;
    if (edge.faceCount === 1) boundary.push(edge.a, edge.b);
    else if (edge.faceCount > 2) nonManifold.push(edge.a, edge.b);
  }

  const adjacencyOffsets = new Uint32Array(vertexCount + 1);
  for (let vertex = 0; vertex < vertexCount; vertex++)
    adjacencyOffsets[vertex + 1] = adjacencyOffsets[vertex] + degrees[vertex];
  const adjacentVertices = new Uint32Array(adjacencyOffsets[vertexCount]);
  const adjacentEdgeLengths = new Float64Array(adjacentVertices.length);
  const writeOffsets = adjacencyOffsets.slice(0, vertexCount);
  for (let edge = 0; edge < validEdges.length; edge++) {
    const a = edgeVertices[edge * 2],
      b = edgeVertices[edge * 2 + 1],
      length = edgeLengths[edge];
    let target = writeOffsets[a]++;
    adjacentVertices[target] = b;
    adjacentEdgeLengths[target] = length;
    target = writeOffsets[b]++;
    adjacentVertices[target] = a;
    adjacentEdgeLengths[target] = length;
  }

  const isolated: number[] = [];
  const componentLabels = new Int32Array(vertexCount);
  componentLabels.fill(-1);
  const componentSizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < vertexCount; start++) {
    if (degrees[start] === 0) isolated.push(start);
    if (componentLabels[start] !== -1) continue;
    const component = componentSizes.length;
    let size = 0;
    componentLabels[start] = component;
    stack.push(start);
    while (stack.length) {
      const vertex = stack.pop()!;
      size++;
      for (
        let adjacent = adjacencyOffsets[vertex];
        adjacent < adjacencyOffsets[vertex + 1];
        adjacent++
      ) {
        const neighbor = adjacentVertices[adjacent];
        if (componentLabels[neighbor] !== -1) continue;
        componentLabels[neighbor] = component;
        stack.push(neighbor);
      }
    }
    componentSizes.push(size);
  }

  return {
    vertexCount,
    triangleCount,
    edgeVertices,
    edgeLengths,
    edgeFaceCounts,
    adjacencyOffsets,
    adjacentVertices,
    adjacentEdgeLengths,
    boundaryEdges: Uint32Array.from(boundary),
    nonManifoldEdges: Uint32Array.from(nonManifold),
    isolatedVertices: Uint32Array.from(isolated),
    componentLabels,
    componentSizes: Uint32Array.from(componentSizes),
    componentCount: componentSizes.length,
    duplicateEdgeCount,
    zeroLengthEdgeCount,
    invalidEdgeCount,
    invalidTriangleCount,
    degenerateTriangleCount,
  };
}

export function getMeshTopology(mesh: TopologyMesh): MeshTopology {
  const cached = topologyCache.get(mesh);
  if (cached) return cached;
  const topology = buildMeshTopology(mesh);
  topologyCache.set(mesh, topology);
  return topology;
}
