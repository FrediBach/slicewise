'use strict';

import type { Vec3 } from './projection';
import {
  selectDirectionalSeedVertex,
  surfaceGraphDistances,
  surfaceGraphVoronoi,
  type ModelDirection,
  type SurfaceGraphVoronoi,
} from './mesh-geodesics';
import { getMeshTopology, type TopologyMesh } from './mesh-topology';

export type MeshScalarFieldKind = 'planar' | 'analytic' | 'intrinsic';

export interface MeshScalarField {
  /** Authoritative scalar samples at mesh vertices. */
  values: ArrayLike<number>;
  min: number;
  max: number;
  kind: MeshScalarFieldKind;
  /** Optional off-vertex evaluator for analytic root refinement. */
  evaluate?: (x: number, y: number, z: number) => number;
  /** Optional local direction for effects such as slice explosion. */
  gradient?: (x: number, y: number, z: number) => Vec3 | null;
  /** Fast path and global metadata for planar fields. */
  constantDirection?: Vec3;
  /** Empty keys deliberately disable topology caching. */
  cacheKey: string;
  /** Development diagnostics for intrinsic fields with unreachable components. */
  intrinsicDiagnostics?: IntrinsicFieldDiagnostics;
  /** Intrinsic modes may override ordinary eased scalar-level placement. */
  levelMode?: 'symmetric-zero' | 'voronoi-boundary';
  voronoi?: IntrinsicVoronoiData;
}

export interface IntrinsicFieldDiagnostics {
  seedVertex: number | null;
  reachableVertexCount: number;
  skippedComponentCount: number;
  seedVertices?: readonly [number | null, number | null];
}

export interface IntrinsicVoronoiData {
  labels: Int32Array;
  /** Signed dA - dB values, finite only where both sources are reachable. */
  differenceValues: Float64Array;
  seedVertices: readonly [number, number];
}

export interface ScalarFieldMesh {
  V: ArrayLike<number>;
}

export interface CameraPlanarField {
  values: ArrayLike<number>;
  min: number;
  max: number;
  direction: Vec3;
}

export interface PlanarScalarFieldOptions {
  axis: string;
  cutAz: number;
  cutEl: number;
  camera?: CameraPlanarField;
}

export interface SphericalScalarFieldOptions {
  center: Vec3;
}

export interface CylindricalScalarFieldOptions extends SphericalScalarFieldOptions {
  axis: Vec3;
}

export interface GeodesicScalarFieldOptions {
  direction: ModelDirection;
}

export type MultiSourceGeodesicMode = 'nearest' | 'difference' | 'voronoi';

export interface MultiSourceGeodesicFieldOptions {
  directionA: ModelDirection;
  directionB: ModelDirection;
  mode: MultiSourceGeodesicMode;
}

export type SliceExplosionMode = 'constant-direction' | 'local-gradient' | 'none';

export interface ScalarFieldCompatibility {
  gapEasing: true;
  lfo: boolean;
  divergence: boolean;
  continuousSpiral: boolean;
  explosion: SliceExplosionMode;
}

export interface ScalarFieldFeatureRequest {
  lfo: boolean;
  divergence: number;
  continuousSpiral: boolean;
  explodeAmount: number;
}

export interface ResolvedScalarFieldFeatures extends ScalarFieldFeatureRequest {
  explosion: SliceExplosionMode;
}

const dotValues = (
  mesh: ScalarFieldMesh,
  direction: Vec3,
): { values: Float32Array; min: number; max: number } => {
  const values = new Float32Array(Math.floor(mesh.V.length / 3));
  let min = Infinity,
    max = -Infinity;
  for (let vertex = 0, offset = 0; vertex < values.length; vertex++, offset += 3) {
    const value =
      mesh.V[offset] * direction[0] +
      mesh.V[offset + 1] * direction[1] +
      mesh.V[offset + 2] * direction[2];
    values[vertex] = value;
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { values, min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
};

const finiteVector = (value: Vec3, fallback: Vec3): Vec3 =>
  value.every(Number.isFinite) ? value : fallback;

const unitVector = (value: Vec3, fallback: Vec3): Vec3 => {
  const finite = finiteVector(value, fallback);
  const length = Math.hypot(finite[0], finite[1], finite[2]);
  return Number.isFinite(length) && length > 1e-12
    ? [finite[0] / length, finite[1] / length, finite[2] / length]
    : fallback;
};

const vectorKey = (value: Vec3): string =>
  value.map((component) => (Object.is(component, -0) ? 0 : component)).join(',');

const sampleAnalyticField = (
  mesh: ScalarFieldMesh,
  evaluate: (x: number, y: number, z: number) => number,
): { values: Float32Array; min: number; max: number } => {
  const values = new Float32Array(Math.floor(mesh.V.length / 3));
  let min = Infinity,
    max = -Infinity;
  for (let vertex = 0, offset = 0; vertex < values.length; vertex++, offset += 3) {
    const value = evaluate(mesh.V[offset], mesh.V[offset + 1], mesh.V[offset + 2]);
    values[vertex] = value;
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { values, min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
};

const GEODESIC_DISTANCE_CACHE_LIMIT = 8;
const geodesicDistanceCache = new WeakMap<TopologyMesh, Map<number, Float64Array>>();
const geodesicVoronoiCache = new WeakMap<TopologyMesh, Map<string, SurfaceGraphVoronoi>>();

function cachedSurfaceGraphDistances(mesh: TopologyMesh, seedVertex: number): Float64Array {
  let cache = geodesicDistanceCache.get(mesh);
  const cached = cache?.get(seedVertex);
  if (cached) {
    // Refresh insertion order so active morph endpoints stay resident.
    cache!.delete(seedVertex);
    cache!.set(seedVertex, cached);
    return cached;
  }
  const distances = surfaceGraphDistances(mesh, [seedVertex]);
  if (!cache) {
    cache = new Map();
    geodesicDistanceCache.set(mesh, cache);
  }
  if (cache.size >= GEODESIC_DISTANCE_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(seedVertex, distances);
  return distances;
}

function cachedSurfaceGraphVoronoi(
  mesh: TopologyMesh,
  seedA: number,
  seedB: number,
): SurfaceGraphVoronoi {
  let cache = geodesicVoronoiCache.get(mesh);
  const key = seedA < seedB ? `${seedA},${seedB}` : `${seedB},${seedA}`;
  const cached = cache?.get(key);
  if (cached) {
    cache!.delete(key);
    cache!.set(key, cached);
    return cached;
  }
  const result = surfaceGraphVoronoi(mesh, [seedA, seedB]);
  if (!cache) {
    cache = new Map();
    geodesicVoronoiCache.set(mesh, cache);
  }
  if (cache.size >= GEODESIC_DISTANCE_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

function finiteRange(values: ArrayLike<number>): {
  min: number;
  max: number;
  finiteCount: number;
} {
  let min = Infinity,
    max = -Infinity,
    finiteCount = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
    finiteCount++;
  }
  return {
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    finiteCount,
  };
}

export function createPlanarScalarField(
  mesh: ScalarFieldMesh,
  options: PlanarScalarFieldOptions,
): MeshScalarField {
  if (options.axis === 'cam' && options.camera) {
    return {
      values: options.camera.values,
      min: Number.isFinite(options.camera.min) ? options.camera.min : 0,
      max: Number.isFinite(options.camera.max) ? options.camera.max : 0,
      kind: 'planar',
      constantDirection: options.camera.direction,
      // Camera fields are intentionally uncached because their values change
      // with camera orientation.
      cacheKey: '',
    };
  }

  let direction: Vec3;
  let cacheKey: string;
  if (options.axis === 'custom') {
    const azimuth = (options.cutAz * Math.PI) / 180;
    const elevation = (options.cutEl * Math.PI) / 180;
    direction = [
      Math.cos(elevation) * Math.cos(azimuth),
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
    ];
    cacheKey = `planar:custom:${options.cutAz}:${options.cutEl}`;
  } else {
    const component = options.axis === 'x' ? 0 : options.axis === 'y' ? 1 : 2;
    direction = component === 0 ? [1, 0, 0] : component === 1 ? [0, 1, 0] : [0, 0, 1];
    cacheKey = `planar:${component === 0 ? 'x' : component === 1 ? 'y' : 'up'}`;
  }
  const { values, min, max } = dotValues(mesh, direction);
  return { values, min, max, kind: 'planar', constantDirection: direction, cacheKey };
}

export function createSphericalScalarField(
  mesh: ScalarFieldMesh,
  options: SphericalScalarFieldOptions,
): MeshScalarField {
  const center = finiteVector(options.center, [0, 0, 0]);
  const evaluate = (x: number, y: number, z: number): number =>
    Math.hypot(x - center[0], y - center[1], z - center[2]);
  const gradient = (x: number, y: number, z: number): Vec3 | null => {
    const dx = x - center[0],
      dy = y - center[1],
      dz = z - center[2];
    const length = Math.hypot(dx, dy, dz);
    return Number.isFinite(length) && length > 1e-12
      ? [dx / length, dy / length, dz / length]
      : null;
  };
  const { values, min, max } = sampleAnalyticField(mesh, evaluate);
  return {
    values,
    min,
    max,
    kind: 'analytic',
    evaluate,
    gradient,
    cacheKey: `analytic:sphere:${vectorKey(center)}`,
  };
}

export function createCylindricalScalarField(
  mesh: ScalarFieldMesh,
  options: CylindricalScalarFieldOptions,
): MeshScalarField {
  const center = finiteVector(options.center, [0, 0, 0]);
  const axis = unitVector(options.axis, [0, 0, 1]);
  const radialOffset = (x: number, y: number, z: number): Vec3 => {
    const dx = x - center[0],
      dy = y - center[1],
      dz = z - center[2];
    const axial = dx * axis[0] + dy * axis[1] + dz * axis[2];
    return [dx - axis[0] * axial, dy - axis[1] * axial, dz - axis[2] * axial];
  };
  const evaluate = (x: number, y: number, z: number): number => {
    const radial = radialOffset(x, y, z);
    return Math.hypot(radial[0], radial[1], radial[2]);
  };
  const gradient = (x: number, y: number, z: number): Vec3 | null => {
    const radial = radialOffset(x, y, z);
    const length = Math.hypot(radial[0], radial[1], radial[2]);
    return Number.isFinite(length) && length > 1e-12
      ? [radial[0] / length, radial[1] / length, radial[2] / length]
      : null;
  };
  const { values, min, max } = sampleAnalyticField(mesh, evaluate);
  return {
    values,
    min,
    max,
    kind: 'analytic',
    evaluate,
    gradient,
    cacheKey: `analytic:cylinder:${vectorKey(center)}:${vectorKey(axis)}`,
  };
}

/**
 * Creates an intrinsic surface-graph distance field from the mesh vertex most
 * extreme in a model-space direction. Unreachable components retain Infinity
 * and are consequently omitted by marching triangles.
 */
export function createGeodesicScalarField(
  mesh: ScalarFieldMesh & TopologyMesh,
  options: GeodesicScalarFieldOptions,
): MeshScalarField {
  const seedVertex = selectDirectionalSeedVertex(mesh, options.direction);
  if (seedVertex === null) {
    return {
      values: new Float64Array(Math.floor(mesh.V.length / 3)).fill(Infinity),
      min: 0,
      max: 0,
      kind: 'intrinsic',
      cacheKey: 'intrinsic:geodesic:none',
      intrinsicDiagnostics: {
        seedVertex: null,
        reachableVertexCount: 0,
        skippedComponentCount: getMeshTopology(mesh).componentCount,
      },
    };
  }

  const values = cachedSurfaceGraphDistances(mesh, seedVertex);
  let min = Infinity,
    max = -Infinity,
    reachableVertexCount = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
    reachableVertexCount++;
  }
  const topology = getMeshTopology(mesh);
  return {
    values,
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    kind: 'intrinsic',
    cacheKey: `intrinsic:geodesic:${seedVertex}`,
    intrinsicDiagnostics: {
      seedVertex,
      reachableVertexCount,
      skippedComponentCount: Math.max(0, topology.componentCount - 1),
    },
  };
}

/** Creates a deterministic two-source intrinsic field or Voronoi boundary payload. */
export function createMultiSourceGeodesicField(
  mesh: ScalarFieldMesh & TopologyMesh,
  options: MultiSourceGeodesicFieldOptions,
): MeshScalarField {
  const seedA = selectDirectionalSeedVertex(mesh, options.directionA);
  const seedB = selectDirectionalSeedVertex(mesh, options.directionB);
  const topology = getMeshTopology(mesh);
  if (seedA === null || seedB === null) {
    return {
      values: new Float64Array(Math.floor(mesh.V.length / 3)).fill(Infinity),
      min: 0,
      max: 0,
      kind: 'intrinsic',
      cacheKey: `intrinsic:geodesic:${options.mode}:none`,
      levelMode: options.mode === 'voronoi' ? 'voronoi-boundary' : undefined,
      intrinsicDiagnostics: {
        seedVertex: seedA,
        seedVertices: [seedA, seedB],
        reachableVertexCount: 0,
        skippedComponentCount: topology.componentCount,
      },
    };
  }

  const seededComponents = new Set([
    topology.componentLabels[seedA],
    topology.componentLabels[seedB],
  ]).size;
  const diagnosticsBase = {
    seedVertex: seedA,
    seedVertices: [seedA, seedB] as const,
    skippedComponentCount: Math.max(0, topology.componentCount - seededComponents),
  };

  if (options.mode === 'nearest') {
    const nearest = cachedSurfaceGraphVoronoi(mesh, seedA, seedB);
    const range = finiteRange(nearest.distances);
    return {
      values: nearest.distances,
      min: range.min,
      max: range.max,
      kind: 'intrinsic',
      cacheKey: `intrinsic:geodesic:nearest:${Math.min(seedA, seedB)}:${Math.max(seedA, seedB)}`,
      intrinsicDiagnostics: { ...diagnosticsBase, reachableVertexCount: range.finiteCount },
    };
  }

  const distanceA = cachedSurfaceGraphDistances(mesh, seedA);
  const distanceB = cachedSurfaceGraphDistances(mesh, seedB);
  const differenceValues = new Float64Array(topology.vertexCount);
  differenceValues.fill(Infinity);
  for (let vertex = 0; vertex < topology.vertexCount; vertex++)
    if (Number.isFinite(distanceA[vertex]) && Number.isFinite(distanceB[vertex]))
      differenceValues[vertex] = distanceA[vertex] - distanceB[vertex];
  const differenceRange = finiteRange(differenceValues);
  const maxMagnitude = Math.max(Math.abs(differenceRange.min), Math.abs(differenceRange.max));
  if (options.mode === 'difference') {
    return {
      values: differenceValues,
      min: maxMagnitude ? -maxMagnitude : 0,
      max: maxMagnitude,
      kind: 'intrinsic',
      cacheKey: `intrinsic:geodesic:difference:${seedA}:${seedB}`,
      levelMode: 'symmetric-zero',
      intrinsicDiagnostics: {
        ...diagnosticsBase,
        reachableVertexCount: differenceRange.finiteCount,
        skippedComponentCount:
          differenceRange.finiteCount > 0
            ? diagnosticsBase.skippedComponentCount
            : topology.componentCount,
      },
    };
  }

  const nearest = cachedSurfaceGraphVoronoi(mesh, seedA, seedB);
  const nearestRange = finiteRange(nearest.distances);
  const voronoi: IntrinsicVoronoiData = {
    labels: nearest.labels,
    differenceValues,
    seedVertices: [seedA, seedB],
  };
  return {
    values: nearest.distances,
    min: nearestRange.min,
    max: nearestRange.max,
    kind: 'intrinsic',
    cacheKey: `intrinsic:geodesic:voronoi:${seedA}:${seedB}`,
    levelMode: 'voronoi-boundary',
    voronoi,
    intrinsicDiagnostics: {
      ...diagnosticsBase,
      reachableVertexCount: nearestRange.finiteCount,
    },
  };
}

export function scalarFieldCompatibility(field: MeshScalarField): ScalarFieldCompatibility {
  if (field.kind === 'planar' && field.constantDirection) {
    return {
      gapEasing: true,
      lfo: true,
      divergence: true,
      continuousSpiral: true,
      explosion: 'constant-direction',
    };
  }
  if (field.kind === 'analytic') {
    return {
      gapEasing: true,
      lfo: false,
      divergence: false,
      continuousSpiral: false,
      explosion: field.gradient ? 'local-gradient' : 'none',
    };
  }
  return {
    gapEasing: true,
    lfo: false,
    divergence: false,
    continuousSpiral: false,
    explosion: 'none',
  };
}

export function resolveScalarFieldFeatures(
  field: MeshScalarField,
  request: ScalarFieldFeatureRequest,
): ResolvedScalarFieldFeatures {
  const compatibility = scalarFieldCompatibility(field);
  return {
    lfo: compatibility.lfo && request.lfo,
    divergence: compatibility.divergence ? request.divergence : 0,
    continuousSpiral: compatibility.continuousSpiral && request.continuousSpiral,
    explodeAmount: compatibility.explosion === 'none' ? 0 : request.explodeAmount,
    explosion: compatibility.explosion,
  };
}
