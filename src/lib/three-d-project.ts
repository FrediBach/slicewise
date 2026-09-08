import type { ContourMesh } from './contour-engine';
import type { SliceSelection, PathApproximationSummary } from './slice-treatment';
import type { SolidOperation } from './solid-kernel';

export type WorkspaceMode = 'config' | 'animation' | 'sequencer' | '3d';
export type Triple = [number, number, number];
export interface SourceNormalization {
  center: Triple;
  rawMin: Triple;
  rawMax: Triple;
  radius: number;
}
export interface ThreeDSource {
  id: string;
  version: number;
  name: string;
  mesh: ContourMesh;
  normalization?: SourceNormalization;
  imported: boolean;
  upY: boolean;
}
export interface ThreeDProject {
  version: 1;
  sourceId: string;
  sizeMode: 'longest' | 'mm' | 'cm' | 'in';
  longestMm: number;
  sizeConfirmed: boolean;
  rotation: Triple;
  position: Triple;
  onBed: boolean;
  buildVolumeMm: Triple;
  printerPresetId?: string;
  treatment: SolidOperation;
  radiusMm: number;
  profileToleranceMm: number;
  pathToleranceMm: number;
  resultWeldToleranceMm: number;
  selection: SliceSelection;
  viewDirection: Triple;
}
export interface ThreeDArtifact {
  V: Float32Array;
  T: Uint32Array;
  min: Triple;
  max: Triple;
  dimensions: Triple;
  bedOffset?: number;
}
export interface ThreeDRequest {
  id: number;
  source: ThreeDSource;
  project: ThreeDProject;
  settings: Partial<import('./contour-engine').ContourSettings>;
  purpose?: 'preview' | 'prepare';
}
export interface ThreeDSlices {
  /** Stable field/selection identity, independent of camera and print placement. */
  fieldKey?: string;
  positions: Float32Array;
  selected: Float32Array;
  count: number;
  selectedCount: number;
  runs: number;
  error?: string;
}
export interface ThreeDPreparation {
  status: 'idle' | 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message: string;
  checks?: Record<string, string>;
  issues?: Array<{ code: string; count: number }>;
  advisories?: string[];
  bodyCount?: number;
  volumeMm3?: number;
  approximation?: PathApproximationSummary | null;
  cleanup?: import('./generated-solid-cleanup').SolidCleanup[];
}
export interface ThreeDReply {
  id: number;
  sourceVersion: number;
  progress?: string;
  slices?: ThreeDSlices;
  preparation?: ThreeDPreparation;
  sourceArtifact?: ThreeDArtifact;
  artifact?: ThreeDArtifact;
  error?: string;
}
export interface ThreeDUiState {
  active: boolean;
  source: { id: string; name: string; imported: boolean } | null;
  project: ThreeDProject | null;
  status: 'empty' | 'pending' | 'ready' | 'error';
  message: string;
  artifact: ThreeDArtifact | null;
  sourceArtifact?: ThreeDArtifact | null;
  slices?: ThreeDSlices | null;
  preparation?: ThreeDPreparation;
}
export const initialThreeDState: ThreeDUiState = {
  active: false,
  source: null,
  project: null,
  status: 'empty',
  message: '',
  artifact: null,
};
export function createThreeDProject(sourceId: string): ThreeDProject {
  return {
    version: 1,
    sourceId,
    sizeMode: 'longest',
    longestMm: 100,
    sizeConfirmed: false,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
    onBed: true,
    buildVolumeMm: [220, 220, 250],
    treatment: 'off',
    radiusMm: 0.6,
    profileToleranceMm: 0.05,
    pathToleranceMm: 0,
    resultWeldToleranceMm: 0.00001,
    selection: { mode: 'all' },
    viewDirection: [0, -1, 0],
  };
}
export function meshBounds(V: ArrayLike<number>): { min: Triple; max: Triple } {
  if (!V.length || V.length % 3) throw new Error('The source has no measurable surface.');
  const min: Triple = [Infinity, Infinity, Infinity],
    max: Triple = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i++) {
    if (!Number.isFinite(V[i])) throw new Error('The source contains nonfinite coordinates.');
    const k = i % 3;
    min[k] = Math.min(min[k], V[i]);
    max[k] = Math.max(max[k], V[i]);
  }
  return { min, max };
}
/** Session association only; never used as a validation or export cache key. */
export function sourceIdentity(mesh: ContourMesh, normalization?: SourceNormalization): string {
  let a = 2166136261,
    b = 5381;
  for (const array of [Float32Array.from(mesh.V), Uint32Array.from(mesh.T)]) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (const byte of bytes) {
      a = Math.imul(a ^ byte, 16777619);
      b = Math.imul(b, 33) ^ byte;
    }
  }
  return `${a >>> 0}-${b >>> 0}-${mesh.V.length}-${mesh.T.length}-${JSON.stringify(normalization ?? null)}`;
}
/** Authoritative Z-up millimeter surface. Camera state is deliberately absent. */
export function scaleThreeDSource(
  mesh: ContourMesh,
  source: Pick<ThreeDSource, 'normalization' | 'imported'>,
  project: ThreeDProject,
): { V: Float32Array; T: Uint32Array } {
  if (mesh.lineArt || !mesh.T.length)
    throw new Error('3D requires a mesh surface. Choose a mesh or extruded SVG source.');
  const { min, max } = meshBounds(mesh.V);
  const longest = Math.max(...max.map((v, k) => v - min[k]));
  if (longest <= 0) throw new Error('The source has zero size.');
  if (!Number.isFinite(project.longestMm) || project.longestMm < 0.1 || project.longestMm > 2000)
    throw new Error('Choose a longest dimension between 0.1 and 2000 mm.');
  const units = { mm: 1, cm: 10, in: 25.4 };
  if (
    project.sizeMode !== 'longest' &&
    (!source.imported || !source.normalization || !units[project.sizeMode])
  )
    throw new Error('Raw units are available only for imported mesh coordinates.');
  const scale =
    project.sizeMode === 'longest'
      ? project.longestMm / longest
      : source.normalization!.radius * units[project.sizeMode];
  if (![...project.rotation, ...project.position, scale].every(Number.isFinite) || scale <= 0)
    throw new Error('Physical transforms must be finite.');
  const center = min.map((v, k) => (v + max[k]) / 2);
  const V = Float32Array.from(mesh.V, (v, i) => (v - center[i % 3]) * scale);
  return { V, T: Uint32Array.from(mesh.T) };
}
export function rotateThreeDPoints(points: ArrayLike<number>, rotation: Triple): Float32Array {
  const angles = rotation.map((v) => (v * Math.PI) / 180);
  const V = new Float32Array(points.length);
  for (let i = 0; i < V.length; i += 3) {
    let p = [points[i], points[i + 1], points[i + 2]];
    for (let axis = 0; axis < 3; axis++) {
      const j = (axis + 1) % 3,
        k = (axis + 2) % 3;
      const c = Math.cos(angles[axis]),
        s = Math.sin(angles[axis]);
      const q = p.slice();
      q[j] = c * p[j] - s * p[k];
      q[k] = s * p[j] + c * p[k];
      p = q;
    }
    V.set(p, i);
  }
  return V;
}
export function placeScaledThreeDSource(
  mesh: { V: Float32Array; T: Uint32Array },
  project: ThreeDProject,
): ThreeDArtifact {
  const V = rotateThreeDPoints(mesh.V, project.rotation);
  const rotated = meshBounds(V);
  for (let i = 0; i < V.length; i += 3)
    for (let k = 0; k < 3; k++)
      V[i + k] += project.position[k] - (k === 2 && project.onBed ? rotated.min[2] : 0);
  const placed = meshBounds(V);
  return {
    V,
    T: Uint32Array.from(mesh.T),
    ...placed,
    bedOffset: project.onBed ? -rotated.min[2] : 0,
    dimensions: placed.max.map((v, k) => v - placed.min[k]) as Triple,
  };
}

export function placeThreeDSource(
  mesh: ContourMesh,
  source: Pick<ThreeDSource, 'normalization' | 'imported'>,
  project: ThreeDProject,
): ThreeDArtifact {
  return placeScaledThreeDSource(scaleThreeDSource(mesh, source, project), project);
}
