import type { SolidMesh } from './solid-kernel';
import { assertPrintTopology } from './print-validation';

type Vec = [number, number, number];
const sub = (a: Vec, b: Vec): Vec => a.map((v, i) => v - b[i]) as Vec;
const dot = (a: Vec, b: Vec) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vec): Vec => {
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-9)
    throw new Error('Planar sweep has a degenerate direction.');
  return v.map((x) => x / length) as Vec;
};
export const PLANAR_SWEEP_LIMITS = { triangles: 250_000, miterMultiplier: 2 } as const;

/** Experimental circular tube with miter joins, not a capsule union. The ring
 * offsets intersect neighboring edge-offset lines in the declared plane. This
 * keeps straight segment cross-sections circular but extends sharp corners by
 * the reported miter multiplier. Self contacts, folded quads and quantization
 * defects must pass the same exact-buffer solid audit as other tools.
 */
export function createPlanarSweep(
  points: Float64Array,
  planeNormal: Vec,
  radiusMm: number,
  circularSegments = 16,
) {
  const count = points.length / 3;
  if (!Number.isInteger(count) || count < 3 || !points.every(Number.isFinite))
    throw new Error('Invalid planar sweep path.');
  if (!Number.isFinite(radiusMm) || radiusMm <= 0 || radiusMm > 10)
    throw new Error('Invalid planar sweep radius.');
  if (
    !Number.isInteger(circularSegments) ||
    circularSegments < 8 ||
    circularSegments > 128 ||
    circularSegments % 4
  )
    throw new Error('Invalid planar sweep tessellation.');
  if (count * circularSegments * 2 > PLANAR_SWEEP_LIMITS.triangles)
    throw new Error('Planar sweep triangle budget exceeded.');
  const normal = unit(planeNormal);
  const point = (i: number): Vec => [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
  const origin = point(0);
  const outward: Vec[] = [];
  for (let i = 0; i < count; i++) {
    if (Math.abs(dot(sub(point(i), origin), normal)) > 1e-7)
      throw new Error('Planar sweep path is not in the declared plane.');
    outward.push(unit(cross(unit(sub(point((i + 1) % count), point(i))), normal)));
  }
  const V = new Float32Array(count * circularSegments * 3);
  const T = new Uint32Array(count * circularSegments * 6);
  let maximumMiterMultiplier = 1;
  for (let i = 0; i < count; i++) {
    const previous = outward[(i + count - 1) % count],
      next = outward[i];
    const denominator = 1 + dot(previous, next);
    if (denominator <= 1e-12) throw new Error('Planar sweep has a reversing corner.');
    const miter = previous.map((v, axis) => (v + next[axis]) / denominator) as Vec;
    const multiplier = Math.hypot(...miter);
    if (multiplier > PLANAR_SWEEP_LIMITS.miterMultiplier)
      throw new Error('Planar sweep corner exceeds the miter limit.');
    maximumMiterMultiplier = Math.max(maximumMiterMultiplier, multiplier);
    const p = point(i);
    for (let k = 0; k < circularSegments; k++) {
      const angle = (k * 2 * Math.PI) / circularSegments;
      const vertex = i * circularSegments + k;
      for (let axis = 0; axis < 3; axis++)
        V[vertex * 3 + axis] =
          p[axis] + radiusMm * (miter[axis] * Math.cos(angle) + normal[axis] * Math.sin(angle));
      const a = vertex,
        b = ((i + 1) % count) * circularSegments + k;
      const c = ((i + 1) % count) * circularSegments + ((k + 1) % circularSegments),
        d = i * circularSegments + ((k + 1) % circularSegments);
      T.set([a, b, c, a, c, d], vertex * 6);
    }
  }
  const mesh: SolidMesh = { V, T };
  const topology = assertPrintTopology(mesh, 'Planar miter sweep');
  if (topology.shellContainment?.bodyCount !== 1 || topology.shellContainment.shells.length !== 1)
    throw new Error('Planar sweep requires one boundary shell.');
  return {
    mesh,
    topology,
    join: 'miter' as const,
    maximumMiterMultiplier,
    /** Polygon sagitta on a straight segment; corner offsets are separately reported. */
    straightProfileDeviationMm: radiusMm * (1 - Math.cos(Math.PI / circularSegments)),
  };
}
