'use strict';

import { clipRunToRect } from './toolpaths';
import { createMapAnnotations } from './mapAnnotations';
import { previewCurveQuality, previewLineCount, previewMorphSteps } from './preview-detail';
import {
  clipRunToGenerativeMask,
  generativeMaskPath,
  generativeMaskRun,
  type GenerativeMaskSettings,
} from './generative-mask';

type NumericArray = ArrayLike<number> & Iterable<number>;
type Vec2 = [x: number, y: number];
type Vec3 = [x: number, y: number, z: number];
type Polyline = number[];
type VisibilityTest = (x: number, y: number, depth: number) => boolean;
type MorphValue = number | string;
type MorphTargets = Record<string, MorphValue>;

export interface ContourMesh {
  V: NumericArray;
  T: NumericArray;
  N?: NumericArray;
  lineArt?: { offsets: NumericArray };
}

export interface GradientStop {
  position: number;
  color: string;
}

export interface ContourSettings extends GenerativeMaskSettings {
  az: number;
  el: number;
  roll: number;
  zoom: number;
  panX: number;
  panY: number;
  lensFocalLength?: number;
  lensDistortion?: number;
  /** Legacy preset fields retained for stored snapshots and callers. */
  lens?: string;
  lensAmount?: number;
  lines: number;
  gapEase: string;
  easeStrength: number;
  easeCycles: number;
  easeCenter: number;
  quality: number;
  axis: string;
  cutAz: number;
  cutEl: number;
  divergence: number;
  sliceLfo: boolean;
  sliceLfoAmplitude: number;
  sliceLfoCycles: number;
  sliceLfoAngle: number;
  sliceLfoPhase: number;
  sliceLfoWaveform: string;
  sliceLfoModulation: boolean;
  sliceLfoModulationMode: string;
  sliceLfoModulationDepth: number;
  sliceLfoModulationCycles: number;
  sliceLfoModulationPhase: number;
  spiral: boolean;
  hide: boolean;
  sil: boolean;
  sw: number;
  lineWeightMode: string;
  lineWeightInterval: number;
  lineWeightAmount: number;
  color: string;
  backgroundColor: string;
  gradientEnabled: boolean;
  gradientColors: number;
  gradientStops: readonly GradientStop[];
  pw: number;
  ph: number;
  margin: number;
  clipToArtboard: boolean;
  bg: boolean;
  halftone: boolean;
  halftoneSize: number;
  halftoneContrast: number;
  halftoneCycles: number;
  chroma: boolean;
  chromaAmount: number;
  humanizer: boolean;
  humanizerAmount: number;
  yarnCurl: boolean;
  yarnCutPercent: number;
  yarnCurlSize: number;
  blueprint: boolean;
  blueprintStyle: string;
  topographicMap: boolean;
  documentTitle: string;
  morphEnabled: boolean;
  morphSteps: number;
  morphTargets: MorphTargets;
  morphSecondEnabled: boolean;
  morphStepsY: number;
  morphTargets2: MorphTargets;
  previewDetail?: number;
  suppressBackground?: boolean;
}

export interface ContourToolpathGroup {
  color: string;
  label: string;
  runs: Polyline[];
}

export interface ContourResult {
  svg: string;
  toolpaths: ContourToolpathGroup[];
  paths: number;
  nodes: number;
  bytes: number;
  ms: number;
  W: number;
  H: number;
  quick: boolean;
}

interface CameraBasis {
  f: Vec3;
  r: Vec3;
  u: Vec3;
}

interface Projection extends CameraBasis {
  sx: Float32Array;
  sy: Float32Array;
  sd: Float32Array;
  dmin: number;
  dmax: number;
  scale: number;
  ox: number;
  oy: number;
  lensFocalLength: number;
  lensDistortion: number;
}

interface ScalarField {
  S: NumericArray;
  min: number;
  max: number;
  dir: Vec3;
}

interface PointSegments {
  pts: number[];
  segs: number[];
}

interface CachedSlice {
  position: number;
  worldPoints: number[];
  polylines: number[][];
}

interface SpiralSegments extends PointSegments {
  values: number[];
}

interface DepthBuffer {
  buf: Float32Array;
  rw: number;
  rh: number;
  k: number;
}

interface BandChunk {
  band: number;
  pts: number[];
}

interface SerialisedGroup {
  d: string;
  runs: Polyline[];
}

interface BlueprintDocument {
  backdrop: string;
  overlay: string;
}

/* ---------------------------------------------------------------- utils */
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
};
const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
const escapeXml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);

function applyLineGapEase(t: number, easing: string, center: number): number {
  const left = t / center,
    right = (t - center) / (1 - center);
  switch (easing) {
    case 'sine-in':
      return 1 - Math.cos((t * Math.PI) / 2);
    case 'sine-out':
      return Math.sin((t * Math.PI) / 2);
    case 'sine-in-out':
      return t < center
        ? center * (1 - Math.cos((left * Math.PI) / 2))
        : center + (1 - center) * Math.sin((right * Math.PI) / 2);
    case 'sine-out-in':
      return t < center
        ? center * Math.sin((left * Math.PI) / 2)
        : center + (1 - center) * (1 - Math.cos((right * Math.PI) / 2));
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < center
        ? center * left * left
        : center + (1 - center) * (1 - Math.pow(1 - right, 2));
    case 'ease-out-in':
      return t < center
        ? center * (1 - Math.pow(1 - left, 2))
        : center + (1 - center) * right * right;
    case 'cubic-in':
      return t * t * t;
    case 'cubic-out':
      return 1 - Math.pow(1 - t, 3);
    case 'cubic-in-out':
      return t < center
        ? center * left * left * left
        : center + (1 - center) * (1 - Math.pow(1 - right, 3));
    case 'cubic-out-in':
      return t < center
        ? center * (1 - Math.pow(1 - left, 3))
        : center + (1 - center) * right * right * right;
    default:
      return t;
  }
}

function easeLineGap(t: number, easing: string, strength = 100, center = 50, cycles = 1): number {
  const cycleCount = clamp(Math.round(cycles), 1, 12);
  const scaled = t * cycleCount;
  const cycle = Math.min(cycleCount - 1, Math.floor(scaled));
  const local = scaled - cycle;
  const applications = clamp(strength / 100, 0, 3);
  const pivot = clamp(center / 100, 0.05, 0.95);
  const whole = Math.floor(applications),
    mix = applications - whole;
  let eased = local;
  for (let i = 0; i < whole; i++) eased = applyLineGapEase(eased, easing, pivot);
  if (mix) {
    const next = applyLineGapEase(eased, easing, pivot);
    eased += (next - eased) * mix;
  }
  return (cycle + eased) / cycleCount;
}

/* --------------------------------------------------------- projection */
function cameraBasis(azDeg: number, elDeg: number, rollDeg: number): CameraBasis {
  const az = (azDeg * Math.PI) / 180,
    el = (elDeg * Math.PI) / 180,
    ro = (rollDeg * Math.PI) / 180;
  // camera sits on the unit sphere, looks at the origin. Z is up.
  const c: Vec3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const f: Vec3 = [-c[0], -c[1], -c[2]]; // view direction
  // An analytical horizontal axis stays defined at the poles and remains
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

function resolveLens(settings: ContourSettings): [focalLength: number, distortion: number] {
  const focalLength = clamp(settings.lensFocalLength ?? 50, 8, 300);
  if (Number.isFinite(settings.lensDistortion))
    return [focalLength, clamp(settings.lensDistortion!, -100, 100)];
  const legacyCurve = LEGACY_LENS_CURVE[settings.lens || 'clean'] || 0;
  return [focalLength, clamp((legacyCurve * (settings.lensAmount ?? 100)) / 0.4, -100, 100)];
}

function distortLens(x: number, y: number, distortion: number): Vec2 {
  const curve = clamp(distortion, -100, 100) * 0.004;
  if (!curve) return [x, y];
  const radius2 = x * x + y * y;
  // Radial optical distortion around the image centre. Keeping this in camera
  // space makes the effect independent of sheet size, margin, and output scale.
  // The rational barrel curve stays smooth and monotonic at the 200% maximum.
  const factor = curve < 0 ? 1 / (1 - curve * radius2) : 1 + curve * radius2;
  return [x * factor, y * factor];
}

function projectCameraPoint(
  x: number,
  y: number,
  depth: number,
  scale: number,
  ox: number,
  oy: number,
  focalLength: number,
  distortion: number,
): Vec2 {
  // The normalized mesh has radius 1. This maps a full-frame-style focal
  // length to a camera distance that always remains outside the model.
  const cameraDistance = 1.25 + focalLength / 24;
  const perspective = cameraDistance / (cameraDistance - depth);
  const warped = distortLens(x * perspective, y * perspective, distortion);
  return [ox + warped[0] * scale, oy - warped[1] * scale];
}

/* ------------------------------------------------- marching triangles */
function sliceLevelWorld(
  mesh: ContourMesh,
  S: NumericArray,
  level: number,
  NV: number,
  scalarDir: Vec3,
  curveStrength: number,
  scalarAtPoint?: (x: number, y: number, z: number) => number,
  rootIterations = 12,
  adaptiveDepth = 0,
): PointSegments {
  // returns {pts:[x,y,d,...], segs:[i,j,...]} for one cutting plane
  const { T, V, N } = mesh;
  const idx = new Map<number, number>(); // edge key -> point index
  const pts: number[] = [],
    segs: number[] = [];
  const getPoint = (a: number, b: number): number => {
    const key = a < b ? a * NV + b : b * NV + a;
    let id = idx.get(key);
    if (id !== undefined) return id;
    let t = (level - S[a]) / (S[b] - S[a]);
    id = pts.length / 3;
    const ai = a * 3,
      bi = b * 3;
    const ax = V[ai],
      ay = V[ai + 1],
      az = V[ai + 2];
    const bx = V[bi],
      by = V[bi + 1],
      bz = V[bi + 2];
    const ex = bx - ax,
      ey = by - ay,
      ez = bz - az;
    if (!scalarAtPoint && (!curveStrength || !N)) {
      pts.push(ax + ex * t, ay + ey * t, az + ez * t);
      idx.set(key, id);
      return id;
    }

    const da = N ? ex * N[ai] + ey * N[ai + 1] + ez * N[ai + 2] : 0;
    const db = N ? ex * N[bi] + ey * N[bi + 1] + ez * N[bi + 2] : 0;
    const tax = N ? ex - N[ai] * da : ex,
      tay = N ? ey - N[ai + 1] * da : ey,
      taz = N ? ez - N[ai + 2] * da : ez;
    const tbx = N ? ex - N[bi] * db : ex,
      tby = N ? ey - N[bi + 1] * db : ey,
      tbz = N ? ez - N[bi + 2] * db : ez;
    const sample = (q: number): Vec3 => {
      if (!curveStrength || !N) return [ax + ex * q, ay + ey * q, az + ez * q];
      const q2 = q * q,
        q3 = q2 * q;
      const h00 = 2 * q3 - 3 * q2 + 1,
        h10 = q3 - 2 * q2 + q;
      const h01 = -2 * q3 + 3 * q2,
        h11 = q3 - q2;
      const lx = ax + ex * q,
        ly = ay + ey * q,
        lz = az + ez * q;
      const hx = h00 * ax + h10 * tax + h01 * bx + h11 * tbx;
      const hy = h00 * ay + h10 * tay + h01 * by + h11 * tby;
      const hz = h00 * az + h10 * taz + h01 * bz + h11 * tbz;
      return [
        lx + (hx - lx) * curveStrength,
        ly + (hy - ly) * curveStrength,
        lz + (hz - lz) * curveStrength,
      ];
    };
    let lo = 0,
      hi = 1;
    const startAbove = S[a] > level;
    for (let k = 0; k < rootIterations; k++) {
      t = (lo + hi) * 0.5;
      const p = sample(t);
      const value = scalarAtPoint
        ? scalarAtPoint(p[0], p[1], p[2])
        : p[0] * scalarDir[0] + p[1] * scalarDir[1] + p[2] * scalarDir[2];
      if (value > level === startAbove) lo = t;
      else hi = t;
    }
    const p = sample((lo + hi) * 0.5);
    pts.push(p[0], p[1], p[2]);
    idx.set(key, id);
    return id;
  };

  if (scalarAtPoint && adaptiveDepth > 0) {
    type FieldPoint = [x: number, y: number, z: number, value: number];
    const adaptivePoints = new Map<string, number>();
    const midpoint = (a: FieldPoint, b: FieldPoint): FieldPoint => {
      const x = (a[0] + b[0]) * 0.5,
        y = (a[1] + b[1]) * 0.5,
        z = (a[2] + b[2]) * 0.5;
      return [x, y, z, scalarAtPoint(x, y, z) - level];
    };
    const centroid = (a: FieldPoint, b: FieldPoint, c: FieldPoint): FieldPoint => {
      const x = (a[0] + b[0] + c[0]) / 3,
        y = (a[1] + b[1] + c[1]) / 3,
        z = (a[2] + b[2] + c[2]) / 3;
      return [x, y, z, scalarAtPoint(x, y, z) - level];
    };
    const addPoint = (point: Vec3): number => {
      // Adjacent source triangles refine shared edges independently. A stable
      // coordinate key welds their numerically equivalent roots back together.
      const scale = 1e7;
      const key = `${Math.round(point[0] * scale)},${Math.round(point[1] * scale)},${Math.round(point[2] * scale)}`;
      const existing = adaptivePoints.get(key);
      if (existing !== undefined) return existing;
      const id = pts.length / 3;
      pts.push(point[0], point[1], point[2]);
      adaptivePoints.set(key, id);
      return id;
    };
    const intersect = (a: FieldPoint, b: FieldPoint): number => {
      if (Math.abs(a[3]) < 1e-12) return addPoint([a[0], a[1], a[2]]);
      if (Math.abs(b[3]) < 1e-12) return addPoint([b[0], b[1], b[2]]);
      let lo = a,
        hi = b;
      const loPositive = lo[3] > 0;
      for (let iteration = 0; iteration < rootIterations; iteration++) {
        const mid = midpoint(lo, hi);
        if (mid[3] > 0 === loPositive) lo = mid;
        else hi = mid;
      }
      return addPoint([(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5]);
    };
    const march = (a: FieldPoint, b: FieldPoint, c: FieldPoint): void => {
      const pa = a[3] > 0,
        pb = b[3] > 0,
        pc = c[3] > 0;
      if (pa === pb && pb === pc) return;
      let e1: number, e2: number;
      if (pa === pb) {
        e1 = intersect(a, c);
        e2 = intersect(b, c);
      } else if (pb === pc) {
        e1 = intersect(b, a);
        e2 = intersect(c, a);
      } else {
        e1 = intersect(a, b);
        e2 = intersect(c, b);
      }
      if (e1 !== e2) segs.push(e1, e2);
    };
    const refine = (a: FieldPoint, b: FieldPoint, c: FieldPoint, depth: number): void => {
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a),
        center = centroid(a, b, c);
      const samples = [a[3], b[3], c[3], ab[3], bc[3], ca[3], center[3]];
      let minimum = Infinity,
        maximum = -Infinity;
      for (const value of samples) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      if (minimum > 0 || maximum < 0) return;
      if (depth >= adaptiveDepth) {
        // The interior sample catches small loops and near-tangent crossings
        // that vertex-only marching would otherwise replace with a long chord.
        march(a, ab, center);
        march(ab, b, center);
        march(b, bc, center);
        march(bc, c, center);
        march(c, ca, center);
        march(ca, a, center);
        return;
      }
      refine(a, ab, ca, depth + 1);
      refine(ab, b, bc, depth + 1);
      refine(ca, bc, c, depth + 1);
      refine(ab, bc, ca, depth + 1);
    };

    for (let index = 0; index < T.length; index += 3) {
      const fieldPoint = (vertex: number): FieldPoint => {
        const offset = vertex * 3;
        return [V[offset], V[offset + 1], V[offset + 2], S[vertex] - level];
      };
      refine(fieldPoint(T[index]), fieldPoint(T[index + 1]), fieldPoint(T[index + 2]), 0);
    }
    return { pts, segs };
  }

  for (let i = 0; i < T.length; i += 3) {
    const a = T[i],
      b = T[i + 1],
      c = T[i + 2];
    const sa = S[a] - level,
      sb = S[b] - level,
      sc = S[c] - level;
    const pa = sa > 0,
      pb = sb > 0,
      pc = sc > 0;
    if (pa === pb && pb === pc) continue; // no crossing
    let e1, e2;
    if (pa === pb) {
      e1 = getPoint(a, c);
      e2 = getPoint(b, c);
    } else if (pb === pc) {
      e1 = getPoint(b, a);
      e2 = getPoint(c, a);
    } else {
      e1 = getPoint(a, b);
      e2 = getPoint(c, b);
    }
    if (e1 !== e2) segs.push(e1, e2);
  }
  return { pts, segs };
}

function projectWorldPoints(points: NumericArray, P: Projection): number[] {
  const projected: number[] = [];
  const { r, u, f, scale, ox, oy, lensFocalLength, lensDistortion } = P;
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
      lensDistortion,
    );
    projected.push(screen[0], screen[1], depth);
  }
  return projected;
}

/* ------------------------------------------- chain segments into runs */
function chain(pts: NumericArray, segs: NumericArray): number[][] {
  const n = pts.length / 3;
  const head = new Int32Array(n).fill(-1);
  const nextRef = new Int32Array(segs.length).fill(-1);
  for (let s = 0; s < segs.length; s++) {
    // adjacency: linked list per node
    const v = segs[s];
    nextRef[s] = head[v];
    head[v] = s;
  }
  const used = new Uint8Array(segs.length / 2);
  const deg = new Uint8Array(n);
  for (const v of segs) if (deg[v] < 255) deg[v]++;

  const polys: number[][] = [];
  const walk = (start: number): void => {
    const line: number[] = [start];
    let cur = start;
    for (;;) {
      let picked = -1,
        other = -1;
      for (let s = head[cur]; s !== -1; s = nextRef[s]) {
        const si = s >> 1;
        if (used[si]) continue;
        picked = si;
        other = segs[s ^ 1];
        break;
      }
      if (picked === -1) break;
      used[picked] = 1;
      line.push(other);
      cur = other;
      if (cur === start) break; // closed loop
    }
    if (line.length > 1) polys.push(line);
  };
  for (let v = 0; v < n; v++) if (deg[v] === 1) walk(v); // open runs first
  for (let s = 0; s < segs.length; s += 2) if (!used[s >> 1]) walk(segs[s]); // then loops
  return polys;
}

const contourTopologyCache = new WeakMap<ContourMesh, Map<string, CachedSlice[]>>();

interface SliceLfoField {
  values: Float32Array;
  evaluate: (x: number, y: number, z: number) => number;
}

function sliceLfoWaveform(kind: string, angle: number): number {
  if (kind !== 'triangle') return Math.sin(angle);
  const cycle = (((angle / (Math.PI * 2)) % 1) + 1) % 1;
  return 1 - 4 * Math.abs(cycle - 0.5);
}

function createSliceLfoField(
  mesh: ContourMesh,
  normal: Vec3,
  amplitude: number,
  settings: ContourSettings,
): SliceLfoField {
  // Construct a stable orthonormal frame within the current slice plane, then
  // rotate its modulation direction without changing the cutting normal.
  const reference: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  let ux = reference[1] * normal[2] - reference[2] * normal[1],
    uy = reference[2] * normal[0] - reference[0] * normal[2],
    uz = reference[0] * normal[1] - reference[1] * normal[0];
  const uLength = Math.hypot(ux, uy, uz) || 1;
  ux /= uLength;
  uy /= uLength;
  uz /= uLength;
  const vx = normal[1] * uz - normal[2] * uy,
    vy = normal[2] * ux - normal[0] * uz,
    vz = normal[0] * uy - normal[1] * ux;
  const directionAngle = ((Number(settings.sliceLfoAngle) || 0) * Math.PI) / 180;
  const directionCos = Math.cos(directionAngle),
    directionSin = Math.sin(directionAngle);
  const tangent: Vec3 = [
    ux * directionCos + vx * directionSin,
    uy * directionCos + vy * directionSin,
    uz * directionCos + vz * directionSin,
  ];

  const { V } = mesh;
  let tangentMin = Infinity,
    tangentMax = -Infinity;
  for (let offset = 0; offset < V.length; offset += 3) {
    const coordinate =
      V[offset] * tangent[0] + V[offset + 1] * tangent[1] + V[offset + 2] * tangent[2];
    tangentMin = Math.min(tangentMin, coordinate);
    tangentMax = Math.max(tangentMax, coordinate);
  }
  const tangentSpan = tangentMax - tangentMin || 1;
  const angularFrequency =
    (Math.PI * 2 * clamp(Number(settings.sliceLfoCycles) || 0, 0.25, 12)) / tangentSpan;
  const phase = ((Number(settings.sliceLfoPhase) || 0) * Math.PI) / 180;
  const modulationEnabled = Boolean(settings.sliceLfoModulation);
  const modulationDepth = clamp(Number(settings.sliceLfoModulationDepth) || 0, 0, 100) / 100;
  const modulationAngularFrequency =
    (Math.PI * 2 * clamp(Number(settings.sliceLfoModulationCycles) || 0, 0.25, 8)) / tangentSpan;
  const modulationPhase = ((Number(settings.sliceLfoModulationPhase) || 0) * Math.PI) / 180;
  const frequencyModulation = settings.sliceLfoModulationMode === 'frequency';
  const evaluate = (x: number, y: number, z: number): number => {
    const along = x * tangent[0] + y * tangent[1] + z * tangent[2];
    let carrierPhase = (along - tangentMin) * angularFrequency + phase;
    let effectiveAmplitude = amplitude;
    if (modulationEnabled && modulationDepth) {
      const modulator = Math.sin(
        (along - tangentMin) * modulationAngularFrequency + modulationPhase,
      );
      if (frequencyModulation) carrierPhase += modulationDepth * Math.PI * modulator;
      else effectiveAmplitude *= 1 + modulationDepth * modulator;
    }
    const wave = sliceLfoWaveform(settings.sliceLfoWaveform, carrierPhase);
    return x * normal[0] + y * normal[1] + z * normal[2] - effectiveAmplitude * wave;
  };
  const values = new Float32Array(V.length / 3);
  for (let vertex = 0, offset = 0; vertex < values.length; vertex++, offset += 3)
    values[vertex] = evaluate(V[offset], V[offset + 1], V[offset + 2]);
  return { values, evaluate };
}

function contourSlices(
  mesh: ContourMesh,
  settings: ContourSettings,
  field: ScalarField,
  count: number,
  curveStrength: number,
): CachedSlice[] {
  const cacheable = settings.axis !== 'cam';
  const key = cacheable
    ? JSON.stringify([
        settings.axis,
        settings.cutAz,
        settings.cutEl,
        settings.divergence,
        settings.sliceLfo,
        settings.sliceLfoAmplitude,
        settings.sliceLfoCycles,
        settings.sliceLfoAngle,
        settings.sliceLfoPhase,
        settings.sliceLfoWaveform,
        settings.sliceLfoModulation,
        settings.sliceLfoModulationMode,
        settings.sliceLfoModulationDepth,
        settings.sliceLfoModulationCycles,
        settings.sliceLfoModulationPhase,
        count,
        settings.gapEase,
        settings.easeStrength,
        settings.easeCenter,
        settings.easeCycles,
        curveStrength,
      ])
    : '';
  let cache = contourTopologyCache.get(mesh);
  const cached = key && cache?.get(key);
  if (cached) return cached;

  const slices: CachedSlice[] = [];
  const span = field.max - field.min;
  const vertexCount = mesh.V.length / 3;
  const divergence = clamp(settings.divergence || 0, 0, 160);
  const lfoAmplitude =
    settings.sliceLfo && span > 0
      ? (span / Math.max(1, count)) * clamp(Number(settings.sliceLfoAmplitude) || 0, 0, 400) * 0.01
      : 0;
  const parallelLfo =
    lfoAmplitude && !divergence
      ? createSliceLfoField(mesh, field.dir, lfoAmplitude, settings)
      : null;
  const fanTangent = divergence ? sliceFanTangent(field.dir) : null;
  const fan = fanTangent ? sliceFanGeometry(mesh, field, fanTangent, divergence) : null;
  for (let i = 0; i < count; i++) {
    const position = easeLineGap(
      (i + 0.5) / count,
      settings.gapEase,
      settings.easeStrength,
      settings.easeCenter,
      settings.easeCycles,
    );
    let level = field.min + span * position;
    let sliceField = field.S;
    let sliceDirection = field.dir;
    let scalarAtPoint: SliceLfoField['evaluate'] | undefined = parallelLfo?.evaluate;
    if (parallelLfo) sliceField = parallelLfo.values;
    if (fanTangent && fan) {
      const angle = fan.minAngle + (fan.maxAngle - fan.minAngle) * position;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      sliceDirection = [
        field.dir[0] * cos - fanTangent[0] * sin,
        field.dir[1] * cos - fanTangent[1] * sin,
        field.dir[2] * cos - fanTangent[2] * sin,
      ];
      level = fan.normalCenter * cos - fan.sourceTangent * sin;
      if (lfoAmplitude) {
        const divergentLfo = createSliceLfoField(mesh, sliceDirection, lfoAmplitude, settings);
        sliceField = divergentLfo.values;
        scalarAtPoint = divergentLfo.evaluate;
      } else {
        const values = new Float32Array(vertexCount);
        for (let vertex = 0, offset = 0; vertex < vertexCount; vertex++, offset += 3)
          values[vertex] =
            mesh.V[offset] * sliceDirection[0] +
            mesh.V[offset + 1] * sliceDirection[1] +
            mesh.V[offset + 2] * sliceDirection[2];
        sliceField = values;
      }
    }
    const baseAdaptiveDepth = 1 + Math.floor(clamp(curveStrength, 0, 1) * 2.999);
    const carrierCycles = clamp(Number(settings.sliceLfoCycles) || 0, 0.25, 12);
    const fmAdditionalCycles =
      settings.sliceLfoModulation && settings.sliceLfoModulationMode === 'frequency'
        ? (clamp(Number(settings.sliceLfoModulationDepth) || 0, 0, 100) / 200) *
          clamp(Number(settings.sliceLfoModulationCycles) || 0, 0.25, 8)
        : 0;
    const adaptiveDepth = Math.min(
      3,
      baseAdaptiveDepth + (fmAdditionalCycles > carrierCycles * 0.75 ? 1 : 0),
    );
    const { pts, segs } = sliceLevelWorld(
      mesh,
      sliceField,
      level,
      vertexCount,
      sliceDirection,
      curveStrength,
      scalarAtPoint,
      6 + Math.round(clamp(curveStrength, 0, 1) * 18),
      scalarAtPoint ? adaptiveDepth : 0,
    );
    slices.push({ position, worldPoints: pts, polylines: segs.length ? chain(pts, segs) : [] });
  }

  if (key) {
    if (!cache) {
      cache = new Map();
      contourTopologyCache.set(mesh, cache);
    }
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(key, slices);
  }
  return slices;
}

interface SliceFanGeometry {
  normalCenter: number;
  sourceTangent: number;
  minAngle: number;
  maxAngle: number;
}

function sliceFanGeometry(
  mesh: ContourMesh,
  field: ScalarField,
  tangent: Vec3,
  divergence: number,
): SliceFanGeometry | null {
  const normalCenter = (field.min + field.max) * 0.5;
  let tangentMin = Infinity,
    tangentMax = -Infinity;
  const tangentValues = new Float64Array(mesh.V.length / 3);
  for (let vertex = 0, offset = 0; vertex < tangentValues.length; vertex++, offset += 3) {
    const value =
      mesh.V[offset] * tangent[0] +
      mesh.V[offset + 1] * tangent[1] +
      mesh.V[offset + 2] * tangent[2];
    tangentValues[vertex] = value;
    if (value < tangentMin) tangentMin = value;
    if (value > tangentMax) tangentMax = value;
  }
  const tangentCenter = (tangentMin + tangentMax) * 0.5;
  let radius = 0;
  for (let vertex = 0; vertex < tangentValues.length; vertex++) {
    const normalOffset = field.S[vertex] - normalCenter;
    const tangentOffset = tangentValues[vertex] - tangentCenter;
    radius = Math.max(radius, Math.hypot(normalOffset, tangentOffset));
  }
  if (radius < 1e-12) return null;

  // Place the source outside a circle bounding the mesh in the slice/fan
  // cross-section. This prevents high divergence from putting the singularity
  // inside the model, while approaching it smoothly as the angle increases.
  const halfAngle = (divergence * Math.PI) / 360;
  const sourceDistance = radius / Math.sin(halfAngle);
  const sourceTangent = tangentCenter - sourceDistance;
  let minAngle = Infinity,
    maxAngle = -Infinity;
  for (let vertex = 0; vertex < tangentValues.length; vertex++) {
    const angle = Math.atan2(field.S[vertex] - normalCenter, tangentValues[vertex] - sourceTangent);
    if (angle < minAngle) minAngle = angle;
    if (angle > maxAngle) maxAngle = angle;
  }
  return { normalCenter, sourceTangent, minAngle, maxAngle };
}

function sliceFanTangent(direction: Vec3): Vec3 {
  // Prefer model-up as the direction across the fan. For topographic slices,
  // model Y is the deterministic fallback, keeping cached topology independent
  // of camera orbit.
  const reference: Vec3 = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const dot =
    reference[0] * direction[0] + reference[1] * direction[1] + reference[2] * direction[2];
  const x = reference[0] - direction[0] * dot;
  const y = reference[1] - direction[1] * dot;
  const z = reference[2] - direction[2] * dot;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/* ------------------------------------------------------- depth buffer */
function buildDepth(
  P: Projection,
  T: NumericArray,
  W: number,
  H: number,
  res: number,
): DepthBuffer {
  const rw = Math.max(32, Math.round(res * (W >= H ? 1 : W / H)));
  const rh = Math.max(32, Math.round(res * (H >= W ? 1 : H / W)));
  const k = rw / W;
  const buf = new Float32Array(rw * rh).fill(Infinity);
  const { sx, sy, sd } = P;
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i],
      b = T[i + 1],
      c = T[i + 2];
    const x0 = sx[a] * k,
      y0 = sy[a] * k,
      x1 = sx[b] * k,
      y1 = sy[b] * k,
      x2 = sx[c] * k,
      y2 = sy[c] * k;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0 || !isFinite(area)) continue;
    const inv = 1 / area;
    const lo = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const hi = Math.min(rw - 1, Math.ceil(Math.max(x0, x1, x2)));
    const to = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const bo = Math.min(rh - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (lo > hi || to > bo) continue;
    const d0 = sd[a],
      d1 = sd[b],
      d2 = sd[c];
    for (let y = to; y <= bo; y++) {
      const py = y + 0.5,
        row = y * rw;
      for (let x = lo; x <= hi; x++) {
        const px = x + 0.5;
        const w2 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) * inv;
        const w0 = ((x2 - x1) * (py - y1) - (px - x1) * (y2 - y1)) * inv;
        const w1 = 1 - w0 - w2;
        if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue;
        const d = w0 * d0 + w1 * d1 + w2 * d2;
        const o = row + x;
        if (d < buf[o]) buf[o] = d;
      }
    }
  }
  return { buf, rw, rh, k };
}
function makeVisibleTest(D: DepthBuffer, bias: number, rad: number): VisibilityTest {
  const { buf, rw, rh, k } = D;
  const R = rad || 1;
  return (x: number, y: number, d: number): boolean => {
    const px = Math.floor(x * k),
      py = Math.floor(y * k);
    if (px < 0 || py < 0 || px >= rw || py >= rh) return true;
    let best = -Infinity; // most permissive depth found nearby
    for (let j = -R; j <= R; j++) {
      const yy = py + j;
      if (yy < 0 || yy >= rh) continue;
      for (let i = -R; i <= R; i++) {
        const xx = px + i;
        if (xx < 0 || xx >= rw) continue;
        const v = buf[yy * rw + xx];
        if (v !== Infinity && v > best) best = v;
      }
    }
    if (best === -Infinity) return true;
    return d <= best + bias;
  };
}

/* ------------------------------------------- polyline → visible paths */
function healShortPathGaps(
  out: Polyline[],
  firstRun: number,
  tolerance: number,
  closed: boolean,
): void {
  if (tolerance <= 0 || out.length <= firstRun) return;
  const runs = out.splice(firstRun);
  const healed: Polyline[] = [];
  const gap = (a: Polyline, b: Polyline): number =>
    Math.hypot(a[a.length - 2] - b[0], a[a.length - 1] - b[1]);

  for (const run of runs) {
    const previous = healed.at(-1);
    const distance = previous ? gap(previous, run) : Infinity;
    if (previous && distance <= tolerance) previous.push(...run.slice(distance <= 1e-9 ? 2 : 0));
    else healed.push(run);
  }

  if (closed && healed.length) {
    const first = healed[0],
      last = healed.at(-1)!;
    const distance = gap(last, first);
    if (distance <= tolerance) {
      if (healed.length === 1) {
        if (distance > 1e-9) last.push(last[0], last[1]);
      } else {
        last.push(...first.slice(distance <= 1e-9 ? 2 : 0));
        healed[0] = last;
        healed.pop();
      }
    }
  }
  out.push(...healed);
}

function emitPath(
  poly: NumericArray,
  pts: NumericArray,
  visible: VisibilityTest | null,
  step: number,
  out: Polyline[],
  healGap = 0,
): void {
  // Walk a chained polyline and keep only the stretches the camera can see.
  // Visibility is sampled at roughly one sample per depth-buffer pixel, but only
  // the interval breaks become nodes — sampling density never inflates the file.
  const firstRun = out.length;
  let run: Polyline | null = null,
    openEnd = false; // openEnd: run currently ends at this segment's start
  const flush = (): void => {
    if (run && run.length >= 4) out.push(run);
    run = null;
    openEnd = false;
  };

  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i] * 3,
      b = poly[i + 1] * 3;
    const ax = pts[a],
      ay = pts[a + 1],
      ad = pts[a + 2];
    const bx = pts[b],
      by = pts[b + 1],
      bd = pts[b + 2];
    if (!isFinite(ax) || !isFinite(bx)) {
      flush();
      continue;
    }

    if (!visible) {
      if (!run) {
        run = [ax, ay];
      }
      run.push(bx, by);
      openEnd = true;
      continue;
    }

    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.min(400, Math.max(1, Math.ceil(len / step)));
    let s = 0;
    while (s < n) {
      // find the start of the next visible stretch
      while (s < n) {
        const t = (s + 0.5) / n;
        if (visible(ax + (bx - ax) * t, ay + (by - ay) * t, ad + (bd - ad) * t)) break;
        s++;
      }
      // A completely hidden segment breaks continuity. Keeping the previous
      // run open would make a later visible segment bridge this gap with one
      // long, view-dependent straight line.
      if (s >= n) {
        flush();
        break;
      }
      let e = s;
      while (e < n) {
        const t = (e + 0.5) / n;
        if (!visible(ax + (bx - ax) * t, ay + (by - ay) * t, ad + (bd - ad) * t)) break;
        e++;
      }
      const t0 = s / n,
        t1 = e / n;
      const x0 = ax + (bx - ax) * t0,
        y0 = ay + (by - ay) * t0;
      const x1 = ax + (bx - ax) * t1,
        y1 = ay + (by - ay) * t1;
      if (t0 === 0 && run && openEnd) run.push(x1, y1);
      else {
        flush();
        run = [x0, y0, x1, y1];
      }
      openEnd = t1 === 1;
      if (!openEnd) flush();
      s = e + 1;
    }
    if (!openEnd) flush();
  }
  flush();
  healShortPathGaps(out, firstRun, healGap, poly.length > 2 && poly[0] === poly[poly.length - 1]);
}

function splitPolylineByBands(
  poly: NumericArray,
  pts: NumericArray,
  values: NumericArray,
  bandCount: number,
): BandChunk[] {
  const chunks: BandChunk[] = [];
  let current: BandChunk | null = null;
  const pointAt = (a: number, b: number, t: number): Vec3 => [
    pts[a * 3] + (pts[b * 3] - pts[a * 3]) * t,
    pts[a * 3 + 1] + (pts[b * 3 + 1] - pts[a * 3 + 1]) * t,
    pts[a * 3 + 2] + (pts[b * 3 + 2] - pts[a * 3 + 2]) * t,
  ];
  const finish = (): void => {
    if (current && current.pts.length >= 6) chunks.push(current);
    current = null;
  };
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i],
      b = poly[i + 1],
      va = clamp(values[a], 0, 1),
      vb = clamp(values[b], 0, 1);
    const cuts = [0, 1];
    if (Math.abs(vb - va) > 1e-9) {
      for (let k = 1; k < bandCount; k++) {
        const t = (k / bandCount - va) / (vb - va);
        if (t > 1e-7 && t < 1 - 1e-7) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    for (let c = 0; c + 1 < cuts.length; c++) {
      const t0 = cuts[c],
        t1 = cuts[c + 1];
      const middle = va + ((vb - va) * (t0 + t1)) / 2;
      const band = clamp(Math.floor(middle * bandCount), 0, bandCount - 1);
      const p0 = pointAt(a, b, t0),
        p1 = pointAt(a, b, t1);
      if (!current || current.band !== band) {
        finish();
        current = { band, pts: [...p0, ...p1] };
      } else current.pts.push(...p1);
    }
  }
  finish();
  return chunks;
}

function gradientPalette(settings: ContourSettings): string[] {
  if (!settings.gradientEnabled) return [settings.blueprint ? '#f5f9ff' : settings.color];
  const stops = (settings.gradientStops || []).slice().sort((a, b) => a.position - b.position);
  if (stops.length < 2) return [settings.color];
  const count = clamp(Math.round(settings.gradientColors), 2, 24);
  const rgb = (hex: string): Vec3 => {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const hex = (channels: number[]): string =>
    '#' + channels.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    let right = stops.findIndex((stop) => stop.position >= t);
    if (right < 0) right = stops.length - 1;
    const b = stops[right],
      a = stops[Math.max(0, right - 1)];
    const mix = a === b ? 0 : clamp((t - a.position) / (b.position - a.position || 1), 0, 1);
    const ca = rgb(a.color),
      cb = rgb(b.color);
    return hex(ca.map((value, j) => value + (cb[j] - value) * mix));
  });
}

function deterministicDrawingNumber(
  settings: ContourSettings,
  geometry: BlueprintGeometry,
): string {
  const orderedTargets = (targets: MorphTargets): MorphTargets =>
    Object.fromEntries(Object.entries(targets || {}).sort(([a], [b]) => a.localeCompare(b)));
  const signature = JSON.stringify({
    object: settings.documentTitle,
    sheet: [settings.pw, settings.ph, settings.margin],
    camera: [
      settings.az,
      settings.el,
      settings.roll,
      settings.zoom,
      settings.panX,
      settings.panY,
      settings.lensFocalLength,
      settings.lensDistortion,
      settings.lens,
      settings.lensAmount,
    ],
    contours: [
      settings.lines,
      settings.gapEase,
      settings.easeStrength,
      settings.easeCycles,
      settings.easeCenter,
      settings.quality,
      settings.axis,
      settings.cutAz,
      settings.cutEl,
      settings.sliceLfo,
      settings.sliceLfoAmplitude,
      settings.sliceLfoCycles,
      settings.sliceLfoAngle,
      settings.sliceLfoPhase,
      settings.sliceLfoWaveform,
      settings.sliceLfoModulation,
      settings.sliceLfoModulationMode,
      settings.sliceLfoModulationDepth,
      settings.sliceLfoModulationCycles,
      settings.sliceLfoModulationPhase,
      settings.spiral,
      settings.hide,
      settings.sil,
    ],
    geometry: [
      geometry.fieldMin,
      geometry.fieldMax,
      geometry.direction,
      geometry.vertices,
      geometry.triangles,
    ],
    output: [
      settings.sw,
      settings.humanizer,
      settings.humanizerAmount,
      settings.yarnCurl,
      settings.yarnCutPercent,
      settings.yarnCurlSize,
      settings.blueprintStyle,
      settings.maskEnabled,
      settings.maskOutline,
      settings.maskRoundness,
      settings.maskScaleX,
      settings.maskScaleY,
      settings.maskOffsetX,
      settings.maskOffsetY,
      settings.maskLfo1Amplitude,
      settings.maskLfo1Cycles,
      settings.maskLfo1Phase,
      settings.maskLfo1Waveform,
      settings.maskLfo2Amplitude,
      settings.maskLfo2Cycles,
      settings.maskLfo2Phase,
      settings.maskLfo2Waveform,
    ],
    morph: [
      settings.morphEnabled,
      settings.morphSteps,
      orderedTargets(settings.morphTargets),
      settings.morphSecondEnabled,
      settings.morphStepsY,
      orderedTargets(settings.morphTargets2),
    ],
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `SW-${(hash >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}

type BlueprintGeometry = {
  direction?: Vec3;
  fieldMin?: number;
  fieldMax?: number;
  vertices?: number;
  triangles?: number;
};

interface InternalContourResult extends ContourResult {
  blueprintGeometry: BlueprintGeometry;
}

interface MorphContourResult extends InternalContourResult {
  morphX: number;
  morphY: number;
}

function blueprintDocument(
  settings: ContourSettings,
  W: number,
  H: number,
  geometry: BlueprintGeometry = {},
): BlueprintDocument {
  if (!settings.blueprint) return { backdrop: '', overlay: '' };
  const black = settings.blueprintStyle === 'black';
  const paper = black ? '#101417' : '#0b3f7a';
  const ink = '#f5f9ff';
  const faint = black ? '#637079' : '#72a4d5';
  const min = Math.min(W, H);
  const edge = clamp(min * 0.035, 2, 9);
  const inset = edge + clamp(min * 0.018, 1.2, 4);
  const font = clamp(min * 0.018, 1.35, 3.1);
  const tiny = font * 0.72;
  const dimensionLabelOffset = Math.max(tiny * 1.15, edge * 0.75);
  const grid = clamp(min / 28, 2.5, 10);
  const titleW = clamp(W * 0.34, Math.min(32, W * 0.46), 72);
  const titleH = clamp(H * 0.12, Math.min(12, H * 0.2), 25);
  const tx = W - inset - titleW,
    ty = H - inset - titleH;
  const cx = W / 2,
    cy = H / 2;
  const name = escapeXml(
    String(settings.documentTitle || 'UNTITLED CONTOUR STUDY')
      .toUpperCase()
      .slice(0, 38),
  );
  const axis = escapeXml(String(settings.axis || 'up').toUpperCase());
  const drawing = deterministicDrawingNumber(settings, geometry);
  const vector = (geometry.direction || [0, 0, 1])
    .map((value) => Number(value || 0).toFixed(3))
    .join(', ');
  const fieldMin = Number(geometry.fieldMin || 0);
  const fieldMax = Number(geometry.fieldMax || 0);
  const fieldSpan = fieldMax - fieldMin;
  const lineCount = Math.max(1, Math.round(settings.lines || 1));
  const [focalLength, distortion] = resolveLens(settings);
  const transform = `pₛ = ${fmt(settings.zoom || 1)}·Lens_${fmt(focalLength)}mm,${fmt(distortion)}%(R(${fmt(settings.az || 0)}°, ${fmt(settings.el || 0)}°, ${fmt(settings.roll || 0)}°)p) + [${fmt(settings.panX || 0)}, ${fmt(settings.panY || 0)}]`;
  const slicing = settings.spiral
    ? `Γₖ: ${lineCount}q(p) − atan2(v,u) = k + 0.5`
    : `hᵢ = ${fieldMin.toFixed(3)} + ${fieldSpan.toFixed(3)}·E_${escapeXml(settings.gapEase || 'linear')}((i + 0.5) / ${lineCount})`;
  const objectStats = `n̂_${axis} = [${vector}] · V=${Math.round(geometry.vertices || 0)} · F=${Math.round(geometry.triangles || 0)}`;
  const common = `fill="none" stroke="${ink}" vector-effect="non-scaling-stroke"`;
  const text = `fill="${ink}" stroke="none" font-family="DM Mono,ui-monospace,monospace"`;
  const backdrop = `<rect width="${W}" height="${H}" fill="${paper}"/>
<defs>
  <pattern id="blueprint-grid" width="${fmt(grid)}" height="${fmt(grid)}" patternUnits="userSpaceOnUse"><path d="M ${fmt(grid)} 0 L 0 0 0 ${fmt(grid)}" fill="none" stroke="${faint}" stroke-width="0.16" opacity="0.28" vector-effect="non-scaling-stroke"/></pattern>
</defs>
<rect x="${fmt(edge)}" y="${fmt(edge)}" width="${fmt(W - edge * 2)}" height="${fmt(H - edge * 2)}" fill="url(#blueprint-grid)" stroke="${ink}" stroke-width="0.45" opacity="0.96" vector-effect="non-scaling-stroke"/>
<path d="M ${fmt(inset)} ${fmt(edge)}v${fmt(edge * 0.55)}M${fmt(W - inset)} ${fmt(edge)}v${fmt(edge * 0.55)}M${fmt(edge)} ${fmt(inset)}h${fmt(edge * 0.55)}M${fmt(edge)} ${fmt(H - inset)}h${fmt(edge * 0.55)}" ${common} stroke-width="0.35" opacity="0.9"/>`;
  const overlay = `<g id="technical-annotations" style="pointer-events:none;user-select:none;-webkit-user-select:none">
  <g ${text} font-size="${fmt(tiny)}" letter-spacing="${fmt(tiny * 0.1)}">
    <text x="${fmt(cx)}" y="${fmt(dimensionLabelOffset)}" text-anchor="middle">${fmt(W)} mm · SHEET WIDTH</text>
    <text x="${fmt(dimensionLabelOffset)}" y="${fmt(cy)}" text-anchor="middle" transform="rotate(-90 ${fmt(dimensionLabelOffset)} ${fmt(cy)})">${fmt(H)} mm · SHEET HEIGHT</text>
  </g>
  <g ${text} font-size="${fmt(tiny)}" opacity="0.78">
    <text x="${fmt(inset + font)}" y="${fmt(H - inset - font * 4.4)}">${transform}</text>
    <text x="${fmt(inset + font)}" y="${fmt(H - inset - font * 3.1)}">${objectStats}</text>
    <text x="${fmt(inset + font)}" y="${fmt(H - inset - font * 1.8)}">${slicing}</text>
  </g>
  <g transform="translate(${fmt(tx)} ${fmt(ty)})">
    <rect width="${fmt(titleW)}" height="${fmt(titleH)}" fill="${paper}" fill-opacity="0.9" stroke="${ink}" stroke-width="0.45" vector-effect="non-scaling-stroke"/>
    <path d="M0 ${fmt(titleH * 0.48)}H${fmt(titleW)}M${fmt(titleW * 0.66)} ${fmt(titleH * 0.48)}V${fmt(titleH)}M${fmt(titleW * 0.84)} ${fmt(titleH * 0.48)}V${fmt(titleH)}" ${common} stroke-width="0.3"/>
    <text x="${fmt(titleW * 0.04)}" y="${fmt(titleH * 0.22)}" ${text} font-size="${fmt(font * 0.82)}" font-weight="600" letter-spacing="${fmt(font * 0.08)}">${name}</text>
    <text x="${fmt(titleW * 0.04)}" y="${fmt(titleH * 0.39)}" ${text} font-size="${fmt(tiny)}">CONTOUR PROJECTION · TECHNICAL STUDY</text>
    <text x="${fmt(titleW * 0.03)}" y="${fmt(titleH * 0.66)}" ${text} font-size="${fmt(tiny * 0.85)}">DRAWING NO.</text>
    <text x="${fmt(titleW * 0.03)}" y="${fmt(titleH * 0.86)}" ${text} font-size="${fmt(tiny)}">${drawing}</text>
    <text x="${fmt(titleW * 0.69)}" y="${fmt(titleH * 0.66)}" ${text} font-size="${fmt(tiny * 0.65)}" letter-spacing="0">PROJECTION</text>
    <text x="${fmt(titleW * 0.69)}" y="${fmt(titleH * 0.86)}" ${text} font-size="${fmt(tiny * 0.82)}">${axis}</text>
    <text x="${fmt(titleW * 0.87)}" y="${fmt(titleH * 0.66)}" ${text} font-size="${fmt(tiny * 0.85)}">REV</text>
    <text x="${fmt(titleW * 0.9)}" y="${fmt(titleH * 0.88)}" ${text} font-size="${fmt(font)}">A</text>
  </g>
</g>`;
  return { backdrop, overlay };
}

function effectivePaperColor(settings: ContourSettings): string {
  if (settings.blueprint) return settings.blueprintStyle === 'black' ? '#101417' : '#0b3f7a';
  if (settings.chroma) return '#000000';
  return settings.backgroundColor || '#ffffff';
}

function effectiveAnnotationColor(settings: ContourSettings): string {
  return settings.blueprint || settings.chroma ? '#f5f9ff' : settings.color;
}

function documentBackdrop(
  settings: ContourSettings,
  W: number,
  H: number,
  blueprint: BlueprintDocument,
): string {
  if (settings.suppressBackground) return '';
  if (settings.blueprint) return blueprint.backdrop;
  if (settings.chroma) return `<rect width="${W}" height="${H}" fill="#000000"/>`;
  return settings.bg
    ? `<rect width="${W}" height="${H}" fill="${settings.backgroundColor || '#ffffff'}"/>`
    : '';
}

function documentOverlay(settings: ContourSettings, blueprint: BlueprintDocument): string {
  return settings.suppressBackground ? '' : blueprint.overlay;
}

function clipArtworkRun(
  run: Polyline,
  settings: ContourSettings,
  width: number,
  height: number,
): Polyline[] {
  const artboardRuns = settings.clipToArtboard ? clipRunToRect(run, width, height) : [run];
  return settings.maskEnabled
    ? artboardRuns.flatMap((candidate) =>
        clipRunToGenerativeMask(candidate, settings, width, height, settings.margin),
      )
    : artboardRuns;
}

function maskArtwork(
  settings: ContourSettings,
  width: number,
  height: number,
  artwork: string,
): string {
  if (!settings.maskEnabled) return artwork;
  const signature = [
    settings.maskRoundness,
    settings.maskScaleX,
    settings.maskScaleY,
    settings.maskOffsetX,
    settings.maskOffsetY,
    settings.maskLfo1Amplitude,
    settings.maskLfo1Cycles,
    settings.maskLfo1Phase,
    settings.maskLfo1Waveform,
    settings.maskLfo2Amplitude,
    settings.maskLfo2Cycles,
    settings.maskLfo2Phase,
    settings.maskLfo2Waveform,
  ].join('-');
  let hash = 0x811c9dc5;
  for (let index = 0; index < signature.length; index++) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const id = `generative-mask-${(hash >>> 0).toString(36)}`;
  const path = generativeMaskPath(settings, width, height, settings.margin);
  return `<defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs><g clip-path="url(#${id})">${artwork}</g>`;
}

function maskOutlineArtwork(
  settings: ContourSettings,
  width: number,
  height: number,
  quality: number,
): { svg: string; runs: Polyline[] } {
  if (!settings.maskEnabled || !settings.maskOutline) return { svg: '', runs: [] };
  const boundary = generativeMaskRun(settings, width, height, settings.margin);
  const candidates = settings.clipToArtboard ? clipRunToRect(boundary, width, height) : [boundary];
  const runs: Polyline[] = [];
  let path = '';
  for (const run of candidates) {
    if (run.length < 4) continue;
    runs.push(run);
    path += serialiseRun(run, quality, sharpVertices(run));
  }
  return {
    svg: path
      ? `<path id="generative-mask-outline" d="${path}" fill="none" stroke="${effectiveAnnotationColor(settings)}" stroke-width="${fmt(settings.sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : '',
    runs,
  };
}

function chromaticLayers(
  settings: ContourSettings,
  W: number,
  H: number,
  paths: (color: string) => string,
  baseArtwork = '',
): string {
  const amount = clamp(settings.chromaAmount, 0.1, 6);
  const rotation = amount * 0.12;
  const cx = W / 2;
  const cy = H / 2;
  const attrs = `fill="none" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:screen"`;
  const base = baseArtwork ? `<g id="chroma-base">${baseArtwork}</g>` : '';
  return `${base}<g id="chromatic-aberration" style="isolation:isolate">
<g transform="translate(${-amount} 0) rotate(${-rotation} ${cx} ${cy})" ${attrs}>${paths('#ff2020')}</g>
<g transform="translate(0 ${fmt(amount * 0.08)})" ${attrs}>${paths('#25ff48')}</g>
<g transform="translate(${amount} 0) rotate(${rotation} ${cx} ${cy})" ${attrs}>${paths('#2548ff')}</g>
</g>`;
}

/* ------------------------------------ Ramer–Douglas–Peucker (iterative) */
function sharpVertices(run: NumericArray): Uint8Array {
  const n = run.length / 2;
  const sharp = new Uint8Array(n);
  const closed =
    n > 3 && Math.hypot(run[0] - run[(n - 1) * 2], run[1] - run[(n - 1) * 2 + 1]) < 1e-5;
  const count = closed ? n - 1 : n;
  const threshold = (35 * Math.PI) / 180;
  const point = (i: number): Vec2 => {
    if (closed) i = ((i % count) + count) % count;
    else i = clamp(i, 0, count - 1);
    return [run[i * 2], run[i * 2 + 1]];
  };
  for (let i = closed ? 0 : 1; i < (closed ? count : count - 1); i++) {
    const a = point(i - 1),
      b = point(i),
      c = point(i + 1);
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      vx = c[0] - b[0],
      vy = c[1] - b[1];
    const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (!den) continue;
    const turn = Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy);
    if (turn >= threshold) sharp[i] = 1;
  }
  if (closed) sharp[n - 1] = sharp[0];
  return sharp;
}

function simplify(run: Polyline, tol: number): { run: Polyline; sharp: Uint8Array } {
  const n = run.length / 2;
  const sourceSharp = sharpVertices(run);
  if (n < 3) return { run, sharp: sourceSharp };
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  for (let i = 1; i < n - 1; i++) if (sourceSharp[i]) keep[i] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    if (i1 - i0 < 2) continue;
    const x0 = run[i0 * 2],
      y0 = run[i0 * 2 + 1],
      x1 = run[i1 * 2],
      y1 = run[i1 * 2 + 1];
    const dx = x1 - x0,
      dy = y1 - y0,
      dd = dx * dx + dy * dy;
    let far = -1,
      best = t2;
    for (let i = i0 + 1; i < i1; i++) {
      const px = run[i * 2] - x0,
        py = run[i * 2 + 1] - y0;
      let d;
      if (dd === 0) d = px * px + py * py;
      else {
        const t = clamp((px * dx + py * dy) / dd, 0, 1);
        const ex = px - dx * t,
          ey = py - dy * t;
        d = ex * ex + ey * ey;
      }
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([i0, far], [far, i1]);
    }
  }
  const out: number[] = [],
    sharp: number[] = [];
  for (let i = 0; i < n; i++)
    if (keep[i]) {
      out.push(run[i * 2], run[i * 2 + 1]);
      sharp.push(sourceSharp[i]);
    }
  return { run: out, sharp: Uint8Array.from(sharp) };
}

/* --------------------------------------- deterministic hand-drawn wobble */
function humanizeRun(run: Polyline, amount: number, salt = 0): Polyline {
  const strength = clamp(Number(amount) || 0, 0, 100) / 100;
  const count = run.length / 2;
  if (!strength || count < 2) return run;
  const closed =
    count > 3 &&
    Math.hypot(run[0] - run[(count - 1) * 2], run[1] - run[(count - 1) * 2 + 1]) < 1e-5;
  const uniqueCount = closed ? count - 1 : count;
  if (uniqueCount < 2) return run;

  // Coordinate-derived phases keep the character stable across redraws and
  // exports, while the salt prevents neighbouring contours moving in unison.
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  const sampleCount = Math.min(uniqueCount, 8);
  for (let i = 0; i < sampleCount; i++) {
    hash ^= Math.round(run[i * 2] * 1000);
    hash = Math.imul(hash, 0x01000193);
    hash ^= Math.round(run[i * 2 + 1] * 1000);
    hash = Math.imul(hash, 0x01000193);
  }
  const random = (): number => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return (hash >>> 0) / 4294967296;
  };
  const phases = [random(), random(), random(), random()].map((value) => value * Math.PI * 2);
  const amplitude = 0.08 + strength * 0.62;
  const spacing = 4.8 - strength * 2.2;
  const points: number[] = [];
  let distance = 0;
  const segmentCount = closed ? uniqueCount : uniqueCount - 1;
  for (let i = 0; i < segmentCount; i++) {
    const next = (i + 1) % uniqueCount;
    const x0 = run[i * 2],
      y0 = run[i * 2 + 1],
      x1 = run[next * 2],
      y1 = run[next * 2 + 1];
    const dx = x1 - x0,
      dy = y1 - y0,
      length = Math.hypot(dx, dy);
    if (!length) continue;
    const divisions = Math.max(1, Math.ceil(length / spacing));
    for (let part = 0; part < divisions; part++) {
      const t = part / divisions,
        s = distance + length * t;
      const nx = -dy / length,
        ny = dx / length,
        tx = dx / length,
        ty = dy / length;
      const normal =
        amplitude *
        (0.58 * Math.sin(s * 0.19 + phases[0]) +
          0.29 * Math.sin(s * 0.47 + phases[1]) +
          0.13 * Math.sin(s * 1.07 + phases[2]));
      const along = amplitude * 0.13 * Math.sin(s * 0.31 + phases[3]);
      points.push(x0 + dx * t + nx * normal + tx * along, y0 + dy * t + ny * normal + ty * along);
    }
    distance += length;
  }
  if (!closed) {
    const i = uniqueCount - 2,
      x0 = run[i * 2],
      y0 = run[i * 2 + 1],
      x1 = run[(i + 1) * 2],
      y1 = run[(i + 1) * 2 + 1];
    const dx = x1 - x0,
      dy = y1 - y0,
      length = Math.hypot(dx, dy) || 1,
      s = distance;
    const normal =
      amplitude *
      (0.58 * Math.sin(s * 0.19 + phases[0]) +
        0.29 * Math.sin(s * 0.47 + phases[1]) +
        0.13 * Math.sin(s * 1.07 + phases[2]));
    const along = amplitude * 0.13 * Math.sin(s * 0.31 + phases[3]);
    points.push(
      x1 - (dy / length) * normal + (dx / length) * along,
      y1 + (dx / length) * normal + (dy / length) * along,
    );
  } else if (points.length >= 2) points.push(points[0], points[1]);
  return points.length >= 4 ? points : run;
}

/* ------------------------------------- cut contours into curled yarn ends */
function polylineDistances(run: NumericArray): number[] {
  const distances = [0];
  for (let i = 2; i < run.length; i += 2)
    distances.push(distances.at(-1)! + Math.hypot(run[i] - run[i - 2], run[i + 1] - run[i - 1]));
  return distances;
}

function pointAlong(run: NumericArray, distances: readonly number[], distance: number): Vec2 {
  const total = distances.at(-1) || 0;
  const target = clamp(distance, 0, total);
  let index = 1;
  while (index < distances.length && distances[index] < target) index++;
  if (index >= distances.length) return [run[run.length - 2], run[run.length - 1]];
  const start = distances[index - 1],
    span = distances[index] - start,
    t = span ? (target - start) / span : 0;
  return [
    run[(index - 1) * 2] + (run[index * 2] - run[(index - 1) * 2]) * t,
    run[(index - 1) * 2 + 1] + (run[index * 2 + 1] - run[(index - 1) * 2 + 1]) * t,
  ];
}

function slicePolyline(
  run: Polyline,
  distances: readonly number[],
  startDistance: number,
  endDistance: number,
): Polyline {
  const start = pointAlong(run, distances, startDistance);
  const end = pointAlong(run, distances, endDistance);
  const sliced: Polyline = [...start];
  for (let i = 1; i + 1 < distances.length; i++)
    if (distances[i] > startDistance && distances[i] < endDistance)
      sliced.push(run[i * 2], run[i * 2 + 1]);
  sliced.push(...end);
  return sliced;
}

interface YarnCurlStyle {
  replacementLength: number;
  drawnLength: number;
  turn: number;
  direction: number;
  irregularity: number;
  phase: number;
}

function curlRunEnd(run: Polyline, atStart: boolean, style: YarnCurlStyle): Polyline {
  const distances = polylineDistances(run);
  const total = distances.at(-1) || 0;
  if (total < 2) return run;
  const replacementLength = Math.min(total * 0.48, style.replacementLength);
  const drawnLength = Math.min(total * 0.9, style.drawnLength);
  const anchorDistance = atStart ? replacementLength : total - replacementLength;
  const anchor = pointAlong(run, distances, anchorDistance);
  const epsilon = Math.min(0.3, replacementLength * 0.12);
  const before = pointAlong(run, distances, Math.max(0, anchorDistance - epsilon));
  const after = pointAlong(run, distances, Math.min(total, anchorDistance + epsilon));
  const dx = after[0] - before[0],
    dy = after[1] - before[1],
    length = Math.hypot(dx, dy) || 1,
    outward = Math.atan2(dy / length, dx / length) + (atStart ? Math.PI : 0);
  const samples = clamp(Math.ceil(drawnLength / 0.65), 14, 42);
  const stepLength = drawnLength / samples;
  const curl: Polyline = [...anchor];
  let x = anchor[0],
    y = anchor[1];
  for (let part = 1; part <= samples; part++) {
    const u = (part - 0.5) / samples;
    // Integrating a changing heading produces a true sweeping curl. Each end
    // gets an independent length, radius, total turn, handedness and wobble.
    const turnProgress = Math.pow(u, 0.72);
    const wobble =
      style.irregularity * Math.sin(style.phase + u * Math.PI * 2.3) * Math.sin(u * Math.PI);
    const angle = outward + style.direction * style.turn * turnProgress + wobble;
    const spacingVariation = 1 + 0.13 * Math.sin(style.phase * 0.7 + u * Math.PI * 3.1);
    x += Math.cos(angle) * stepLength * spacingVariation;
    y += Math.sin(angle) * stepLength * spacingVariation;
    curl.push(x, y);
  }
  if (atStart) {
    const reversedCurl: Polyline = [];
    for (let i = curl.length - 2; i >= 0; i -= 2) reversedCurl.push(curl[i], curl[i + 1]);
    const remainder = slicePolyline(run, distances, anchorDistance, total);
    return [...reversedCurl, ...remainder.slice(2)];
  }
  const remainder = slicePolyline(run, distances, 0, anchorDistance);
  return [...remainder.slice(0, -2), ...curl];
}

function hashPolyline(run: NumericArray, salt = 0): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  const stride = Math.max(2, Math.floor(run.length / 12 / 2) * 2);
  for (let i = 0; i < run.length; i += stride) {
    hash ^= Math.round(run[i] * 100);
    hash = Math.imul(hash, 0x01000193);
    hash ^= Math.round(run[i + 1] * 100);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function yarnCutRun(
  run: Polyline,
  seed: number,
  sizePercent: number,
  requestedCuts: number,
): Polyline[] {
  const distances = polylineDistances(run);
  const total = distances.at(-1) || 0;
  const cutCount = Math.min(Math.max(1, Math.round(requestedCuts)), Math.floor(total / 6));
  if (total < 12 || cutCount < 1) return [run];
  let hash = seed || 1;
  const random = (): number => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return (hash >>> 0) / 4294967296;
  };
  const size = clamp(Number(sizePercent) || 100, 25, 250) / 100;
  const randomCurlStyle = (): YarnCurlStyle => ({
    replacementLength: (5 + random() * 11) * size,
    drawnLength: (9 + random() * 19) * size,
    turn: ((100 + random() * 240) * Math.PI) / 180,
    direction: random() < 0.5 ? -1 : 1,
    irregularity: ((5 + random() * 24) * Math.PI) / 180,
    phase: random() * Math.PI * 2,
  });
  const closed = run.length >= 8 && Math.hypot(run[0] - run.at(-2)!, run[1] - run.at(-1)!) < 1e-5;
  type YarnCut = {
    leftDistance: number;
    rightDistance: number;
    leftStyle: YarnCurlStyle;
    rightStyle: YarnCurlStyle;
  };
  if (!closed) {
    const cuts: YarnCut[] = [];
    const start = total * 0.1;
    const span = total * 0.8;
    for (let index = 0; index < cutCount; index++) {
      const centre = start + ((index + 0.2 + random() * 0.6) / cutCount) * span;
      const gap = Math.min(total / (cutCount * 5), 0.8 + random() * 3.7);
      cuts.push({
        leftDistance: centre - gap / 2,
        rightDistance: centre + gap / 2,
        leftStyle: randomCurlStyle(),
        rightStyle: randomCurlStyle(),
      });
    }
    cuts.sort((a, b) => a.leftDistance - b.leftDistance);
    const pieces: Polyline[] = [];
    const first = slicePolyline(run, distances, 0, cuts[0].leftDistance);
    pieces.push(curlRunEnd(first, false, cuts[0].leftStyle));
    for (let index = 0; index + 1 < cuts.length; index++) {
      const current = cuts[index];
      const next = cuts[index + 1];
      const middle = slicePolyline(run, distances, current.rightDistance, next.leftDistance);
      pieces.push(curlRunEnd(curlRunEnd(middle, true, current.rightStyle), false, next.leftStyle));
    }
    const lastCut = cuts.at(-1)!;
    const last = slicePolyline(run, distances, lastCut.rightDistance, total);
    pieces.push(curlRunEnd(last, true, lastCut.rightStyle));
    return pieces;
  }
  const offset = random() / cutCount;
  const cuts: YarnCut[] = [];
  for (let index = 0; index < cutCount; index++) {
    const centre = (((index + 0.2 + random() * 0.6) / cutCount + offset) % 1) * total;
    const gap = Math.min(total / (cutCount * 5), 0.8 + random() * 3.7);
    cuts.push({
      leftDistance: Math.max(0, centre - gap / 2),
      rightDistance: Math.min(total, centre + gap / 2),
      leftStyle: randomCurlStyle(),
      rightStyle: randomCurlStyle(),
    });
  }
  cuts.sort((a, b) => a.leftDistance - b.leftDistance);
  const pieces: Polyline[] = [];
  for (let index = 0; index < cuts.length; index++) {
    const current = cuts[index];
    const next = cuts[(index + 1) % cuts.length];
    const middle =
      index + 1 < cuts.length
        ? slicePolyline(run, distances, current.rightDistance, next.leftDistance)
        : [
            ...slicePolyline(run, distances, current.rightDistance, total),
            ...slicePolyline(run, distances, 0, next.leftDistance).slice(2),
          ];
    pieces.push(curlRunEnd(curlRunEnd(middle, true, current.rightStyle), false, next.leftStyle));
  }
  return pieces;
}

function selectYarnRuns(runs: readonly Polyline[], percent: number): Map<Polyline, number> {
  const eligible: Array<{ run: Polyline; score: number; length: number }> = [];
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index];
    const length = polylineDistances(run).at(-1) || 0;
    if (length >= 12) eligible.push({ run, length, score: hashPolyline(run, index * 0x9e3779b9) });
  }
  eligible.sort((a, b) => a.score - b.score);
  const selected = new Map<Polyline, number>();
  const normalizedPercent = clamp(Number(percent) || 0, 0, 500);
  const cutsPerLine = Math.floor(normalizedPercent / 100);
  const remainder = normalizedPercent % 100;
  const extraCuts = remainder ? Math.max(1, Math.round((eligible.length * remainder) / 100)) : 0;
  for (let index = 0; index < eligible.length; index++) {
    const candidate = eligible[index];
    const requested = cutsPerLine + (index < extraCuts ? 1 : 0);
    const feasible = Math.min(requested, Math.floor(candidate.length / 6));
    if (feasible > 0) selected.set(candidate.run, feasible);
  }
  return selected;
}

/* ------------------------------------------ adaptive SVG curve output */
function serialiseRun(run: NumericArray, quality: number, sharp: NumericArray): string {
  const n = run.length / 2;
  if (n < 2) return '';
  const closed =
    n > 3 && Math.hypot(run[0] - run[(n - 1) * 2], run[1] - run[(n - 1) * 2 + 1]) < 1e-5;
  const count = closed ? n - 1 : n;
  if (count < 2) return '';
  const point = (i: number): Vec2 => {
    if (closed) i = ((i % count) + count) % count;
    else i = clamp(i, 0, count - 1);
    return [run[i * 2], run[i * 2 + 1]];
  };
  const curvature = (i: number): number => {
    if (!closed && (i <= 0 || i >= count - 1)) return 0;
    const a = point(i - 1),
      b = point(i),
      c = point(i + 1);
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      vx = c[0] - b[0],
      vy = c[1] - b[1];
    const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    return den ? Math.abs(ux * vy - uy * vx) / den : 0;
  };

  // Catmull–Rom tangents become cubic controls. Nearly straight spans stay as
  // compact line commands; curved spans gain smooth controls without inserting
  // uniformly spaced on-curve nodes.
  const tension = 0.62 + quality * 0.038;
  const bendThreshold = 0.045 - quality * 0.003;
  const segments = closed ? count : count - 1;
  let d = 'M' + fmt(run[0]) + ' ' + fmt(run[1]);
  for (let i = 0; i < segments; i++) {
    const p0 = point(i - 1),
      p1 = point(i),
      p2 = point(i + 1),
      p3 = point(i + 2);
    const bend = Math.max(curvature(i), curvature(i + 1));
    if (quality === 1 || sharp[i] || sharp[(i + 1) % count] || bend < bendThreshold) {
      d += 'L' + fmt(p2[0]) + ' ' + fmt(p2[1]);
      continue;
    }
    const k = tension / 6;
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const cap = segLen * 0.45;
    let t1x = (p2[0] - p0[0]) * k,
      t1y = (p2[1] - p0[1]) * k;
    let t2x = (p3[0] - p1[0]) * k,
      t2y = (p3[1] - p1[1]) * k;
    const t1l = Math.hypot(t1x, t1y),
      t2l = Math.hypot(t2x, t2y);
    if (t1l > cap) {
      t1x *= cap / t1l;
      t1y *= cap / t1l;
    }
    if (t2l > cap) {
      t2x *= cap / t2l;
      t2y *= cap / t2l;
    }
    const c1x = p1[0] + t1x,
      c1y = p1[1] + t1y;
    const c2x = p2[0] - t2x,
      c2y = p2[1] - t2y;
    d +=
      'C' +
      fmt(c1x) +
      ' ' +
      fmt(c1y) +
      ' ' +
      fmt(c2x) +
      ' ' +
      fmt(c2y) +
      ' ' +
      fmt(p2[0]) +
      ' ' +
      fmt(p2[1]);
  }
  return d + (closed ? 'Z' : '');
}

/* ------------------------------------------------------- silhouette */
const convexityCache = new WeakMap<ContourMesh, boolean>();

function isConvexMesh(mesh: ContourMesh): boolean {
  const cached = convexityCache.get(mesh);
  if (cached !== undefined) return cached;
  const { V, T } = mesh;
  const vertexCount = V.length / 3;
  const edges = new Map<number, { triangle: number; opposite: number }>();
  let side = 0,
    unmatchedEdges = 0,
    convex = T.length >= 12;

  const classifySide = (triangle: number, point: number): number => {
    const a = T[triangle] * 3,
      b = T[triangle + 1] * 3,
      c = T[triangle + 2] * 3,
      p = point * 3;
    const abx = V[b] - V[a],
      aby = V[b + 1] - V[a + 1],
      abz = V[b + 2] - V[a + 2];
    const acx = V[c] - V[a],
      acy = V[c + 1] - V[a + 1],
      acz = V[c + 2] - V[a + 2];
    const nx = aby * acz - abz * acy,
      ny = abz * acx - abx * acz,
      nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    if (!length) return 0;
    const distance =
      (nx * (V[p] - V[a]) + ny * (V[p + 1] - V[a + 1]) + nz * (V[p + 2] - V[a + 2])) / length;
    return Math.abs(distance) <= 1e-5 ? 0 : Math.sign(distance);
  };

  for (let triangle = 0; convex && triangle < T.length; triangle += 3) {
    for (let edge = 0; edge < 3; edge++) {
      const a = T[triangle + edge],
        b = T[triangle + ((edge + 1) % 3)],
        opposite = T[triangle + ((edge + 2) % 3)],
        key = a < b ? a * vertexCount + b : b * vertexCount + a;
      const previous = edges.get(key);
      if (!previous) {
        edges.set(key, { triangle, opposite });
        unmatchedEdges++;
        continue;
      }
      if (previous.triangle < 0) {
        convex = false;
        break;
      }
      edges.set(key, { triangle: -1, opposite: -1 });
      unmatchedEdges--;
      for (const current of [
        classifySide(previous.triangle, opposite),
        classifySide(triangle, previous.opposite),
      ]) {
        if (!current) continue;
        if (side && current !== side) {
          convex = false;
          break;
        }
        side = current;
      }
    }
  }
  // Open/non-manifold surfaces cannot use the no-self-occlusion shortcut.
  convex = convex && unmatchedEdges === 0 && side !== 0;
  convexityCache.set(mesh, convex);
  return convex;
}

function silhouetteEdges(mesh: ContourMesh, P: Projection): PointSegments {
  const { T } = mesh;
  const { sx, sy, sd } = P;
  const facing = new Int8Array(T.length / 3);
  for (let i = 0, t = 0; i < T.length; i += 3, t++) {
    const a = T[i],
      b = T[i + 1],
      c = T[i + 2];
    const area = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a]);
    facing[t] = area > 0 ? 1 : -1; // screen y is flipped, so sign = facing
  }
  const NV = mesh.V.length / 3;
  const edges = new Map<number, number>();
  for (let i = 0, t = 0; i < T.length; i += 3, t++) {
    for (let e = 0; e < 3; e++) {
      const a = T[i + e],
        b = T[i + ((e + 1) % 3)];
      const key = a < b ? a * NV + b : b * NV + a;
      const prev = edges.get(key);
      if (prev === undefined) edges.set(key, facing[t]);
      else edges.set(key, prev + facing[t] * 4); // marker: seen twice
    }
  }
  const pts: number[] = [],
    segs: number[] = [],
    seen = new Map<number, number>();
  const nodeOf = (v: number): number => {
    let id = seen.get(v);
    if (id === undefined) {
      id = pts.length / 3;
      seen.set(v, id);
      pts.push(sx[v], sy[v], sd[v]);
    }
    return id;
  };
  // encoding: seen once → ±1 (open boundary). Seen twice → prev + facing*4:
  //   same facing → ±5 (interior edge)   mixed facing → ±3 (silhouette)
  for (const [key, val] of edges) {
    const b = key % NV,
      a = (key - b) / NV;
    const isSil = val === 1 || val === -1 || val === 3 || val === -3;
    if (!isSil) continue;
    segs.push(nodeOf(a), nodeOf(b));
  }
  return { pts, segs };
}

function project(
  mesh: ContourMesh,
  cam: CameraBasis,
  W: number,
  H: number,
  margin: number,
  zoom: number,
  panX: number,
  panY: number,
  lensFocalLength: number,
  lensDistortion: number,
): Projection {
  const { V } = mesh;
  const n = V.length / 3;
  const sx = new Float32Array(n),
    sy = new Float32Array(n),
    sd = new Float32Array(n);
  const { f, r, u } = cam;
  const scale = (Math.min(W, H) / 2 - margin) * zoom; // radius-1 model, rotation-stable fit
  const ox = W / 2 + (panX ?? 0),
    oy = H / 2 + (panY ?? 0);
  let dmin = Infinity,
    dmax = -Infinity;
  for (let i = 0, v = 0; i < V.length; i += 3, v++) {
    const x = V[i],
      y = V[i + 1],
      z = V[i + 2];
    const d = x * f[0] + y * f[1] + z * f[2];
    const screen = projectCameraPoint(
      x * r[0] + y * r[1] + z * r[2],
      x * u[0] + y * u[1] + z * u[2],
      d,
      scale,
      ox,
      oy,
      lensFocalLength,
      lensDistortion,
    );
    sx[v] = screen[0];
    sy[v] = screen[1]; // SVG y grows downward
    sd[v] = d;
    if (d < dmin) dmin = d;
    if (d > dmax) dmax = d;
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
    lensDistortion,
  };
}

function scalarField(
  mesh: ContourMesh,
  P: Projection,
  axis: string,
  cutAz: number,
  cutEl: number,
): ScalarField {
  const { V } = mesh;
  const n = V.length / 3;
  if (axis === 'cam') return { S: P.sd, min: P.dmin, max: P.dmax, dir: P.f };
  if (axis === 'custom') {
    const az = (cutAz * Math.PI) / 180,
      el = (cutEl * Math.PI) / 180;
    const dir: Vec3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const S = new Float32Array(n);
    let mn = Infinity,
      mx = -Infinity;
    for (let i = 0, v = 0; v < n; i += 3, v++) {
      const s = V[i] * dir[0] + V[i + 1] * dir[1] + V[i + 2] * dir[2];
      S[v] = s;
      if (s < mn) mn = s;
      if (s > mx) mx = s;
    }
    return { S, min: mn, max: mx, dir };
  }
  // the mesh is always stored Z-up, so "height" is component 2
  const comp = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const S = new Float32Array(n);
  let mn = Infinity,
    mx = -Infinity;
  for (let i = comp, v = 0; v < n; i += 3, v++) {
    const s = V[i];
    S[v] = s;
    if (s < mn) mn = s;
    if (s > mx) mx = s;
  }
  const dir: Vec3 = comp === 0 ? [1, 0, 0] : comp === 1 ? [0, 1, 0] : [0, 0, 1];
  return { S, min: mn, max: mx, dir };
}

function inverseLineGapEase(value: number, settings: ContourSettings): number {
  if (settings.gapEase === 'linear' || !settings.easeStrength) return value;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const eased = easeLineGap(
      mid,
      settings.gapEase,
      settings.easeStrength,
      settings.easeCenter,
      settings.easeCycles,
    );
    if (eased < value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function spiralContours(
  P: Projection,
  mesh: ContourMesh,
  field: ScalarField,
  settings: ContourSettings,
): SpiralSegments {
  const { V, T } = mesh;
  const count = Math.max(1, Math.round(settings.lines));
  const span = field.max - field.min || 1;
  const q = new Float32Array(V.length / 3),
    gradientValue = new Float32Array(V.length / 3);
  for (let v = 0; v < q.length; v++) {
    const position = clamp((field.S[v] - field.min) / span, 0, 1);
    gradientValue[v] = position;
    q[v] = inverseLineGapEase(position, settings);
  }

  // A polar frame around the slicing direction turns parallel levels into a
  // helicoidal field. Integer isolines of that field join across its angle seam.
  const dir = field.dir;
  const ref: Vec3 = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  let ax = ref[1] * dir[2] - ref[2] * dir[1];
  let ay = ref[2] * dir[0] - ref[0] * dir[2];
  let az = ref[0] * dir[1] - ref[1] * dir[0];
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al;
  ay /= al;
  az /= al;
  const bx = dir[1] * az - dir[2] * ay;
  const by = dir[2] * ax - dir[0] * az;
  const bz = dir[0] * ay - dir[1] * ax;
  const angle = new Float32Array(q.length);
  const radialX = new Float32Array(q.length),
    radialY = new Float32Array(q.length);
  for (let v = 0, i = 0; v < q.length; v++, i += 3) {
    const x = V[i],
      y = V[i + 1],
      z = V[i + 2];
    const rx = x * ax + y * ay + z * az,
      ry = x * bx + y * by + z * bz;
    radialX[v] = rx;
    radialY[v] = ry;
    angle[v] = Math.atan2(ry, rx) / (Math.PI * 2);
  }

  const pts: number[] = [],
    values: number[] = [],
    segs: number[] = [],
    pointIndex = new Map<string, number>();
  const unwrap = (value: number, anchor: number): number => value + Math.round(anchor - value);
  const crossesAxis = (ids: Vec3): boolean => {
    const x0 = radialX[ids[0]],
      y0 = radialY[ids[0]];
    const x1 = radialX[ids[1]],
      y1 = radialY[ids[1]];
    const x2 = radialX[ids[2]],
      y2 = radialY[ids[2]];
    const c0 = x0 * y1 - y0 * x1,
      c1 = x1 * y2 - y1 * x2,
      c2 = x2 * y0 - y2 * x0;
    const scale = Math.max(x0 * x0 + y0 * y0, x1 * x1 + y1 * y1, x2 * x2 + y2 * y2, 1e-12);
    const eps = scale * 1e-7;
    const area = c0 + c1 + c2;
    if (Math.abs(area) > eps) {
      return (c0 >= -eps && c1 >= -eps && c2 >= -eps) || (c0 <= eps && c1 <= eps && c2 <= eps);
    }
    const edgeHitsOrigin = (px: number, py: number, qx: number, qy: number): boolean => {
      const dx = qx - px,
        dy = qy - py,
        length2 = dx * dx + dy * dy;
      if (!length2) return px * px + py * py <= eps;
      const t = clamp(-(px * dx + py * dy) / length2, 0, 1);
      const ex = px + dx * t,
        ey = py + dy * t;
      return ex * ex + ey * ey <= eps;
    };
    return (
      edgeHitsOrigin(x0, y0, x1, y1) ||
      edgeHitsOrigin(x1, y1, x2, y2) ||
      edgeHitsOrigin(x2, y2, x0, y0)
    );
  };
  const pointOnEdge = (a: number, b: number, pa: number, pb: number, level: number): number => {
    const t = clamp((level - pa) / (pb - pa), 0, 1);
    let key: string;
    if (t < 1e-7) key = 'v' + a;
    else if (t > 1 - 1e-7) key = 'v' + b;
    else {
      const forward = a < b;
      const edgeT = forward ? t : 1 - t;
      key = (forward ? a + '_' + b : b + '_' + a) + '_' + Math.round(edgeT * 1e7);
    }
    let id = pointIndex.get(key);
    if (id !== undefined) return id;
    id = pts.length / 3;
    pts.push(
      P.sx[a] + (P.sx[b] - P.sx[a]) * t,
      P.sy[a] + (P.sy[b] - P.sy[a]) * t,
      P.sd[a] + (P.sd[b] - P.sd[a]) * t,
    );
    values.push(gradientValue[a] + (gradientValue[b] - gradientValue[a]) * t);
    pointIndex.set(key, id);
    return id;
  };

  for (let i = 0; i < T.length; i += 3) {
    const ids: Vec3 = [T[i], T[i + 1], T[i + 2]];
    // Polar phase is undefined where the winding axis pierces the surface.
    // Treat those triangles as branch boundaries instead of drawing arbitrary
    // segments across the singularity.
    if (crossesAxis(ids)) continue;
    const a0 = angle[ids[0]];
    const angles = [a0, unwrap(angle[ids[1]], a0), unwrap(angle[ids[2]], a0)];
    const phase = ids.map((v, j) => count * q[v] - angles[j] - 0.5);
    const first = Math.ceil(Math.min(...phase));
    const last = Math.floor(Math.max(...phase));
    for (let level = first; level <= last; level++) {
      const crossings: number[] = [];
      for (let e = 0; e < 3; e++) {
        const n = (e + 1) % 3,
          p0 = phase[e],
          p1 = phase[n];
        if ((p0 < level && p1 >= level) || (p1 < level && p0 >= level)) {
          crossings.push(pointOnEdge(ids[e], ids[n], p0, p1, level));
        }
      }
      if (crossings.length === 2 && crossings[0] !== crossings[1])
        segs.push(crossings[0], crossings[1]);
    }
  }
  return { pts, values, segs };
}

function computeLineArtInstance(
  mesh: ContourMesh,
  settings: ContourSettings,
  quick: boolean,
): InternalContourResult {
  const started = performance.now();
  const W = settings.pw,
    H = settings.ph;
  const [focalLength, distortion] = resolveLens(settings);
  const P = project(
    mesh,
    cameraBasis(settings.az, settings.el, settings.roll),
    W,
    H,
    settings.margin,
    settings.zoom,
    settings.panX,
    settings.panY,
    focalLength,
    distortion,
  );
  const offsets = mesh.lineArt!.offsets;
  const quality = quick
    ? previewCurveQuality(settings.quality, settings.previewDetail)
    : settings.quality;
  const tolerance = 0.06 * Math.pow(0.72, clamp(Math.round(quality), 1, 10) - 1);
  const palette = gradientPalette(settings);
  const pathDataByColor = palette.map(() => '');
  const runsByColor = palette.map((): Polyline[] => []);
  const runs: Polyline[] = [];
  const sourceRuns: Polyline[] = [];
  for (let runIndex = 0; runIndex + 1 < offsets.length; runIndex++) {
    const raw: Polyline = [];
    for (let point = offsets[runIndex]; point < offsets[runIndex + 1]; point++)
      raw.push(P.sx[point], P.sy[point]);
    if (raw.length >= 4) sourceRuns.push(raw);
  }
  const yarnRuns = settings.yarnCurl ? selectYarnRuns(sourceRuns, settings.yarnCutPercent) : null;
  let pathData = '',
    paths = 0,
    nodes = 0,
    salt = 0;
  for (let runIndex = 0; runIndex < sourceRuns.length; runIndex++) {
    const raw = sourceRuns[runIndex];
    const simplified = simplify(raw, tolerance);
    const styled = settings.humanizer
      ? humanizeRun(simplified.run, settings.humanizerAmount, salt++)
      : simplified.run;
    const colorIndex = settings.gradientEnabled
      ? clamp(
          Math.floor((runIndex / Math.max(1, offsets.length - 2)) * palette.length),
          0,
          palette.length - 1,
        )
      : 0;
    const cutCount = yarnRuns?.get(raw) || 0;
    const processedRuns = cutCount
      ? yarnCutRun(styled, hashPolyline(raw), settings.yarnCurlSize, cutCount)
      : [styled];
    const clippedRuns = processedRuns.flatMap((run) => clipArtworkRun(run, settings, W, H));
    for (const run of clippedRuns) {
      if (run.length < 4) continue;
      const data = serialiseRun(run, quality, sharpVertices(run));
      pathData += data;
      pathDataByColor[colorIndex] += data;
      if (!quick || settings.topographicMap) runs.push(run);
      if (!quick) runsByColor[colorIndex].push(run);
      paths++;
      nodes += run.length / 2;
    }
  }
  const blueprintGeometry: BlueprintGeometry = {
    fieldMin: 0,
    fieldMax: 0,
    direction: [0, 0, 1],
    vertices: mesh.V.length / 3,
    triangles: 0,
  };
  const blueprint = blueprintDocument(settings, W, H, blueprintGeometry);
  const mapAnnotations = settings.topographicMap
    ? createMapAnnotations(runs, {
        width: W,
        height: H,
        margin: settings.margin,
        lineCount: settings.lines,
        strokeWidth: settings.sw,
        color: effectiveAnnotationColor(settings),
        backgroundColor: effectivePaperColor(settings),
        title: settings.documentTitle,
      })
    : null;
  const attrs = `fill="none" stroke-width="${settings.sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const dash = settings.halftone
    ? `stroke-dasharray="${fmt(settings.halftoneSize * 0.5)} ${fmt(settings.halftoneSize * 0.5)}"`
    : '';
  const baseArtwork = pathDataByColor
    .map((data, index) =>
      data ? `<path d="${data}" stroke="${palette[index]}" ${dash} ${attrs}/>` : '',
    )
    .join('');
  let artwork: string,
    renderedPaths = paths,
    renderedNodes = nodes;
  if (settings.chroma) {
    artwork = chromaticLayers(
      settings,
      W,
      H,
      (color) => `<path d="${pathData}" stroke="${color}" ${dash} ${attrs}/>`,
      settings.gradientEnabled ? baseArtwork : '',
    );
    renderedPaths *= settings.gradientEnabled ? 4 : 3;
    renderedNodes *= settings.gradientEnabled ? 4 : 3;
  } else {
    artwork = baseArtwork;
  }
  if (mapAnnotations) {
    artwork += mapAnnotations.svg;
    renderedPaths += mapAnnotations.paths;
    renderedNodes += mapAnnotations.nodes;
  }
  const maskOutline = maskOutlineArtwork(settings, W, H, quality);
  renderedPaths += maskOutline.runs.length;
  renderedNodes += maskOutline.runs.reduce((sum, run) => sum + run.length / 2, 0);
  artwork = `${documentBackdrop(settings, W, H, blueprint)}${maskArtwork(settings, W, H, artwork)}${maskOutline.svg}${documentOverlay(settings, blueprint)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
${artwork}
</svg>`;
  const toolpaths: ContourToolpathGroup[] = !quick
    ? [
        ...runsByColor.flatMap((colorRuns, index) =>
          colorRuns.length
            ? [
                {
                  color: palette[index],
                  label: settings.gradientEnabled
                    ? `gradient colour ${index + 1}`
                    : 'SVG centreline',
                  runs: colorRuns,
                },
              ]
            : [],
        ),
        ...(mapAnnotations?.runs.length
          ? [
              {
                color: effectiveAnnotationColor(settings),
                label: 'topographic annotations',
                runs: mapAnnotations.runs.flatMap((run) => clipArtworkRun(run, settings, W, H)),
              },
            ]
          : []),
      ]
    : [];
  if (!quick && maskOutline.runs.length) {
    const color = effectiveAnnotationColor(settings);
    const matching = toolpaths.find((group) => group.color.toLowerCase() === color.toLowerCase());
    if (matching) matching.runs.push(...maskOutline.runs);
    else toolpaths.push({ color, label: 'mask outline', runs: maskOutline.runs });
  }
  return {
    svg,
    toolpaths,
    paths: renderedPaths,
    nodes: renderedNodes,
    bytes: new TextEncoder().encode(svg).byteLength,
    ms: performance.now() - started,
    W,
    H,
    quick,
    blueprintGeometry,
  };
}

function computeContourInstance(
  mesh: ContourMesh,
  settings: ContourSettings,
  quick: boolean,
): InternalContourResult {
  if (mesh.lineArt) return computeLineArtInstance(mesh, settings, quick);
  const t0 = performance.now();
  const W = settings.pw,
    H = settings.ph;
  const cam = cameraBasis(settings.az, settings.el, settings.roll);
  const [focalLength, distortion] = resolveLens(settings);
  const P = project(
    mesh,
    cam,
    W,
    H,
    settings.margin,
    settings.zoom,
    settings.panX,
    settings.panY,
    focalLength,
    distortion,
  );
  const field = scalarField(mesh, P, settings.axis, settings.cutAz, settings.cutEl);
  const blueprintGeometry = {
    fieldMin: field.min,
    fieldMax: field.max,
    direction: field.dir,
    vertices: mesh.V.length / 3,
    triangles: mesh.T.length / 3,
  };
  let vis: VisibilityTest | null = null,
    visOutline: VisibilityTest | null = null,
    step = 0.6;
  if (settings.hide) {
    const res = quick ? 320 : 1100;
    const D = buildDepth(P, mesh.T, W, H, res);
    const depthRange = P.dmax - P.dmin || 1;
    vis = makeVisibleTest(D, depthRange * 0.006 + 1e-6, 1);
    // outlines sit exactly on the depth cliff, so they need a wider, kinder test
    visOutline = makeVisibleTest(D, depthRange * 0.03 + 1e-6, 2);
    step = Math.max(0.25, W / D.rw);
  }

  const palette = gradientPalette(settings);
  const toneBandCount = settings.halftone ? 12 : 1;
  const lineWeightMode = settings.lineWeightMode || 'uniform';
  const weightBandCount = lineWeightMode === 'uniform' ? 1 : lineWeightMode === 'index' ? 2 : 8;
  const weightValue = (position: number, index: number): number => {
    const interval = clamp(Math.round(settings.lineWeightInterval || 5), 2, 20);
    if (lineWeightMode === 'index') return (index + 1) % interval === 0 ? 1 : 0;
    if (lineWeightMode === 'wave')
      return 0.5 - 0.5 * Math.cos(((index + 1) / interval) * Math.PI * 2);
    if (lineWeightMode === 'center') return 1 - Math.abs(position * 2 - 1);
    return 0;
  };
  const weightBand = (position: number, index: number): number =>
    clamp(Math.round(weightValue(position, index) * (weightBandCount - 1)), 0, weightBandCount - 1);
  const toneValue = (position: number): number => {
    const cycles = clamp(Math.round(settings.halftoneCycles || 1), 1, 8);
    return 0.5 + 0.5 * Math.sin(position * cycles * Math.PI * 2 - Math.PI / 2);
  };
  const toneBand = (position: number): number =>
    clamp(Math.floor(toneValue(position) * toneBandCount), 0, toneBandCount - 1);
  const out: Polyline[][][][] = Array.from({ length: palette.length }, (): Polyline[][][] =>
    Array.from({ length: toneBandCount }, (): Polyline[][] =>
      Array.from({ length: weightBandCount }, (): Polyline[] => []),
    ),
  );
  const outlineOut: Polyline[] = [];
  const N = quick ? previewLineCount(settings.lines, settings.previewDetail) : settings.lines;
  const quality = clamp(
    Math.round(
      quick ? previewCurveQuality(settings.quality, settings.previewDetail) : settings.quality,
    ),
    1,
    10,
  );
  const curveStrength = (quality - 1) / 9;
  if (settings.spiral && !settings.divergence && lineWeightMode === 'uniform') {
    const previewSettings = quick && N !== settings.lines ? { ...settings, lines: N } : settings;
    const { pts, values, segs } = spiralContours(P, mesh, field, previewSettings);
    if (segs.length)
      for (const poly of chain(pts, segs)) {
        if (settings.gradientEnabled) {
          for (const chunk of splitPolylineByBands(poly, pts, values, palette.length)) {
            const indexes = Array.from({ length: chunk.pts.length / 3 }, (_, i) => i);
            const position = (chunk.band + 0.5) / palette.length;
            emitPath(
              indexes,
              chunk.pts,
              vis,
              step,
              out[chunk.band][settings.halftone ? toneBand(position) : 0][0],
            );
          }
        } else if (settings.halftone) {
          const tones = Float32Array.from(values, toneValue);
          for (const chunk of splitPolylineByBands(poly, pts, tones, toneBandCount)) {
            const indexes = Array.from({ length: chunk.pts.length / 3 }, (_, i) => i);
            emitPath(indexes, chunk.pts, vis, step, out[0][chunk.band][0]);
          }
        } else emitPath(poly, pts, vis, step, out[0][0][0]);
      }
  } else {
    const slices = contourSlices(mesh, settings, field, N, curveStrength);
    for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex++) {
      const { position, worldPoints, polylines } = slices[sliceIndex];
      if (!polylines.length) continue;
      const pts = projectWorldPoints(worldPoints, P);
      const band = settings.gradientEnabled
        ? clamp(Math.floor(position * palette.length), 0, palette.length - 1)
        : 0;
      const tone = settings.halftone ? toneBand(position) : 0;
      const weight = weightBand(position, sliceIndex);
      for (const poly of polylines) emitPath(poly, pts, vis, step, out[band][tone][weight]);
    }
  }
  if (settings.sil) {
    const { pts, segs } = silhouetteEdges(mesh, P);
    if (segs.length) {
      // The outline lies on the rasterized depth cliff. Heal only sub-pixel-scale
      // visibility misses. Convex meshes cannot self-occlude, so their outline
      // stays intact even when edge-on triangles collapse onto the depth cliff.
      const outlineVisibility = visOutline && !isConvexMesh(mesh) ? visOutline : null;
      for (const poly of chain(pts, segs))
        emitPath(poly, pts, outlineVisibility, step, outlineOut, step * 2.5);
    }
  }

  // ---- serialise: RDP concentrates anchors where deviation is greatest;
  // curved spans use Béziers while flat spans remain compact straight lines.
  const tolerance = 0.06 * Math.pow(0.72, quality - 1);
  const sourceContourRuns = out.flatMap((toneGroups) =>
    toneGroups.flatMap((weightGroups) => weightGroups.flat()),
  );
  const yarnRuns = settings.yarnCurl
    ? selectYarnRuns(sourceContourRuns, settings.yarnCutPercent)
    : null;
  let nodes = 0,
    paths = 0;
  let humanizerSalt = 0;
  const serialiseGroup = (runs: Polyline[]): SerialisedGroup => {
    let d = '';
    const plotRuns: Polyline[] = [];
    for (const raw of runs) {
      const simplified = simplify(raw, tolerance);
      const run = settings.humanizer
        ? humanizeRun(simplified.run, settings.humanizerAmount, humanizerSalt++)
        : simplified.run;
      if (run.length < 4) continue;
      const cutCount = yarnRuns?.get(raw) || 0;
      const processedRuns = cutCount
        ? yarnCutRun(run, hashPolyline(raw), settings.yarnCurlSize, cutCount)
        : [run];
      const clippedRuns = processedRuns.flatMap((candidate) =>
        clipArtworkRun(candidate, settings, W, H),
      );
      for (const clipped of clippedRuns) {
        if (clipped.length < 4) continue;
        const sharp =
          clipped === run && !settings.humanizer ? simplified.sharp : sharpVertices(clipped);
        d += serialiseRun(clipped, quality, sharp);
        if (!quick || settings.topographicMap) plotRuns.push(clipped);
        nodes += clipped.length / 2;
        paths++;
      }
    }
    return { d, runs: plotRuns };
  };
  const colorPaths: string[][][] = [];
  const toolpaths: ContourToolpathGroup[] = [];
  const annotationSourceRuns: Polyline[] = [];
  for (let index = 0; index < out.length; index++) {
    const pathsForColor: string[][] = [];
    const runsForColor: Polyline[] = [];
    for (const toneGroup of out[index]) {
      const pathsForTone: string[] = [];
      for (const weightGroup of toneGroup) {
        const group = serialiseGroup(weightGroup);
        pathsForTone.push(group.d);
        runsForColor.push(...group.runs);
        annotationSourceRuns.push(...group.runs);
      }
      pathsForColor.push(pathsForTone);
    }
    colorPaths.push(pathsForColor);
    if (!quick && runsForColor.length) {
      toolpaths.push({
        color: palette[index],
        label: settings.gradientEnabled ? `gradient colour ${index + 1}` : 'contours',
        runs: runsForColor,
      });
    }
  }
  const outlineGroup = serialiseGroup(outlineOut);
  const outlinePath = outlineGroup.d;
  annotationSourceRuns.push(...outlineGroup.runs);
  if (!quick && outlineGroup.runs.length) {
    const matching = toolpaths.find(
      (group) => group.color.toLowerCase() === settings.color.toLowerCase(),
    );
    if (matching) matching.runs.push(...outlineGroup.runs);
    else toolpaths.push({ color: settings.color, label: 'silhouette', runs: outlineGroup.runs });
  }
  const strokeWidth = (weight: number): number => {
    if (weightBandCount === 1) return settings.sw;
    const amount = clamp((settings.lineWeightAmount || 0) / 100, 0, 3);
    return settings.sw * (1 + (weight / (weightBandCount - 1)) * amount);
  };
  const blueprint = blueprintDocument(settings, W, H, blueprintGeometry);
  const mapAnnotations = settings.topographicMap
    ? createMapAnnotations(annotationSourceRuns, {
        width: W,
        height: H,
        margin: settings.margin,
        lineCount: N,
        strokeWidth: settings.sw,
        color: effectiveAnnotationColor(settings),
        backgroundColor: effectivePaperColor(settings),
        title: settings.documentTitle,
      })
    : null;
  const clippedAnnotationRuns =
    mapAnnotations?.runs.flatMap((run) => clipArtworkRun(run, settings, W, H)) ?? [];
  if (!quick && clippedAnnotationRuns.length) {
    const matching = toolpaths.find(
      (group) => group.color.toLowerCase() === settings.color.toLowerCase(),
    );
    if (matching) matching.runs.push(...clippedAnnotationRuns);
    else
      toolpaths.push({
        color: settings.color,
        label: 'topographic annotations',
        runs: clippedAnnotationRuns,
      });
  }
  const maskOutline = maskOutlineArtwork(settings, W, H, quality);
  if (!quick && maskOutline.runs.length) {
    const color = effectiveAnnotationColor(settings);
    const matching = toolpaths.find((group) => group.color.toLowerCase() === color.toLowerCase());
    if (matching) matching.runs.push(...maskOutline.runs);
    else toolpaths.push({ color, label: 'mask outline', runs: maskOutline.runs });
  }
  let artwork: string,
    renderedPaths = paths,
    renderedNodes = nodes;
  const attrs = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const spacing = clamp(settings.halftoneSize || 2.4, 0.5, 8);
  const contrast = clamp((settings.halftoneContrast || 0) / 100, 0, 1);
  const halftoneAttrs = (tone: number, width: number): string => {
    if (!settings.halftone) return '';
    const value = (tone + 0.5) / toneBandCount;
    const ratio = clamp(0.5 + (value - 0.5) * contrast * 1.7, 0.07, 0.93);
    const dash = Math.max(0.01, spacing * ratio - width * 0.7);
    const gap = Math.max(width * 0.65, spacing - dash);
    const offset = (tone / toneBandCount) * spacing;
    return `stroke-dasharray="${fmt(dash)} ${fmt(gap)}" stroke-dashoffset="${fmt(offset)}"`;
  };
  const pathsWithColor = (color: string): string =>
    colorPaths
      .flatMap((tonePaths) =>
        tonePaths.flatMap((weightPaths, tone) =>
          weightPaths.map((d, weight) => {
            const width = strokeWidth(weight);
            return d
              ? `<path d="${d}" stroke="${color}" stroke-width="${fmt(width)}" ${halftoneAttrs(tone, width)}/>`
              : '';
          }),
        ),
      )
      .join('') +
    (outlinePath
      ? `<path d="${outlinePath}" stroke="${color}" stroke-width="${fmt(settings.sw)}"/>`
      : '');
  const groups = colorPaths
    .map((tonePaths, i) =>
      tonePaths
        .map((weightPaths, tone) =>
          weightPaths
            .map((d, weight) => {
              const width = strokeWidth(weight);
              return d
                ? `<path d="${d}" stroke="${palette[i]}" stroke-width="${fmt(width)}" ${halftoneAttrs(tone, width)} ${attrs}/>`
                : '';
            })
            .join('\n'),
        )
        .join('\n'),
    )
    .join('\n');
  const outlineColor = settings.blueprint && !settings.gradientEnabled ? '#f5f9ff' : settings.color;
  const outline = outlinePath
    ? `<path d="${outlinePath}" stroke="${outlineColor}" stroke-width="${fmt(settings.sw)}" ${attrs}/>`
    : '';
  const baseArtwork = `${groups}${outline}`;
  const contours = settings.chroma
    ? chromaticLayers(settings, W, H, pathsWithColor, settings.gradientEnabled ? baseArtwork : '')
    : baseArtwork;
  if (settings.chroma) {
    renderedPaths *= settings.gradientEnabled ? 4 : 3;
    renderedNodes *= settings.gradientEnabled ? 4 : 3;
  }
  artwork = contours;
  if (mapAnnotations) {
    artwork += mapAnnotations.svg;
    renderedPaths += mapAnnotations.paths;
    renderedNodes += mapAnnotations.nodes;
  }
  renderedPaths += maskOutline.runs.length;
  renderedNodes += maskOutline.runs.reduce((sum, run) => sum + run.length / 2, 0);
  artwork = `${documentBackdrop(settings, W, H, blueprint)}${maskArtwork(settings, W, H, artwork)}${maskOutline.svg}${documentOverlay(settings, blueprint)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
${artwork}
</svg>`;
  const ms = performance.now() - t0;
  return {
    svg,
    toolpaths,
    paths: renderedPaths,
    nodes: renderedNodes,
    bytes: new TextEncoder().encode(svg).byteLength,
    ms,
    W,
    H,
    quick,
    blueprintGeometry,
  };
}

function svgArtwork(svg: string): string {
  const start = svg.indexOf('>');
  const end = svg.lastIndexOf('</svg>');
  return start >= 0 && end > start ? svg.slice(start + 1, end).trim() : '';
}

export function computeContours(
  mesh: ContourMesh,
  settings: ContourSettings,
  quick: boolean,
): ContourResult {
  const hexColor = /^#[0-9a-f]{6}$/i;
  const validTargets = (targets: MorphTargets): Array<[string, MorphValue]> =>
    Object.entries(targets || {}).filter(([key, value]) =>
      key === 'color'
        ? hexColor.test(String(value)) &&
          hexColor.test(String((settings as unknown as Record<string, unknown>)[key]))
        : Number.isFinite(Number(value)) &&
          Number.isFinite(Number((settings as unknown as Record<string, unknown>)[key])),
    );
  const targetsX = settings.morphEnabled ? validTargets(settings.morphTargets) : [];
  const targetsY =
    settings.morphEnabled && settings.morphSecondEnabled
      ? validTargets(settings.morphTargets2)
      : [];
  if (!targetsX.length && !targetsY.length) return computeContourInstance(mesh, settings, quick);

  const started = performance.now();
  const stepsX = targetsX.length
    ? quick
      ? previewMorphSteps(
          clamp(Math.round(settings.morphSteps || 2), 2, 24),
          settings.previewDetail,
        )
      : clamp(Math.round(settings.morphSteps || 2), 2, 24)
    : 1;
  const stepsY = targetsY.length
    ? quick
      ? previewMorphSteps(
          clamp(Math.round(settings.morphStepsY || 2), 2, 24),
          settings.previewDetail,
        )
      : clamp(Math.round(settings.morphStepsY || 2), 2, 24)
    : 1;
  const targetsXByKey = new Map(targetsX),
    targetsYByKey = new Map(targetsY);
  const targetKeys = new Set([...targetsXByKey.keys(), ...targetsYByKey.keys()]);
  const results: MorphContourResult[] = [];
  for (let y = 0; y < stepsY; y++)
    for (let x = 0; x < stepsX; x++) {
      const amountX = stepsX === 1 ? 0 : x / (stepsX - 1);
      const amountY = stepsY === 1 ? 0 : y / (stepsY - 1);
      const instance: ContourSettings = { ...settings, suppressBackground: true };
      if (results.length && instance.topographicMap) instance.topographicMap = false;
      const dynamicInstance = instance as unknown as Record<string, unknown>;
      const dynamicSettings = settings as unknown as Record<string, unknown>;
      for (const key of targetKeys) {
        const targetX = targetsXByKey.get(key),
          targetY = targetsYByKey.get(key);
        if (key === 'color') {
          const startColor = (settings.color.slice(1).match(/../g) ?? []).map((value) =>
            parseInt(value, 16),
          );
          const colorX = targetX
            ? (String(targetX).slice(1).match(/../g) ?? []).map((value) => parseInt(value, 16))
            : startColor;
          const colorY = targetY
            ? (String(targetY).slice(1).match(/../g) ?? []).map((value) => parseInt(value, 16))
            : startColor;
          instance.color =
            '#' +
            startColor
              .map((value, channel) =>
                clamp(
                  Math.round(
                    value +
                      (colorX[channel] - value) * amountX +
                      (colorY[channel] - value) * amountY,
                  ),
                  0,
                  255,
                )
                  .toString(16)
                  .padStart(2, '0'),
              )
              .join('');
          continue;
        }
        const start = Number(dynamicSettings[key]);
        dynamicInstance[key] =
          start +
          (targetX === undefined ? 0 : (Number(targetX) - start) * amountX) +
          (targetY === undefined ? 0 : (Number(targetY) - start) * amountY);
      }
      results.push({ ...computeContourInstance(mesh, instance, quick), morphX: x, morphY: y });
    }

  const W = settings.pw,
    H = settings.ph;
  const blueprint = blueprintDocument(settings, W, H, results[0]?.blueprintGeometry);
  const background = documentBackdrop(settings, W, H, blueprint);
  const layers = results
    .map(
      (result) =>
        `<g data-morph-x-step="${result.morphX + 1}" data-morph-y-step="${result.morphY + 1}" data-morph-x="${stepsX === 1 ? 0 : fmt(result.morphX / (stepsX - 1))}" data-morph-y="${stepsY === 1 ? 0 : fmt(result.morphY / (stepsY - 1))}">${svgArtwork(result.svg)}</g>`,
    )
    .join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
${background}${layers}${documentOverlay(settings, blueprint)}
</svg>`;

  const groups = new Map<string, ContourToolpathGroup>();
  for (const result of results)
    for (const group of result.toolpaths) {
      const key = group.color.toLowerCase();
      const existing = groups.get(key);
      if (existing) existing.runs.push(...group.runs);
      else
        groups.set(key, { color: group.color, label: 'morphed contours', runs: [...group.runs] });
    }
  return {
    svg,
    toolpaths: [...groups.values()],
    paths: results.reduce((sum, result) => sum + result.paths, 0),
    nodes: results.reduce((sum, result) => sum + result.nodes, 0),
    bytes: new TextEncoder().encode(svg).byteLength,
    ms: performance.now() - started,
    W,
    H,
    quick,
  };
}
