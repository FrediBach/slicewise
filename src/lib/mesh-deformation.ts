import type { ContourMesh } from './contour-engine';
import { vertexNormals } from './mesh';
import {
  objectHasTransform,
  resolveObjectSettings,
  type ObjectAxis,
  type ObjectSettings,
} from './object-settings';

type Point = [number, number, number];
type Surface = { V: Float32Array; T: Uint32Array };
const radians = Math.PI / 180;
const axisIndex = (axis: ObjectAxis): number => (axis === 'x' ? 0 : axis === 'y' ? 1 : 2);
const refinedSources = new WeakMap<ContourMesh, Surface>();
const variants = new WeakMap<ContourMesh, Map<string, ContourMesh>>();
const MAX_REFINED_TRIANGLES = 250_000;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;

function bounds(V: ArrayLike<number>): { min: Point; span: Point } {
  const min: Point = [Infinity, Infinity, Infinity];
  const max: Point = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], V[i + k]);
      max[k] = Math.max(max[k], V[i + k]);
    }
  return { min, span: max.map((v, k) => v - min[k]) as Point };
}

/** Split shared edges once. Green triangles keep neighbouring faces conforming. */
function refineSource(mesh: ContourMesh): Surface {
  const cached = refinedSources.get(mesh);
  if (cached) return cached;
  const { span } = bounds(mesh.V);
  const V = Array.from(mesh.V);
  let T = Array.from(mesh.T);
  const budget = Math.max(MAX_REFINED_TRIANGLES, T.length / 3);
  const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let pass = 0; pass < 8; pass++) {
    const splits = new Map<string, number>();
    const inspect = (a: number, b: number): void => {
      const key = edgeKey(a, b);
      if (splits.has(key)) return;
      let length2 = 0;
      for (let k = 0; k < 3; k++) {
        const d = span[k] > 1e-9 ? (V[a * 3 + k] - V[b * 3 + k]) / span[k] : 0;
        length2 += d * d;
      }
      if (length2 <= 1 / (16 * 16)) return;
      splits.set(key, V.length / 3);
      for (let k = 0; k < 3; k++) V.push((V[a * 3 + k] + V[b * 3 + k]) / 2);
    };
    for (let i = 0; i < T.length; i += 3) {
      inspect(T[i], T[i + 1]);
      inspect(T[i + 1], T[i + 2]);
      inspect(T[i + 2], T[i]);
    }
    if (!splits.size) {
      const result = { V: Float32Array.from(V), T: Uint32Array.from(T) };
      // Large meshes still render, but do not retain a second large source copy.
      if (result.V.byteLength + result.T.byteLength <= MAX_CACHE_BYTES / 2)
        refinedSources.set(mesh, result);
      return result;
    }
    const next: number[] = [];
    const triangle = (a: number, b: number, c: number): void => {
      if (next.length / 3 >= budget)
        throw new Error(
          'Object deformation needs too many triangles. Simplify the source mesh or disable twist, taper and bend.',
        );
      next.push(a, b, c);
    };
    for (let i = 0; i < T.length; i += 3) {
      const a = T[i],
        b = T[i + 1],
        c = T[i + 2];
      const ab = splits.get(edgeKey(a, b)),
        bc = splits.get(edgeKey(b, c)),
        ca = splits.get(edgeKey(c, a));
      if (ab !== undefined && bc !== undefined && ca !== undefined) {
        triangle(a, ab, ca);
        triangle(ab, b, bc);
        triangle(ca, bc, c);
        triangle(ab, bc, ca);
      } else if (ab !== undefined && bc !== undefined) {
        triangle(ab, b, bc);
        triangle(a, ab, c);
        triangle(ab, bc, c);
      } else if (bc !== undefined && ca !== undefined) {
        triangle(bc, c, ca);
        triangle(b, bc, a);
        triangle(bc, ca, a);
      } else if (ca !== undefined && ab !== undefined) {
        triangle(ca, a, ab);
        triangle(c, ca, b);
        triangle(ca, ab, b);
      } else if (ab !== undefined) {
        triangle(a, ab, c);
        triangle(ab, b, c);
      } else if (bc !== undefined) {
        triangle(b, bc, a);
        triangle(bc, c, a);
      } else if (ca !== undefined) {
        triangle(c, ca, b);
        triangle(ca, a, b);
      } else triangle(a, b, c);
    }
    T = next;
  }
  throw new Error('Object deformation refinement limit reached. Simplify the source mesh.');
}

function rotate(V: Float32Array, axis: number, angle: number): void {
  if (!angle) return;
  const u = (axis + 1) % 3,
    v = (axis + 2) % 3;
  const c = Math.cos(angle * radians),
    s = Math.sin(angle * radians);
  for (let i = 0; i < V.length; i += 3) {
    const x = V[i + u],
      y = V[i + v];
    V[i + u] = c * x - s * y;
    V[i + v] = s * x + c * y;
  }
}

/** Immutable, camera-independent geometry, evaluated separately for each morph instance. */
export function deformMesh(mesh: ContourMesh, settings: Partial<ObjectSettings>): ContourMesh {
  if (mesh.lineArt || !mesh.V.length || !mesh.T.length || !objectHasTransform(settings))
    return mesh;
  const s = resolveObjectSettings(settings);
  // Ignore retained values of disabled/neutral stages, including inactive morph targets.
  const key = JSON.stringify([
    s.objectStretch ? [s.objectScaleX, s.objectScaleY, s.objectScaleZ] : [100, 100, 100],
    s.objectTaper && s.objectTaperAmount ? [s.objectTaperAxis, s.objectTaperAmount] : null,
    s.objectTwist && s.objectTwistAngle ? [s.objectTwistAxis, s.objectTwistAngle] : null,
    s.objectBend && s.objectBendAngle
      ? [s.objectBendAxis, s.objectBendAngle, s.objectBendDirection]
      : null,
    s.objectRotation ? [s.objectRotationX, s.objectRotationY, s.objectRotationZ] : [0, 0, 0],
  ]);
  let cache = variants.get(mesh);
  const cached = cache?.get(key);
  if (cached) {
    cache!.delete(key);
    cache!.set(key, cached);
    return cached;
  }
  const nonlinear = Boolean(
    (s.objectTaper && s.objectTaperAmount) ||
    (s.objectTwist && s.objectTwistAngle) ||
    (s.objectBend && s.objectBendAngle),
  );
  const source = nonlinear ? refineSource(mesh) : mesh;
  const V = Float32Array.from(source.V);
  const T = source.T instanceof Uint32Array ? source.T : Uint32Array.from(source.T);
  const scale = s.objectStretch
    ? [s.objectScaleX / 100, s.objectScaleY / 100, s.objectScaleZ / 100]
    : [1, 1, 1];
  for (let i = 0; i < V.length; i++) V[i] *= scale[i % 3];

  if (s.objectTaper && s.objectTaperAmount) {
    const axis = axisIndex(s.objectTaperAxis),
      { min, span } = bounds(V);
    if (span[axis] > 1e-9)
      for (let i = 0; i < V.length; i += 3) {
        const t = (2 * (V[i + axis] - min[axis])) / span[axis] - 1;
        const factor = 1 - (s.objectTaperAmount / 100) * t;
        V[i + ((axis + 1) % 3)] *= factor;
        V[i + ((axis + 2) % 3)] *= factor;
      }
  }
  if (s.objectTwist && s.objectTwistAngle) {
    const axis = axisIndex(s.objectTwistAxis),
      u = (axis + 1) % 3,
      v = (axis + 2) % 3;
    const { min, span } = bounds(V);
    if (span[axis] > 1e-9)
      for (let i = 0; i < V.length; i += 3) {
        const angle = ((V[i + axis] - min[axis]) / span[axis] - 0.5) * s.objectTwistAngle * radians;
        const c = Math.cos(angle),
          sn = Math.sin(angle),
          x = V[i + u],
          y = V[i + v];
        V[i + u] = c * x - sn * y;
        V[i + v] = sn * x + c * y;
      }
  }
  if (s.objectBend && s.objectBendAngle) {
    const axis = axisIndex(s.objectBendAxis),
      u = (axis + 1) % 3,
      v = (axis + 2) % 3;
    const { min, span } = bounds(V);
    const c = Math.cos(s.objectBendDirection * radians),
      sn = Math.sin(s.objectBendDirection * radians);
    if (span[axis] > 1e-9) {
      const curvature = (s.objectBendAngle * radians) / span[axis];
      const centre = min[axis] + span[axis] / 2;
      for (let i = 0; i < V.length; i += 3) {
        const along = V[i + axis] - centre;
        const across = V[i + u] * c + V[i + v] * sn;
        const side = -V[i + u] * sn + V[i + v] * c;
        const angle = along * curvature;
        // Stable at zero, even if a tiny animated angle underflows during conversion.
        const sinc = Math.abs(angle) < 1e-8 ? 1 - (angle * angle) / 6 : Math.sin(angle) / angle;
        const sag = angle === 0 ? 0 : ((2 * Math.sin(angle / 2) ** 2) / angle) * along;
        const bentAcross = Math.cos(angle) * across + sag;
        V[i + axis] = centre + along * sinc - across * Math.sin(angle);
        V[i + u] = bentAcross * c - side * sn;
        V[i + v] = bentAcross * sn + side * c;
      }
    }
  }
  const N = !nonlinear && mesh.N ? Float32Array.from(mesh.N) : undefined;
  if (N) {
    for (let i = 0; i < N.length; i += 3) {
      const x = N[i] / scale[0],
        y = N[i + 1] / scale[1],
        z = N[i + 2] / scale[2];
      const length = Math.hypot(x, y, z) || 1;
      N[i] = x / length;
      N[i + 1] = y / length;
      N[i + 2] = z / length;
    }
  }
  if (s.objectRotation) {
    for (const [axis, angle] of [
      s.objectRotationX,
      s.objectRotationY,
      s.objectRotationZ,
    ].entries()) {
      rotate(V, axis, angle);
      if (N) rotate(N, axis, angle);
    }
  }
  const result: ContourMesh = { ...mesh, V, T, N: N ?? vertexNormals(V, T), terrain: false };
  const bytes = (m: ContourMesh): number => (m.V.length + m.T.length + (m.N?.length ?? 0)) * 4;
  if (bytes(result) <= MAX_CACHE_BYTES) {
    if (!cache) {
      cache = new Map();
      variants.set(mesh, cache);
    }
    cache.set(key, result);
    let size = Array.from(cache.values()).reduce((sum, m) => sum + bytes(m), 0);
    while (cache.size > 3 || size > MAX_CACHE_BYTES) {
      const oldest = cache.keys().next().value!;
      size -= bytes(cache.get(oldest)!);
      cache.delete(oldest);
    }
  }
  return result;
}
