'use strict';

import { getMeshTopology, type MeshTopology, type TopologyMesh } from './mesh-topology';

export type ModelDirection = readonly [x: number, y: number, z: number];

export interface SurfaceGraphVoronoi {
  distances: Float64Array;
  /** Seed vertex responsible for each distance, or -1 when unreachable. */
  labels: Int32Array;
}

class DistanceHeap {
  private readonly vertices: number[] = [];
  private readonly distances: number[] = [];

  get size(): number {
    return this.vertices.length;
  }

  private before(left: number, right: number): boolean {
    const leftDistance = this.distances[left],
      rightDistance = this.distances[right];
    return (
      leftDistance < rightDistance ||
      (leftDistance === rightDistance && this.vertices[left] < this.vertices[right])
    );
  }

  private swap(left: number, right: number): void {
    [this.vertices[left], this.vertices[right]] = [this.vertices[right], this.vertices[left]];
    [this.distances[left], this.distances[right]] = [this.distances[right], this.distances[left]];
  }

  push(vertex: number, distance: number): void {
    let index = this.vertices.length;
    this.vertices.push(vertex);
    this.distances.push(distance);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): readonly [vertex: number, distance: number] | null {
    if (!this.vertices.length) return null;
    const vertex = this.vertices[0],
      distance = this.distances[0];
    const lastVertex = this.vertices.pop()!,
      lastDistance = this.distances.pop()!;
    if (this.vertices.length) {
      this.vertices[0] = lastVertex;
      this.distances[0] = lastDistance;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1,
          right = left + 1;
        let next = index;
        if (left < this.vertices.length && this.before(left, next)) next = left;
        if (right < this.vertices.length && this.before(right, next)) next = right;
        if (next === index) break;
        this.swap(index, next);
        index = next;
      }
    }
    return [vertex, distance];
  }
}

class VoronoiHeap {
  private readonly vertices: number[] = [];
  private readonly distances: number[] = [];
  private readonly labels: number[] = [];

  get size(): number {
    return this.vertices.length;
  }

  private before(left: number, right: number): boolean {
    return (
      this.distances[left] < this.distances[right] ||
      (this.distances[left] === this.distances[right] &&
        (this.labels[left] < this.labels[right] ||
          (this.labels[left] === this.labels[right] && this.vertices[left] < this.vertices[right])))
    );
  }

  private swap(left: number, right: number): void {
    [this.vertices[left], this.vertices[right]] = [this.vertices[right], this.vertices[left]];
    [this.distances[left], this.distances[right]] = [this.distances[right], this.distances[left]];
    [this.labels[left], this.labels[right]] = [this.labels[right], this.labels[left]];
  }

  push(vertex: number, distance: number, label: number): void {
    let index = this.vertices.length;
    this.vertices.push(vertex);
    this.distances.push(distance);
    this.labels.push(label);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): readonly [vertex: number, distance: number, label: number] | null {
    if (!this.vertices.length) return null;
    const entry = [this.vertices[0], this.distances[0], this.labels[0]] as const;
    const lastVertex = this.vertices.pop()!,
      lastDistance = this.distances.pop()!,
      lastLabel = this.labels.pop()!;
    if (this.vertices.length) {
      this.vertices[0] = lastVertex;
      this.distances[0] = lastDistance;
      this.labels[0] = lastLabel;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1,
          right = left + 1;
        let next = index;
        if (left < this.vertices.length && this.before(left, next)) next = left;
        if (right < this.vertices.length && this.before(right, next)) next = right;
        if (next === index) break;
        this.swap(index, next);
        index = next;
      }
    }
    return entry;
  }
}

function solveSurfaceGraphDistances(
  topology: MeshTopology,
  seedVertices: Iterable<number>,
): Float64Array {
  const distances = new Float64Array(topology.vertexCount);
  distances.fill(Infinity);
  const seeds = Array.from(
    new Set(
      Array.from(seedVertices).filter(
        (vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < topology.vertexCount,
      ),
    ),
  ).sort((left, right) => left - right);
  const heap = new DistanceHeap();
  for (const seed of seeds) {
    distances[seed] = 0;
    heap.push(seed, 0);
  }

  while (heap.size) {
    const entry = heap.pop()!;
    const vertex = entry[0],
      distance = entry[1];
    if (distance !== distances[vertex]) continue;
    for (
      let adjacent = topology.adjacencyOffsets[vertex];
      adjacent < topology.adjacencyOffsets[vertex + 1];
      adjacent++
    ) {
      const neighbor = topology.adjacentVertices[adjacent];
      const candidate = distance + topology.adjacentEdgeLengths[adjacent];
      if (candidate >= distances[neighbor]) continue;
      distances[neighbor] = candidate;
      heap.push(neighbor, candidate);
    }
  }
  return distances;
}

/**
 * Computes shortest-path distance along mesh edges from one or more sources.
 * This is a surface graph approximation, not a continuous exact geodesic.
 */
export function surfaceGraphDistances(
  mesh: TopologyMesh,
  seedVertices: Iterable<number>,
): Float64Array {
  return solveSurfaceGraphDistances(getMeshTopology(mesh), seedVertices);
}

/**
 * Computes nearest-source graph distances and stable seed-vertex labels.
 * Equal distances are assigned to the lower seed vertex regardless of input
 * order. Vertices unreachable from every valid seed retain Infinity / -1.
 */
export function surfaceGraphVoronoi(
  mesh: TopologyMesh,
  seedVertices: Iterable<number>,
): SurfaceGraphVoronoi {
  const topology = getMeshTopology(mesh);
  const distances = new Float64Array(topology.vertexCount);
  distances.fill(Infinity);
  const labels = new Int32Array(topology.vertexCount);
  labels.fill(-1);
  const seeds = Array.from(
    new Set(
      Array.from(seedVertices).filter(
        (vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < topology.vertexCount,
      ),
    ),
  ).sort((left, right) => left - right);
  const heap = new VoronoiHeap();
  for (const seed of seeds) {
    distances[seed] = 0;
    labels[seed] = seed;
    heap.push(seed, 0, seed);
  }

  while (heap.size) {
    const entry = heap.pop()!;
    const vertex = entry[0],
      distance = entry[1],
      label = entry[2];
    if (distance !== distances[vertex] || label !== labels[vertex]) continue;
    for (
      let adjacent = topology.adjacencyOffsets[vertex];
      adjacent < topology.adjacencyOffsets[vertex + 1];
      adjacent++
    ) {
      const neighbor = topology.adjacentVertices[adjacent];
      const candidate = distance + topology.adjacentEdgeLengths[adjacent];
      if (
        candidate > distances[neighbor] ||
        (candidate === distances[neighbor] && labels[neighbor] !== -1 && label >= labels[neighbor])
      )
        continue;
      distances[neighbor] = candidate;
      labels[neighbor] = label;
      heap.push(neighbor, candidate, label);
    }
  }
  return { distances, labels };
}

/**
 * Selects the extreme finite vertex in a model-space direction. The direction
 * and centered vertex projection are normalized by common magnitudes, so mesh
 * scale does not affect the choice. Exact score ties resolve to the lower index.
 */
export function selectDirectionalSeedVertex(
  mesh: Pick<TopologyMesh, 'V'>,
  direction: ModelDirection,
): number | null {
  const vertexCount = Math.floor(mesh.V.length / 3);
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity,
    firstFinite: number | null = null;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const offset = vertex * 3,
      x = mesh.V[offset],
      y = mesh.V[offset + 1],
      z = mesh.V[offset + 2];
    if (![x, y, z].every(Number.isFinite)) continue;
    if (firstFinite === null) firstFinite = vertex;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  if (firstFinite === null) return null;

  const centerX = (minX + maxX) * 0.5,
    centerY = (minY + maxY) * 0.5,
    centerZ = (minZ + maxZ) * 0.5;
  let directionX = Number(direction[0]),
    directionY = Number(direction[1]),
    directionZ = Number(direction[2]);
  let directionLength = Math.hypot(directionX, directionY, directionZ);
  if (!Number.isFinite(directionLength) || directionLength <= 1e-12) {
    directionX = 0;
    directionY = 0;
    directionZ = 1;
    directionLength = 1;
  }
  directionX /= directionLength;
  directionY /= directionLength;
  directionZ /= directionLength;

  let radius = 0;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const offset = vertex * 3,
      x = mesh.V[offset],
      y = mesh.V[offset + 1],
      z = mesh.V[offset + 2];
    if (![x, y, z].every(Number.isFinite)) continue;
    radius = Math.max(radius, Math.hypot(x - centerX, y - centerY, z - centerZ));
  }
  if (!Number.isFinite(radius) || radius <= 1e-12) return firstFinite;

  let selected = firstFinite,
    bestScore = -Infinity;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const offset = vertex * 3,
      x = mesh.V[offset],
      y = mesh.V[offset + 1],
      z = mesh.V[offset + 2];
    if (![x, y, z].every(Number.isFinite)) continue;
    const score =
      ((x - centerX) * directionX + (y - centerY) * directionY + (z - centerZ) * directionZ) /
      radius;
    if (score > bestScore) {
      bestScore = score;
      selected = vertex;
    }
  }
  return selected;
}
