import { deformMesh } from './mesh-deformation';
import { resolveObjectSettings } from './object-settings';
import { extractPlanarSlices, type PlanarSliceField } from './slice-geometry';
import { scaleThreeDSource, type ThreeDRequest } from './three-d-project';
import type { SolidMesh } from './solid-kernel';

type Geometry = ReturnType<typeof extractPlanarSlices>;
const equal = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const geometryBytes = (geometry: Geometry) =>
  geometry.slices.reduce(
    (total, slice) =>
      total +
      Object.values(slice).reduce<number>(
        (bytes, value) => bytes + (ArrayBuffer.isView(value) ? value.byteLength : 0),
        0,
      ),
    0,
  );

/** One physical base and one exact slice set; no native handles or validation results. */
export class ThreeDGeometryCache {
  #base: { key: string; rawV: Float64Array; rawT: Float64Array; mesh: SolidMesh } | null = null;
  #slices: { key: string; geometry: Geometry } | null = null;
  #baseBytes = 0;
  #sliceBytes = 0;
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {}

  get retainedBytes() {
    return this.#baseBytes + this.#sliceBytes;
  }

  base(request: ThreeDRequest): SolidMesh {
    const { source, project, settings } = request;
    const key = JSON.stringify([
      source.id,
      source.version,
      source.imported,
      source.normalization,
      !!source.mesh.lineArt,
      resolveObjectSettings(settings),
      project.sizeMode,
      project.longestMm,
    ]);
    if (
      this.#base?.key === key &&
      equal(this.#base.rawV, source.mesh.V) &&
      equal(this.#base.rawT, source.mesh.T)
    )
      return this.#base.mesh;
    this.#base = null;
    this.#slices = null;
    this.#baseBytes = this.#sliceBytes = 0;
    const mesh = scaleThreeDSource(deformMesh(source.mesh, settings), source, project);
    const bytes =
      (source.mesh.V.length + source.mesh.T.length) * 8 + mesh.V.byteLength + mesh.T.byteLength;
    if (bytes <= this.maxBytes) {
      this.#base = {
        key,
        rawV: Float64Array.from(source.mesh.V),
        rawT: Float64Array.from(source.mesh.T),
        mesh,
      };
      this.#baseBytes = bytes;
    }
    return mesh;
  }

  slices(mesh: SolidMesh, field: PlanarSliceField, revision: number): Geometry {
    const key = JSON.stringify([field, revision]);
    if (this.#base?.mesh === mesh && this.#slices?.key === key) return this.#slices.geometry;
    this.#slices = null;
    this.#sliceBytes = 0;
    const geometry = extractPlanarSlices(mesh, field, revision);
    const bytes = geometryBytes(geometry);
    if (this.#base?.mesh === mesh && this.#baseBytes + bytes <= this.maxBytes) {
      this.#slices = { key, geometry };
      this.#sliceBytes = bytes;
    }
    return geometry;
  }
}
