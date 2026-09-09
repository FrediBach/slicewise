import type { ContourMesh } from './contour-engine';
import { GEN_DEFAULTS, generateMesh, type GenerativeParams } from './generativeMesh';
import {
  TERRAIN_CONTROLS,
  TERRAIN_DEFAULTS,
  generateTerrain,
  type TerrainParams,
} from './generative-terrain';
import { vertexNormals, weld } from './mesh';

export interface ProceduralSettings extends Partial<GenerativeParams>, Partial<TerrainParams> {
  proceduralSource?: 'generative' | 'terrain';
  proceduralUpY?: boolean;
}

export const proceduralSettingKeys = [
  'proceduralSource',
  'proceduralUpY',
  ...(Object.keys(GEN_DEFAULTS) as (keyof GenerativeParams)[]),
  ...(Object.keys(TERRAIN_DEFAULTS) as (keyof TerrainParams)[]),
] as const;

export const GENERATIVE_CONTROLS = [
  { id: 'genSeed', min: 0, max: 9999 },
  { id: 'genBlend', min: 0, max: 100 },
  { id: 'genFreq', min: 0.5, max: 8 },
  { id: 'genAniso', min: -100, max: 100 },
  { id: 'genIso', min: -1.4, max: 1.4 },
  { id: 'genTwist', min: -180, max: 180 },
  { id: 'genNoise', min: 0, max: 100 },
  { id: 'genRes', min: 32, max: 192 },
] as const;

export function normalizeProceduralSettings(
  settings: ProceduralSettings,
): GenerativeParams & TerrainParams {
  const result = { ...GEN_DEFAULTS, ...TERRAIN_DEFAULTS };
  if (typeof settings.genField === 'string') result.genField = settings.genField;
  for (const control of [...GENERATIVE_CONTROLS, ...TERRAIN_CONTROLS]) {
    const { id, min, max } = control;
    const value = settings[id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const integer = id.endsWith('Seed') || id.endsWith('Res');
    result[id] = Math.max(min, Math.min(max, integer ? Math.round(value) : value));
  }
  return result;
}

export function proceduralSourceKey(settings: ProceduralSettings): string | undefined {
  const source = settings.proceduralSource;
  if (!source) return undefined;
  const normalized = normalizeProceduralSettings(settings);
  const defaults = source === 'terrain' ? TERRAIN_DEFAULTS : GEN_DEFAULTS;
  return JSON.stringify([
    source,
    Boolean(settings.proceduralUpY),
    ...Object.entries(defaults).map(
      ([key, fallback]) => normalized[key as keyof typeof normalized] ?? fallback,
    ),
  ]);
}

const cache = new WeakMap<ContourMesh, Map<string, ContourMesh>>();
const MAX_BYTES = 64 * 1024 * 1024;

/** Resolve each instance before deformation, retaining bounded immutable mesh identities. */
export function resolveProceduralMesh(
  mesh: ContourMesh,
  settings: ProceduralSettings,
): ContourMesh {
  const key = proceduralSourceKey(settings);
  if (!key || key === mesh.proceduralKey) return mesh;
  let variants = cache.get(mesh);
  if (!variants) {
    variants = new Map();
    cache.set(mesh, variants);
  }
  const cached = variants.get(key);
  if (cached) {
    variants.delete(key);
    variants.set(key, cached);
    return cached;
  }
  const params = normalizeProceduralSettings(settings);
  const generated =
    settings.proceduralSource === 'terrain' ? generateTerrain(params) : generateMesh(params);
  const result = weld({ verts: generated.positions, tris: generated.indices });
  if (settings.proceduralUpY) {
    for (let i = 0; i < result.V.length; i += 3) {
      const y = result.V[i + 1];
      result.V[i + 1] = -result.V[i + 2];
      result.V[i + 2] = y;
    }
  }
  const resolved: ContourMesh = {
    ...result,
    N: vertexNormals(result.V, result.T),
    terrain: settings.proceduralSource === 'terrain' && !settings.proceduralUpY,
    proceduralKey: key,
  };
  const bytes = (value: ContourMesh) =>
    (value.V.length + value.T.length + (value.N?.length ?? 0)) * 4;
  if (bytes(resolved) <= MAX_BYTES) {
    variants.set(key, resolved);
    while (
      variants.size > 3 ||
      [...variants.values()].reduce((sum, value) => sum + bytes(value), 0) > MAX_BYTES
    )
      variants.delete(variants.keys().next().value!);
  }
  return resolved;
}
