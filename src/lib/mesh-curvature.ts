'use strict';

import { getMeshTopology, type TopologyMesh } from './mesh-topology';

export type CurvatureMethod = 'gaussian' | 'mean';

export interface MeshCurvatureResult {
  values: Float64Array;
  validVertexCount: number;
  maskedVertexCount: number;
}

interface CurvatureCache {
  raw: Map<CurvatureMethod, MeshCurvatureResult>;
  smoothed: Map<string, MeshCurvatureResult>;
}

const curvatureCache = new WeakMap<TopologyMesh, CurvatureCache>();
const EPSILON = 1e-12;

const position = (mesh: TopologyMesh, vertex: number): readonly [number, number, number] => {
  const offset = vertex * 3;
  return [mesh.V[offset], mesh.V[offset + 1], mesh.V[offset + 2]];
};

const angleAt = (
  center: readonly number[],
  first: readonly number[],
  second: readonly number[],
): number => {
  const ax = first[0] - center[0],
    ay = first[1] - center[1],
    az = first[2] - center[2];
  const bx = second[0] - center[0],
    by = second[1] - center[1],
    bz = second[2] - center[2];
  const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  const dot = ax * bx + ay * by + az * bz;
  return Math.atan2(cross, dot);
};

function computeRawCurvature(mesh: TopologyMesh, method: CurvatureMethod): MeshCurvatureResult {
  const topology = getMeshTopology(mesh);
  const count = topology.vertexCount;
  const area = new Float64Array(count);
  const angleSum = new Float64Array(count);
  const normals = new Float64Array(count * 3);
  const laplacian = new Float64Array(count * 3);
  const invalid = new Uint8Array(count);

  for (let offset = 0; offset < topology.boundaryEdges.length; offset++)
    invalid[topology.boundaryEdges[offset]] = 1;
  for (let offset = 0; offset < topology.nonManifoldEdges.length; offset++)
    invalid[topology.nonManifoldEdges[offset]] = 1;
  for (const vertex of topology.isolatedVertices) invalid[vertex] = 1;

  const triangleCount = Math.floor(mesh.T.length / 3);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const triangleOffset = triangle * 3;
    const a = mesh.T[triangleOffset],
      b = mesh.T[triangleOffset + 1],
      c = mesh.T[triangleOffset + 2];
    if (![a, b, c].every((vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < count))
      continue;
    if (a === b || b === c || c === a) {
      invalid[a] = invalid[b] = invalid[c] = 1;
      continue;
    }
    const pa = position(mesh, a),
      pb = position(mesh, b),
      pc = position(mesh, c);
    if (![...pa, ...pb, ...pc].every(Number.isFinite)) {
      invalid[a] = invalid[b] = invalid[c] = 1;
      continue;
    }
    const abx = pb[0] - pa[0],
      aby = pb[1] - pa[1],
      abz = pb[2] - pa[2];
    const acx = pc[0] - pa[0],
      acy = pc[1] - pa[1],
      acz = pc[2] - pa[2];
    const nx = aby * acz - abz * acy,
      ny = abz * acx - abx * acz,
      nz = abx * acy - aby * acx;
    const doubleArea = Math.hypot(nx, ny, nz);
    if (!(doubleArea > EPSILON) || !Number.isFinite(doubleArea)) {
      invalid[a] = invalid[b] = invalid[c] = 1;
      continue;
    }
    const triangleArea = doubleArea * 0.5;
    for (const vertex of [a, b, c]) {
      area[vertex] += triangleArea / 3;
      normals[vertex * 3] += nx;
      normals[vertex * 3 + 1] += ny;
      normals[vertex * 3 + 2] += nz;
    }
    const angleA = angleAt(pa, pb, pc),
      angleB = angleAt(pb, pc, pa),
      angleC = angleAt(pc, pa, pb);
    angleSum[a] += angleA;
    angleSum[b] += angleB;
    angleSum[c] += angleC;

    // The cotangent opposite an edge contributes to both of its endpoints.
    const cotA = (abx * acx + aby * acy + abz * acz) / doubleArea;
    const bax = pa[0] - pb[0],
      bay = pa[1] - pb[1],
      baz = pa[2] - pb[2];
    const bcx = pc[0] - pb[0],
      bcy = pc[1] - pb[1],
      bcz = pc[2] - pb[2];
    const cotB = (bax * bcx + bay * bcy + baz * bcz) / doubleArea;
    const cax = pa[0] - pc[0],
      cay = pa[1] - pc[1],
      caz = pa[2] - pc[2];
    const cbx = pb[0] - pc[0],
      cby = pb[1] - pc[1],
      cbz = pb[2] - pc[2];
    const cotC = (cax * cbx + cay * cby + caz * cbz) / doubleArea;
    for (const [first, second, weight] of [
      [a, b, cotC],
      [b, c, cotA],
      [c, a, cotB],
    ] as const) {
      const firstPosition = position(mesh, first),
        secondPosition = position(mesh, second);
      for (let component = 0; component < 3; component++) {
        const delta = (firstPosition[component] - secondPosition[component]) * weight;
        laplacian[first * 3 + component] += delta;
        laplacian[second * 3 + component] -= delta;
      }
    }
  }

  const values = new Float64Array(count);
  values.fill(Number.NaN);
  let validVertexCount = 0;
  for (let vertex = 0; vertex < count; vertex++) {
    if (invalid[vertex] || !(area[vertex] > EPSILON)) continue;
    let value: number;
    if (method === 'gaussian') {
      value = (Math.PI * 2 - angleSum[vertex]) / area[vertex];
    } else {
      const offset = vertex * 3;
      const normalLength = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]);
      if (!(normalLength > EPSILON)) continue;
      value =
        (laplacian[offset] * normals[offset] +
          laplacian[offset + 1] * normals[offset + 1] +
          laplacian[offset + 2] * normals[offset + 2]) /
        (normalLength * 4 * area[vertex]);
    }
    if (!Number.isFinite(value)) continue;
    values[vertex] = value;
    validVertexCount++;
  }
  return { values, validVertexCount, maskedVertexCount: count - validVertexCount };
}

function smoothCurvature(
  mesh: TopologyMesh,
  source: MeshCurvatureResult,
  iterations: number,
): MeshCurvatureResult {
  const topology = getMeshTopology(mesh);
  let current = source.values.slice();
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = current.slice();
    for (let vertex = 0; vertex < topology.vertexCount; vertex++) {
      if (!Number.isFinite(current[vertex])) continue;
      let sum = current[vertex],
        weight = 1;
      for (
        let adjacent = topology.adjacencyOffsets[vertex];
        adjacent < topology.adjacencyOffsets[vertex + 1];
        adjacent++
      ) {
        const value = current[topology.adjacentVertices[adjacent]];
        if (!Number.isFinite(value)) continue;
        sum += value;
        weight++;
      }
      next[vertex] = sum / weight;
    }
    current = next;
  }
  return { ...source, values: current };
}

export function meshCurvature(
  mesh: TopologyMesh,
  method: CurvatureMethod,
  smoothingIterations = 0,
): MeshCurvatureResult {
  let cache = curvatureCache.get(mesh);
  if (!cache) {
    cache = { raw: new Map(), smoothed: new Map() };
    curvatureCache.set(mesh, cache);
  }
  let raw = cache.raw.get(method);
  if (!raw) {
    raw = computeRawCurvature(mesh, method);
    cache.raw.set(method, raw);
  }
  const iterations = Math.max(0, Math.min(20, Math.floor(smoothingIterations)));
  if (!iterations) return raw;
  const key = `${method}:${iterations}`;
  let result = cache.smoothed.get(key);
  if (!result) {
    result = smoothCurvature(mesh, raw, iterations);
    cache.smoothed.set(key, result);
  }
  return result;
}
