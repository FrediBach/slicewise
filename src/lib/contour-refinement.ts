type Vec3 = [number, number, number];

const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * Refine sparsely sampled bends before projection, visibility, and corner detection.
 * Tangents are the cross product of the slicing-plane direction and surface normal.
 * Appends to owned points, retaining shared endpoint indexes and closed topology.
 */
export function refineContourSegments(
  pts: number[],
  segs: number[],
  tangents: number[],
  strength: number,
  tolerance: number,
): number[] {
  if (!(strength > 0) || !(tolerance > 0) || !Number.isFinite(tolerance)) return segs;
  const curvedSegments: number[] = [];
  // Dense spans already serialize smoothly. Only reconstruct bends over ten
  // degrees; refining every triangle would inflate both cached geometry and SVGs.
  const bendCosine = Math.cos(Math.PI / 18);
  for (let i = 0; i < segs.length; i += 2) {
    const start = segs[i],
      end = segs[i + 1];
    const dx = pts[end * 3] - pts[start * 3];
    const dy = pts[end * 3 + 1] - pts[start * 3 + 1];
    const dz = pts[end * 3 + 2] - pts[start * 3 + 2];
    const length = Math.hypot(dx, dy, dz);
    const tangent = (id: number): Vec3 => {
      const tx = tangents[id * 3],
        ty = tangents[id * 3 + 1],
        tz = tangents[id * 3 + 2];
      const magnitude = Math.hypot(tx, ty, tz);
      const along = tx * dx + ty * dy + tz * dz;
      // Degenerate or nearly perpendicular tangents have no reliable direction.
      const factor =
        magnitude > 1e-8 && Math.abs(along) > magnitude * length * 0.05
          ? (Math.sign(along) * length) / magnitude
          : 0;
      return factor ? [tx * factor, ty * factor, tz * factor] : [dx, dy, dz];
    };
    const t0 = tangent(start),
      t1 = tangent(end);
    const minimumAlong = bendCosine * length * length;
    if (
      t0[0] * dx + t0[1] * dy + t0[2] * dz >= minimumAlong &&
      t1[0] * dx + t1[1] * dy + t1[2] * dz >= minimumAlong
    ) {
      curvedSegments.push(start, end);
      continue;
    }
    const p0: Vec3 = [pts[start * 3], pts[start * 3 + 1], pts[start * 3 + 2]];
    const p3: Vec3 = [pts[end * 3], pts[end * 3 + 1], pts[end * 3 + 2]];
    const control = (origin: Vec3, tangent: Vec3, sign: number): Vec3 => [
      origin[0] + (sign * (dx + (tangent[0] - dx) * strength)) / 3,
      origin[1] + (sign * (dy + (tangent[1] - dy) * strength)) / 3,
      origin[2] + (sign * (dz + (tangent[2] - dz) * strength)) / 3,
    ];
    let previous = start;
    const subdivide = (
      c0: Vec3,
      c1: Vec3,
      c2: Vec3,
      c3: Vec3,
      depth: number,
      last: boolean,
    ): void => {
      // Compare both controls with a linear cubic. This bounds chord error and
      // catches S bends that a midpoint-only flatness check would miss.
      const error = (p: Vec3, fraction: number): number =>
        Math.hypot(
          p[0] - (c0[0] + (c3[0] - c0[0]) * fraction),
          p[1] - (c0[1] + (c3[1] - c0[1]) * fraction),
          p[2] - (c0[2] + (c3[2] - c0[2]) * fraction),
        );
      if (depth >= 6 || Math.max(error(c1, 1 / 3), error(c2, 2 / 3)) <= tolerance) {
        const next = last ? end : pts.length / 3;
        if (!last) pts.push(...c3);
        curvedSegments.push(previous, next);
        previous = next;
        return;
      }
      const a = mid(c0, c1),
        b = mid(c1, c2),
        c = mid(c2, c3);
      const d = mid(a, b),
        e = mid(b, c),
        f = mid(d, e);
      subdivide(c0, a, d, f, depth + 1, false);
      subdivide(f, e, c, c3, depth + 1, last);
    };
    subdivide(p0, control(p0, t0, 1), control(p3, t1, -1), p3, 0, true);
  }
  return curvedSegments;
}
