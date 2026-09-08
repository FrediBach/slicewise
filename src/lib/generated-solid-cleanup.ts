import type { SolidMesh } from './solid-kernel';

export type SolidCleanup = {
  stage: string;
  mergedVertices: number;
  removedFaces: number;
  removedUnusedVertices: number;
};

/** Generated buffers only: exact coordinate equivalence and strictly zero-area
 * faces. No tolerance welding, displacement, winding changes or hole filling.
 * The caller must fully audit the returned mesh, even if no changes were needed.
 */
export function cleanGeneratedSolid(mesh: SolidMesh, stage: string) {
  const { V, T } = mesh;
  if (V.length % 3 || T.length % 3 || !V.every(Number.isFinite) || T.some((i) => i >= V.length / 3))
    throw new Error('Invalid generated solid buffers.');
  const coordinates: number[] = [];
  const canonical = new Map<string, number>();
  const remap = new Uint32Array(V.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const key = `${V[i * 3]},${V[i * 3 + 1]},${V[i * 3 + 2]}`;
    let index = canonical.get(key);
    if (index === undefined) {
      index = coordinates.length / 3;
      canonical.set(key, index);
      coordinates.push(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]);
    }
    remap[i] = index;
  }
  const faces: number[] = [];
  const used = new Set<number>();
  for (let i = 0; i < T.length; i += 3) {
    const ids = [remap[T[i]], remap[T[i + 1]], remap[T[i + 2]]];
    const [a, b, c] = ids.map((id) => id * 3);
    const ux = coordinates[b] - coordinates[a],
      uy = coordinates[b + 1] - coordinates[a + 1],
      uz = coordinates[b + 2] - coordinates[a + 2];
    const vx = coordinates[c] - coordinates[a],
      vy = coordinates[c + 1] - coordinates[a + 1],
      vz = coordinates[c + 2] - coordinates[a + 2];
    if (uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0) continue;
    faces.push(...ids);
    ids.forEach((id) => used.add(id));
  }
  const report: SolidCleanup = {
    stage,
    mergedVertices: remap.length - coordinates.length / 3,
    removedFaces: (T.length - faces.length) / 3,
    removedUnusedVertices: coordinates.length / 3 - used.size,
  };
  if (!report.mergedVertices && !report.removedFaces && !report.removedUnusedVertices)
    return { mesh, report };
  const compact = new Uint32Array(coordinates.length / 3);
  const vertices = new Float32Array(used.size * 3);
  let next = 0;
  for (let i = 0; i < compact.length; i++)
    if (used.has(i)) {
      compact[i] = next;
      vertices.set(coordinates.slice(i * 3, i * 3 + 3), next++ * 3);
    }
  return { mesh: { V: vertices, T: Uint32Array.from(faces, (i) => compact[i]) }, report };
}
