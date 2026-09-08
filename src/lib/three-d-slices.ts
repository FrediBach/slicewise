import type { ContourSettings } from './contour-engine';
import { extractPlanarSlices, type PlanarSliceField } from './slice-geometry';
import { selectSliceIndices } from './slice-treatment';
import { easeLineGap } from './slice-spacing';
import {
  rotateThreeDPoints,
  type ThreeDProject,
  type ThreeDArtifact,
  type ThreeDSlices,
  type Triple,
} from './three-d-project';
import type { SolidMesh } from './solid-kernel';

export function threeDSliceField(
  mesh: SolidMesh,
  settings: Partial<ContourSettings>,
  project: ThreeDProject,
): PlanarSliceField {
  if (!['up', 'x', 'y', 'custom', 'cam'].includes(settings.axis ?? 'up'))
    throw new Error(
      '3D preview supports Height, Model width/depth, Custom plane and fixed View depth. Choose a supported slice field.',
    );
  if (settings.divergence || settings.sliceLfo || settings.spiral || settings.contourWeave)
    throw new Error(
      'Turn off Divergence, slice-plane LFO, Continuous spiral and Contour Weave in Config before preparing parallel slices.',
    );
  let normal: Triple =
    settings.axis === 'cam'
      ? [...project.viewDirection]
      : settings.axis === 'x'
        ? [1, 0, 0]
        : settings.axis === 'y'
          ? [0, 1, 0]
          : [0, 0, 1];
  if (settings.axis === 'custom') {
    const az = ((settings.cutAz ?? 0) * Math.PI) / 180,
      el = ((settings.cutEl ?? 90) * Math.PI) / 180;
    normal = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  }
  const length = Math.hypot(...normal);
  if (!Number.isFinite(length) || length < 1e-9)
    throw new Error('Invalid fixed cutting direction.');
  normal = normal.map((v) => v / length) as Triple;
  const count = Math.round(settings.lines ?? 40);
  if (count < 1 || count > 200) throw new Error('Choose 1–200 design slices.');
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < mesh.V.length; i += 3) {
    const v = mesh.V[i] * normal[0] + mesh.V[i + 1] * normal[1] + mesh.V[i + 2] * normal[2];
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  if (!(max > min)) throw new Error('The source has no extent along this cutting direction.');
  const levels = Array.from(
    { length: count },
    (_, i) =>
      min +
      (max - min) *
        easeLineGap(
          (i + 0.5) / count,
          settings.gapEase ?? 'linear',
          settings.easeStrength ?? 100,
          settings.easeCenter ?? 50,
          settings.easeCycles ?? 1,
        ),
  );
  return { kind: 'planar', normal, levels };
}
export function threeDSliceOverlay(
  geometry: ReturnType<typeof extractPlanarSlices>,
  project: ThreeDProject,
  artifact: ThreeDArtifact,
): ThreeDSlices {
  const selected = new Set(selectSliceIndices(geometry.slices.length, project.selection));
  const all: number[] = [],
    chosen: number[] = [];
  let runs = 0;
  for (const slice of geometry.slices) {
    runs += slice.closed.length;
    for (const point of slice.segments) {
      const p = Array.from(slice.points.subarray(point * 3, point * 3 + 3));
      all.push(...p);
      if (selected.has(slice.index)) chosen.push(...p);
    }
  }
  const place = (points: number[]) => {
    const V = rotateThreeDPoints(points, project.rotation);
    for (let i = 0; i < V.length; i++)
      V[i] += project.position[i % 3] + (i % 3 === 2 ? (artifact.bedOffset ?? 0) : 0);
    return V;
  };
  return {
    positions: place(all),
    selected: place(chosen),
    count: geometry.slices.length,
    selectedCount: selected.size,
    runs,
  };
}
