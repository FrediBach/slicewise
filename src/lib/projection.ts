'use strict';

type NumericArray = ArrayLike<number> & Iterable<number>;
export type Vec2 = [x: number, y: number];
export type Vec3 = [x: number, y: number, z: number];

export interface ProjectionMesh {
  V: NumericArray;
}

export interface CameraBasis {
  f: Vec3;
  r: Vec3;
  u: Vec3;
}

export interface Projection extends CameraBasis {
  sx: Float32Array;
  sy: Float32Array;
  sd: Float32Array;
  dmin: number;
  dmax: number;
  scale: number;
  ox: number;
  oy: number;
  lensFocalLength: number;
  lensPerspective: number;
  lensWarpExponent: number;
  lensDistortion: number;
}

export interface LensSettings {
  lensFocalLength?: number;
  lensDistortion?: number;
  /** Legacy preset fields retained for stored snapshots and callers. */
  lens?: string;
  lensAmount?: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export function cameraBasis(azDeg: number, elDeg: number, rollDeg: number): CameraBasis {
  const az = (azDeg * Math.PI) / 180,
    el = (elDeg * Math.PI) / 180,
    ro = (rollDeg * Math.PI) / 180;
  // Camera sits on the unit sphere and looks at the origin. Z is up.
  const c: Vec3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const f: Vec3 = [-c[0], -c[1], -c[2]];
  // This analytical horizontal axis stays defined at the poles and remains
  // continuous as elevation travels through a full rotation.
  let r: Vec3 = [-Math.sin(az), Math.cos(az), 0];
  let u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  if (ro) {
    const cr = Math.cos(ro),
      sr = Math.sin(ro);
    const r2: Vec3 = [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr];
    const u2: Vec3 = [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr];
    r = r2;
    u = u2;
  }
  return { f, r, u };
}

const LEGACY_LENS_CURVE: Readonly<Record<string, number>> = {
  clean: 0,
  wide: -0.18,
  fisheye: -0.4,
  tele: 0.16,
};

export function resolveLens(settings: LensSettings): [focalLength: number, distortion: number] {
  const focalLength = clamp(settings.lensFocalLength ?? 50, 8, 300);
  if (Number.isFinite(settings.lensDistortion))
    return [focalLength, clamp(settings.lensDistortion!, -100, 100)];
  const legacyCurve = LEGACY_LENS_CURVE[settings.lens || 'clean'] || 0;
  return [focalLength, clamp((legacyCurve * (settings.lensAmount ?? 100)) / 0.4, -100, 100)];
}

export function distortLens(x: number, y: number, distortion: number): Vec2 {
  const curve = clamp(distortion, -100, 100) * 0.004;
  if (!curve) return [x, y];
  const radius2 = x * x + y * y;
  // Keeping distortion in camera space makes it independent of sheet size,
  // margin, and output scale. The rational barrel curve stays monotonic.
  const factor = curve < 0 ? 1 / (1 - curve * radius2) : 1 + curve * radius2;
  return [x * factor, y * factor];
}

export function warpKleinPoincare(x: number, y: number, exponentPercent: number): Vec2 {
  const exponent = clamp(exponentPercent / 100, 0, 1);
  if (!exponent) return [x, y];
  const radius = Math.hypot(x, y);
  if (radius < 1e-12) return [x, y];

  // For a point k in the Klein unit disk, the corresponding Poincare radius
  // is p = k / (1 + sqrt(1 - k^2)). Geometric interpolation preserves both
  // exact endpoints while making the control a continuous exponent.
  const kleinRadius = Math.min(radius, 1 - 1e-9);
  const poincareRadius = kleinRadius / (1 + Math.sqrt(1 - kleinRadius * kleinRadius));
  const warpedRadius = radius * Math.pow(poincareRadius / radius, exponent);
  const factor = warpedRadius / radius;
  return [x * factor, y * factor];
}

export function projectCameraPoint(
  x: number,
  y: number,
  depth: number,
  scale: number,
  ox: number,
  oy: number,
  focalLength: number,
  perspectiveAmount: number,
  warpExponent: number,
  distortion: number,
): Vec2 {
  // The normalized mesh has radius 1. This maps a full-frame-style focal
  // length to a camera distance that always remains outside the model.
  const cameraDistance = 1.25 + focalLength / 24;
  const physicalPerspective = cameraDistance / (cameraDistance - depth);
  const perspective = 1 + (physicalPerspective - 1) * clamp(perspectiveAmount / 100, 0, 1);
  const hyperbolic = warpKleinPoincare(x * perspective, y * perspective, warpExponent);
  const warped = distortLens(hyperbolic[0], hyperbolic[1], distortion);
  return [ox + warped[0] * scale, oy - warped[1] * scale];
}

export function projectMesh(
  mesh: ProjectionMesh,
  cam: CameraBasis,
  W: number,
  H: number,
  margin: number,
  zoom: number,
  panX: number,
  panY: number,
  lensFocalLength: number,
  lensPerspective: number,
  lensWarpExponent: number,
  lensDistortion: number,
): Projection {
  const { V } = mesh;
  const n = V.length / 3;
  const sx = new Float32Array(n),
    sy = new Float32Array(n),
    sd = new Float32Array(n);
  const { f, r, u } = cam;
  const scale = (Math.min(W, H) / 2 - margin) * zoom;
  const ox = W / 2 + (panX ?? 0),
    oy = H / 2 + (panY ?? 0);
  let dmin = Infinity,
    dmax = -Infinity;
  for (let i = 0, vertex = 0; i < V.length; i += 3, vertex++) {
    const x = V[i],
      y = V[i + 1],
      z = V[i + 2];
    const depth = x * f[0] + y * f[1] + z * f[2];
    const screen = projectCameraPoint(
      x * r[0] + y * r[1] + z * r[2],
      x * u[0] + y * u[1] + z * u[2],
      depth,
      scale,
      ox,
      oy,
      lensFocalLength,
      lensPerspective,
      lensWarpExponent,
      lensDistortion,
    );
    sx[vertex] = screen[0];
    sy[vertex] = screen[1];
    sd[vertex] = depth;
    if (depth < dmin) dmin = depth;
    if (depth > dmax) dmax = depth;
  }
  return {
    sx,
    sy,
    sd,
    dmin,
    dmax,
    scale,
    ox,
    oy,
    f,
    r,
    u,
    lensFocalLength,
    lensPerspective,
    lensWarpExponent,
    lensDistortion,
  };
}

export function projectWorldPoints(points: NumericArray, projection: Projection): number[] {
  const projected: number[] = [];
  const {
    r,
    u,
    f,
    scale,
    ox,
    oy,
    lensFocalLength,
    lensPerspective,
    lensWarpExponent,
    lensDistortion,
  } = projection;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i],
      y = points[i + 1],
      z = points[i + 2];
    const depth = x * f[0] + y * f[1] + z * f[2];
    const screen = projectCameraPoint(
      x * r[0] + y * r[1] + z * r[2],
      x * u[0] + y * u[1] + z * u[2],
      depth,
      scale,
      ox,
      oy,
      lensFocalLength,
      lensPerspective,
      lensWarpExponent,
      lensDistortion,
    );
    projected.push(screen[0], screen[1], depth);
  }
  return projected;
}
