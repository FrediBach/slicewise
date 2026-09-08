type Vec = [number, number, number];
type ExactVec = [bigint, bigint, bigint];
const cross = (a: ExactVec, b: ExactVec): ExactVec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: ExactVec, b: ExactVec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const zero = (a: ExactVec) => a.every((v) => v === 0n);

/** Exact dyadic coordinates of finite IEEE doubles, on one common integer grid.
 * Used only for adjacent candidates the floating-point audit would reject.
 */
function exactPoints(points: Vec[]): ExactVec[] {
  const buffer = new ArrayBuffer(8),
    view = new DataView(buffer);
  const parts = points.flat().map((value) => {
    view.setFloat64(0, value);
    const bits = view.getBigUint64(0),
      exponent = Number((bits >> 52n) & 2047n);
    const fraction = bits & ((1n << 52n) - 1n);
    if (exponent === 2047) throw new Error('Exact overlap requires finite coordinates.');
    const mantissa = (exponent ? (1n << 52n) | fraction : fraction) * (bits >> 63n ? -1n : 1n);
    return { mantissa, exponent: exponent ? exponent - 1075 : -1074 };
  });
  let minimum = 0;
  for (const part of parts) if (part.mantissa !== 0n) minimum = Math.min(minimum, part.exponent);
  const values = parts.map((p) =>
    p.mantissa === 0n ? 0n : p.mantissa << BigInt(p.exponent - minimum),
  );
  return points.map((_, i) => values.slice(i * 3, i * 3 + 3) as ExactVec);
}

/** Shared IDs must be first and in the same order. Tests actual overlap beyond
 * that shared simplex, not proximity. All signs are exact for supplied numbers.
 */
export function exactAdjacentOverlap(a: Vec[], b: Vec[], shared: number): boolean {
  if (shared === 3) return true;
  const p = exactPoints([...a, ...b]);
  const subtract = (x: ExactVec): ExactVec => x.map((v, i) => v - p[0][i]) as ExactVec;
  const ar = [subtract(p[1]), subtract(p[2])],
    br = [subtract(p[4]), subtract(p[5])];
  const an = cross(ar[0], ar[1]),
    bn = cross(br[0], br[1]);
  if (zero(an) || zero(bn)) return true;
  if (shared === 2) return dot(br[1], an) === 0n && dot(an, bn) >= 0n;
  const inCone = (ray: ExactVec, rays: ExactVec[], normal: ExactVec) =>
    dot(cross(rays[0], ray), normal) >= 0n && dot(cross(ray, rays[1]), normal) >= 0n;
  const line = cross(an, bn);
  if (!zero(line)) {
    const reverse = line.map((v) => -v) as ExactVec;
    return (
      (inCone(line, ar, an) && inCone(line, br, bn)) ||
      (inCone(reverse, ar, an) && inCone(reverse, br, bn))
    );
  }
  return ar.some((ray) => inCone(ray, br, bn)) || br.some((ray) => inCone(ray, ar, an));
}
