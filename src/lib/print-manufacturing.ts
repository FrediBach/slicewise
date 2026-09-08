import {
  samplePrintThickness,
  validateThicknessSettings,
  type PrintThicknessSettings,
  type PrintThicknessReport,
} from './print-thickness';
import { auditPrintTopology, type PrintTopologyReport } from './print-validation';
import type { TopologyMesh } from './mesh-topology';

type Vec = [number, number, number];
export type PrintManufacturingSettings = {
  /** Axis-aligned build region in the artifact's existing Z-up millimeter frame.
   * The bottom (min[2]) is the bed plane. No automatic placement or rotation. */
  buildVolume: { min: Vec; max: Vec };
  bedToleranceMm: number;
  /** Maximum downward surface tilt from vertical: 0 = vertical, 90 = underside. */
  overhangFromVerticalDeg: number;
  /** Optional finite normal-chord sampling; never a global wall-thickness proof. */
  thickness?: PrintThicknessSettings;
};
export const PRINT_MANUFACTURING_SAMPLES = 32;
export type PrintManufacturingAdvisory =
  | 'outside-build-volume'
  | 'below-bed'
  | 'no-near-bed-area'
  | 'multiple-bodies'
  | 'overhangs'
  | 'thin-samples'
  | 'thickness-unresolved';
export type PrintManufacturingReport = {
  /** Screened does not mean print-ready; thickness is sampled and stability is not checked. */
  status: 'screened' | 'unavailable';
  unavailableReason: 'geometry-rejected' | 'measurement-range' | null;
  settings: PrintManufacturingSettings;
  geometry: PrintTopologyReport;
  thickness: 'not-run' | PrintThicknessReport;
  stability: 'not-run';
  advisories: PrintManufacturingAdvisory[];
  measurements: {
    bounds: { min: Vec; max: Vec; sizeMm: Vec };
    bodyCount: number;
    fitsBuildVolume: boolean;
    belowBedMm: number;
    lowestPointAboveBedMm: number;
    /** Sum of projected downward face areas in the bed tolerance band. Not a
     * union footprint, adhesion estimate or proof that every body is supported. */
    nearBedProjectedAreaMm2: number;
    overhangAreaMm2: number;
    overhangTriangleCount: number;
    /** Original triangle IDs, bounded independently of the complete count. */
    overhangTriangles: Uint32Array;
  } | null;
};

const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** Clip a convex face to a horizontal half-space, preserving its orientation. */
function clipAtZ(polygon: Vec[], z: number, above: boolean): Vec[] {
  const clipped: Vec[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const aInside = above ? a[2] >= z : a[2] <= z;
    const bInside = above ? b[2] >= z : b[2] <= z;
    if (aInside) clipped.push(a);
    if (aInside !== bInside) {
      const t = (z - a[2]) / (b[2] - a[2]);
      clipped.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), z]);
    }
  }
  return clipped;
}
function polygonArea(polygon: Vec[], projected: boolean) {
  let area = 0;
  for (let i = 1; i + 1 < polygon.length; i++) {
    const normal = cross(sub(polygon[i], polygon[0]), sub(polygon[i + 1], polygon[0]));
    area += (projected ? Math.abs(normal[2]) : Math.hypot(...normal)) / 2;
  }
  return area;
}

/** Initial read-only manufacturing screen. Always audits the current buffers,
 * rather than trusting a report that could belong to an older mesh revision.
 * Geometry errors make measurements unavailable; manufacturing advisories do
 * not reject otherwise accepted geometry. All triangles are visited, with work
 * bounded by the geometry auditor's input limits. Optional thickness rays have
 * their own sample/work budgets and can leave unresolved regions.
 */
export function auditPrintManufacturing(
  mesh: TopologyMesh,
  settings: PrintManufacturingSettings,
): PrintManufacturingReport {
  const { min, max } = settings.buildVolume;
  if (
    min.length !== 3 ||
    max.length !== 3 ||
    ![...min, ...max].every(Number.isFinite) ||
    !min.every((v, i) => max[i] > v && Number.isFinite(max[i] - v))
  )
    throw new Error('Build volume must have finite, increasing XYZ bounds in millimeters.');
  if (
    !Number.isFinite(settings.bedToleranceMm) ||
    settings.bedToleranceMm < 0 ||
    settings.bedToleranceMm > 1
  )
    throw new Error('Bed tolerance must be between 0 and 1 mm.');
  if (
    !Number.isFinite(settings.overhangFromVerticalDeg) ||
    settings.overhangFromVerticalDeg < 0 ||
    settings.overhangFromVerticalDeg > 90
  )
    throw new Error('Overhang threshold must be between 0 and 90 degrees from vertical.');
  if (settings.thickness) validateThicknessSettings(settings.thickness, mesh.T.length / 3);
  const detachedSettings: PrintManufacturingSettings = {
    buildVolume: { min: [...min], max: [...max] },
    bedToleranceMm: settings.bedToleranceMm,
    overhangFromVerticalDeg: settings.overhangFromVerticalDeg,
    ...(settings.thickness
      ? {
          thickness: {
            ...settings.thickness,
            priorityTriangles: [...(settings.thickness.priorityTriangles ?? [])],
          },
        }
      : {}),
  };
  const geometry = auditPrintTopology(mesh);
  const report: PrintManufacturingReport = {
    status: 'unavailable',
    unavailableReason: 'geometry-rejected',
    settings: detachedSettings,
    geometry,
    thickness: 'not-run',
    stability: 'not-run',
    advisories: [],
    measurements: null,
  };
  if (geometry.status === 'invalid' || geometry.shellContainment?.bodyCount == null) return report;
  const boundsMin: Vec = [Infinity, Infinity, Infinity],
    boundsMax: Vec = [-Infinity, -Infinity, -Infinity];
  const { V, T } = mesh;
  const bed = min[2],
    bandBottom = bed - settings.bedToleranceMm,
    bandTop = bed + settings.bedToleranceMm;
  const threshold = Math.sin((settings.overhangFromVerticalDeg * Math.PI) / 180);
  const overhangTriangles: number[] = [];
  let nearBedProjectedAreaMm2 = 0,
    overhangAreaMm2 = 0,
    overhangTriangleCount = 0;
  for (let f = 0; f < T.length / 3; f++) {
    const face = [0, 1, 2].map((corner): Vec => {
      const offset = T[f * 3 + corner] * 3;
      const p: Vec = [V[offset], V[offset + 1], V[offset + 2]];
      for (let axis = 0; axis < 3; axis++) {
        boundsMin[axis] = Math.min(boundsMin[axis], p[axis]);
        boundsMax[axis] = Math.max(boundsMax[axis], p[axis]);
      }
      return p;
    });
    const normal = cross(sub(face[1], face[0]), sub(face[2], face[0]));
    if (normal[2] >= 0) continue;
    const contact = clipAtZ(clipAtZ(face, bandBottom, true), bandTop, false);
    nearBedProjectedAreaMm2 += polygonArea(contact, true);
    if (-normal[2] / Math.hypot(...normal) <= threshold + 64 * Number.EPSILON) continue;
    // The band is counted as supported; faces wholly on its upper boundary do
    // not also become overhangs. Below-bed geometry has a separate advisory.
    if (face.every((p) => p[2] <= bandTop)) continue;
    const area = polygonArea(clipAtZ(face, bandTop, true), false);
    if (area <= 0) continue;
    overhangAreaMm2 += area;
    overhangTriangleCount++;
    if (overhangTriangles.length < PRINT_MANUFACTURING_SAMPLES) overhangTriangles.push(f);
  }
  if (
    ![nearBedProjectedAreaMm2, overhangAreaMm2, ...boundsMax.map((v, i) => v - boundsMin[i])].every(
      Number.isFinite,
    )
  ) {
    report.unavailableReason = 'measurement-range';
    return report;
  }
  const fitsBuildVolume = boundsMin.every((v, i) => v >= min[i] && boundsMax[i] <= max[i]);
  const belowBedMm = Math.max(0, bed - boundsMin[2]);
  const bodyCount = geometry.shellContainment.bodyCount;
  if (!fitsBuildVolume) report.advisories.push('outside-build-volume');
  if (belowBedMm > settings.bedToleranceMm) report.advisories.push('below-bed');
  if (nearBedProjectedAreaMm2 === 0) report.advisories.push('no-near-bed-area');
  if (bodyCount > 1) report.advisories.push('multiple-bodies');
  if (overhangTriangleCount) report.advisories.push('overhangs');
  if (settings.thickness) {
    report.thickness = samplePrintThickness(
      mesh,
      settings.thickness,
      geometry.intersections!.toleranceMm,
    );
    if (report.thickness.belowMinimumCount) report.advisories.push('thin-samples');
    if (report.thickness.status !== 'sampled') report.advisories.push('thickness-unresolved');
  }
  report.status = 'screened';
  report.unavailableReason = null;
  report.measurements = {
    bounds: {
      min: boundsMin,
      max: boundsMax,
      sizeMm: boundsMax.map((v, i) => v - boundsMin[i]) as Vec,
    },
    bodyCount,
    fitsBuildVolume,
    belowBedMm,
    lowestPointAboveBedMm: Math.max(0, boundsMin[2] - bed),
    nearBedProjectedAreaMm2,
    overhangAreaMm2,
    overhangTriangleCount,
    overhangTriangles: Uint32Array.from(overhangTriangles),
  };
  return report;
}
