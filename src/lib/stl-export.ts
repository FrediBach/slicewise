import type { SolidMesh } from './solid-kernel';

/** Binary STL in millimeter coordinates; no rescaling, welding or triangle reordering. */
export function serializeBinaryStl({ V, T }: SolidMesh): ArrayBuffer {
  const count = T.length / 3;
  if (!V.length || V.length % 3 || !Number.isInteger(count) || count < 1 || count > 500_000)
    throw new Error('STL requires 1–500,000 complete triangles.');
  if (!V.every(Number.isFinite) || T.some((i) => i >= V.length / 3))
    throw new Error('Invalid STL coordinates or indices.');
  const buffer = new ArrayBuffer(84 + count * 50);
  new Uint8Array(buffer, 0, 80).set(
    new TextEncoder().encode('Slicewise binary STL - coordinates in millimeters'),
  );
  const data = new DataView(buffer);
  data.setUint32(80, count, true);
  for (let f = 0; f < count; f++) {
    const a = T[f * 3] * 3,
      b = T[f * 3 + 1] * 3,
      c = T[f * 3 + 2] * 3;
    const ux = V[b] - V[a],
      uy = V[b + 1] - V[a + 1],
      uz = V[b + 2] - V[a + 2];
    const vx = V[c] - V[a],
      vy = V[c + 1] - V[a + 1],
      vz = V[c + 2] - V[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...n);
    if (!Number.isFinite(length) || length === 0) throw new Error('Degenerate STL triangle.');
    let offset = 84 + f * 50;
    for (const value of [
      ...n.map((v) => v / length),
      ...V.subarray(a, a + 3),
      ...V.subarray(b, b + 3),
      ...V.subarray(c, c + 3),
    ]) {
      data.setFloat32(offset, value, true);
      offset += 4;
    }
    data.setUint16(offset, 0, true);
  }
  return buffer;
}
