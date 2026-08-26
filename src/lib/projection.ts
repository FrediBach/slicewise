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

export type ProjectionPointStatus = 'valid' | 'clipped-at-domain' | 'invalid';

export interface ProjectedPointResult {
  status: ProjectionPointStatus;
  /** Sheet X, sheet Y, and unchanged camera depth. */
  point: Vec3;
}

export interface AdaptiveProjectionOptions {
  /** Maximum projected chord error in sheet units. */
  tolerance: number;
  maxDepth?: number;
  maxNodes?: number;
  /** Optional paired geometry, such as exploded contour points. */
  outputPoints?: NumericArray;
}

export interface AdaptiveProjectedRun {
  /** Coordinates used for visibility: sheet X, sheet Y, camera depth. */
  points: number[];
  /** Coordinates emitted to SVG/G-code, sampled at identical parameters. */
  outputPoints: number[];
}

export interface AdaptiveProjectionResult {
  runs: AdaptiveProjectedRun[];
  clippedAtDomain: boolean;
  invalidSamples: number;
  truncated: boolean;
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
  const result = projectCameraPointResult(
    x,
    y,
    depth,
    scale,
    ox,
    oy,
    focalLength,
    perspectiveAmount,
    warpExponent,
    distortion,
  );
  return [result.point[0], result.point[1]];
}

export function projectCameraPointResult(
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
): ProjectedPointResult {
  if (
    ![x, y, depth, scale, ox, oy, focalLength, perspectiveAmount, warpExponent, distortion].every(
      Number.isFinite,
    )
  )
    return { status: 'invalid', point: [NaN, NaN, depth] };
  // The normalized mesh has radius 1. This maps a full-frame-style focal
  // length to a camera distance that always remains outside the model.
  const cameraDistance = 1.25 + focalLength / 24;
  const perspectiveStrength = clamp(perspectiveAmount / 100, 0, 1);
  const denominator = cameraDistance - depth;
  if (perspectiveStrength > 0 && denominator <= 1e-12)
    return { status: 'invalid', point: [NaN, NaN, depth] };
  const physicalPerspective = perspectiveStrength ? cameraDistance / denominator : 1;
  const perspective = 1 + (physicalPerspective - 1) * perspectiveStrength;
  const perspectiveX = x * perspective,
    perspectiveY = y * perspective;
  const clippedAtDomain = warpExponent > 0 && Math.hypot(perspectiveX, perspectiveY) >= 1;
  const hyperbolic = warpKleinPoincare(perspectiveX, perspectiveY, warpExponent);
  const warped = distortLens(hyperbolic[0], hyperbolic[1], distortion);
  const point: Vec3 = [ox + warped[0] * scale, oy - warped[1] * scale, depth];
  return {
    status: point.every(Number.isFinite)
      ? clippedAtDomain
        ? 'clipped-at-domain'
        : 'valid'
      : 'invalid',
    point,
  };
}

export function projectWorldPoint(
  x: number,
  y: number,
  z: number,
  projection: Projection,
): ProjectedPointResult {
  const { r, u, f } = projection;
  const depth = x * f[0] + y * f[1] + z * f[2];
  return projectCameraPointResult(
    x * r[0] + y * r[1] + z * r[2],
    x * u[0] + y * u[1] + z * u[2],
    depth,
    projection.scale,
    projection.ox,
    projection.oy,
    projection.lensFocalLength,
    projection.lensPerspective,
    projection.lensWarpExponent,
    projection.lensDistortion,
  );
}

const pointToChordDistance = (point: Vec3, start: Vec3, end: Vec3): number => {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-18) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2, 0, 1);
  return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dy * t));
};

interface AdaptiveSample {
  world: Vec3;
  outputWorld: Vec3;
  projected: ProjectedPointResult;
  outputProjected: ProjectedPointResult;
}

/**
 * Projects an indexed world-space polyline and inserts samples wherever a
 * nonlinear projection bends farther from its sheet-space chord than allowed.
 * Invalid samples split runs; domain-clamped samples remain drawable and are
 * reported to the caller. Work is bounded by both recursion depth and nodes.
 */
export function projectPolylineAdaptive(
  points: NumericArray,
  polyline: NumericArray,
  projection: Projection,
  options: AdaptiveProjectionOptions,
): AdaptiveProjectionResult {
  const tolerance = Math.max(1e-6, Number(options.tolerance) || 1e-6);
  const maxDepth = Math.round(clamp(options.maxDepth ?? 8, 0, 12));
  const maxNodes = Math.max(2, Math.round(clamp(options.maxNodes ?? 8192, 2, 65536)));
  const outputPoints = options.outputPoints ?? points;
  let clippedAtDomain = false,
    invalidSamples = 0,
    truncated = false;

  const sample = (world: Vec3, outputWorld: Vec3): AdaptiveSample => {
    const projected = projectWorldPoint(world[0], world[1], world[2], projection);
    const outputProjected =
      world[0] === outputWorld[0] && world[1] === outputWorld[1] && world[2] === outputWorld[2]
        ? projected
        : projectWorldPoint(outputWorld[0], outputWorld[1], outputWorld[2], projection);
    if (projected.status === 'clipped-at-domain' || outputProjected.status === 'clipped-at-domain')
      clippedAtDomain = true;
    if (projected.status === 'invalid' || outputProjected.status === 'invalid') invalidSamples++;
    return { world, outputWorld, projected, outputProjected };
  };
  const pointAt = (source: NumericArray, index: number): Vec3 => {
    const offset = index * 3;
    return [source[offset], source[offset + 1], source[offset + 2]];
  };
  const midpoint = (a: Vec3, b: Vec3): Vec3 => [
    (a[0] + b[0]) * 0.5,
    (a[1] + b[1]) * 0.5,
    (a[2] + b[2]) * 0.5,
  ];
  const samples: AdaptiveSample[] = [];
  const appendSegment = (a: AdaptiveSample, b: AdaptiveSample, depth: number): void => {
    if (samples.length >= maxNodes - 1) {
      truncated = true;
      return;
    }
    const middle = sample(midpoint(a.world, b.world), midpoint(a.outputWorld, b.outputWorld));
    const invalid =
      a.projected.status === 'invalid' ||
      b.projected.status === 'invalid' ||
      middle.projected.status === 'invalid' ||
      a.outputProjected.status === 'invalid' ||
      b.outputProjected.status === 'invalid' ||
      middle.outputProjected.status === 'invalid';
    const error = invalid
      ? Infinity
      : Math.max(
          pointToChordDistance(middle.projected.point, a.projected.point, b.projected.point),
          pointToChordDistance(
            middle.outputProjected.point,
            a.outputProjected.point,
            b.outputProjected.point,
          ),
        );
    if (depth < maxDepth && samples.length < maxNodes - 1 && (invalid || error > tolerance)) {
      appendSegment(a, middle, depth + 1);
      appendSegment(middle, b, depth + 1);
      return;
    }
    if ((invalid || error > tolerance) && depth >= maxDepth) truncated = true;
    samples.push(b);
  };

  if (polyline.length >= 2) {
    const firstIndex = polyline[0];
    let previous = sample(pointAt(points, firstIndex), pointAt(outputPoints, firstIndex));
    samples.push(previous);
    for (let index = 1; index < polyline.length; index++) {
      const vertex = polyline[index];
      const next = sample(pointAt(points, vertex), pointAt(outputPoints, vertex));
      appendSegment(previous, next, 0);
      previous = next;
      if (samples.length >= maxNodes - 1 && index + 1 < polyline.length) {
        truncated = true;
        break;
      }
    }
  }

  const runs: AdaptiveProjectedRun[] = [];
  let run: AdaptiveProjectedRun | null = null;
  for (const current of samples) {
    if (current.projected.status === 'invalid' || current.outputProjected.status === 'invalid') {
      if (run && run.points.length >= 6) runs.push(run);
      run = null;
      continue;
    }
    if (!run) run = { points: [], outputPoints: [] };
    run.points.push(...current.projected.point);
    run.outputPoints.push(...current.outputProjected.point);
  }
  if (run && run.points.length >= 6) runs.push(run);
  return { runs, clippedAtDomain, invalidSamples, truncated };
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
