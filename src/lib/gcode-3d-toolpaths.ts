export type MachinePoint = {
  x: number;
  y: number;
  z: number;
  pressure: number;
};

export type MachineStroke = {
  points: MachinePoint[];
  sourceRun: number;
  reversed: boolean;
};

export type MachineOperation =
  | { kind: 'travel'; point: MachinePoint }
  | { kind: 'stroke'; stroke: MachineStroke }
  | { kind: 'pen-change'; color: string };

export type PreparedMachineGroup = {
  color: string;
  runs: number[][][];
  runWeights?: number[];
};

export type SurfaceCompensation =
  | { mode: 'off' }
  | {
      mode: 'plane';
      originOffset: number;
      xOffset: number;
      yOffset: number;
      width: number;
      height: number;
    };

export type UunaExpressiveMotion = {
  enabled: boolean;
  penAngle: number;
  tiltDirection: number;
  tipCompensation: boolean;
  contactZ: number;
  maximumPressDepth: number;
  mode: 'constant' | 'tapered' | 'modulated' | 'curvature';
  leadIn: number;
  leadOut: number;
  modulationDepth: number;
  modulationPeriod: number;
  modulationPhase: number;
  curvatureRelief: number;
  preserveStrokeDirection: boolean;
  nibWidth: number;
  lineWeightPressure: boolean;
  surfaceCompensation: SurfaceCompensation;
};

export const EXPRESSIVE_RESAMPLE_STEP = 1;
export const MINIMUM_PEN_ANGLE = 15;

export function defaultUunaExpressiveMotion(contactZ = -3): UunaExpressiveMotion {
  return {
    enabled: false,
    penAngle: 90,
    tiltDirection: 0,
    tipCompensation: true,
    contactZ,
    maximumPressDepth: 0,
    mode: 'constant',
    leadIn: 2,
    leadOut: 2,
    modulationDepth: 0,
    modulationPeriod: 20,
    modulationPhase: 0,
    curvatureRelief: 0,
    preserveStrokeDirection: true,
    nibWidth: 0,
    lineWeightPressure: false,
    surfaceCompensation: { mode: 'off' },
  };
}

/** Build the Phase 1 constant-contact operation stream from already ordered machine-space runs. */
export function createConstantContactOperations(
  groups: PreparedMachineGroup[],
  penUp: number,
  contactZ: number,
): MachineOperation[] {
  const operations: MachineOperation[] = [];
  let sourceRun = 0;
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) operations.push({ kind: 'pen-change', color: group.color });
    for (const run of group.runs) {
      const [start] = run;
      if (!start) continue;
      operations.push({
        kind: 'travel',
        point: { x: start[0], y: start[1], z: penUp, pressure: 0 },
      });
      operations.push({
        kind: 'stroke',
        stroke: {
          sourceRun,
          reversed: false,
          points: run.map(([x, y]) => ({ x, y, z: contactZ, pressure: 0 })),
        },
      });
      sourceRun += 1;
    }
  });
  return operations;
}

type ExpressiveOperationOptions = Pick<
  UunaExpressiveMotion,
  | 'contactZ'
  | 'curvatureRelief'
  | 'leadIn'
  | 'leadOut'
  | 'lineWeightPressure'
  | 'maximumPressDepth'
  | 'mode'
  | 'modulationDepth'
  | 'modulationPeriod'
  | 'modulationPhase'
  | 'penAngle'
  | 'surfaceCompensation'
  | 'tiltDirection'
  | 'tipCompensation'
>;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function compensateAngledTip(
  x: number,
  y: number,
  z: number,
  contactZ: number,
  penAngle: number,
  tiltDirection: number,
  enabled: boolean,
): readonly [number, number] {
  if (!enabled) return [x, y];
  const angle = clamp(finiteOr(penAngle, 90), MINIMUM_PEN_ANGLE, 90);
  if (angle >= 89.999) return [x, y];
  const pressDepth = Math.max(0, finiteOr(contactZ, 0) - finiteOr(z, contactZ));
  const offset = pressDepth / Math.tan((angle * Math.PI) / 180);
  const direction = (finiteOr(tiltDirection, 0) * Math.PI) / 180;
  return [x - offset * Math.cos(direction), y - offset * Math.sin(direction)];
}

export function surfaceCorrectionAt(x: number, y: number, surface: SurfaceCompensation): number {
  if (surface.mode === 'off') return 0;
  const origin = finiteOr(surface.originOffset, 0);
  const width = finiteOr(surface.width, 0);
  const height = finiteOr(surface.height, 0);
  if (width <= 0 || height <= 0) return origin;
  return (
    origin +
    (finiteOr(surface.xOffset, origin) - origin) * (finiteOr(x, 0) / width) +
    (finiteOr(surface.yOffset, origin) - origin) * (finiteOr(y, 0) / height)
  );
}

export function surfaceCorrectionRange(
  surface: SurfaceCompensation,
): readonly [minimum: number, maximum: number] {
  if (surface.mode === 'off') return [0, 0];
  const origin = finiteOr(surface.originOffset, 0);
  const x = finiteOr(surface.xOffset, origin);
  const y = finiteOr(surface.yOffset, origin);
  const opposite = x + y - origin;
  return [Math.min(origin, x, y, opposite), Math.max(origin, x, y, opposite)];
}

export function safePenUpForSurface(penUp: number, surface: SurfaceCompensation): number {
  return finiteOr(penUp, 0) + surfaceCorrectionRange(surface)[1];
}

export function machinePointForPressure(
  x: number,
  y: number,
  pressure: number,
  options: ExpressiveOperationOptions,
): MachinePoint {
  const normalizedPressure = clamp(finiteOr(pressure, 0), 0, 1);
  const contactZ =
    finiteOr(options.contactZ, -3) + surfaceCorrectionAt(x, y, options.surfaceCompensation);
  const maximumPressDepth = Math.max(0, finiteOr(options.maximumPressDepth, 0));
  const z = contactZ - normalizedPressure * maximumPressDepth;
  const [compensatedX, compensatedY] = compensateAngledTip(
    x,
    y,
    z,
    contactZ,
    options.penAngle,
    options.tiltDirection,
    options.tipCompensation,
  );
  return { x: compensatedX, y: compensatedY, z, pressure: normalizedPressure };
}

function resampleRun(run: number[][], maximumStep = EXPRESSIVE_RESAMPLE_STEP) {
  if (run.length < 2) return { points: run, distances: run.map(() => 0), length: 0 };
  const points: number[][] = [[run[0][0], run[0][1]]];
  const distances = [0];
  let travelled = 0;
  for (let index = 1; index < run.length; index += 1) {
    const from = run[index - 1];
    const to = run[index];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length <= 0) continue;
    const pieces = Math.max(1, Math.ceil(length / maximumStep));
    for (let piece = 1; piece <= pieces; piece += 1) {
      const t = piece / pieces;
      travelled += length / pieces;
      points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
      distances.push(travelled);
    }
  }
  return { points, distances, length: travelled };
}

function taperedPressure(
  distance: number,
  length: number,
  requestedLeadIn: number,
  requestedLeadOut: number,
): number {
  if (length <= 0) return 0;
  let leadIn = Math.max(0, finiteOr(requestedLeadIn, 0));
  let leadOut = Math.max(0, finiteOr(requestedLeadOut, 0));
  const requestedTotal = leadIn + leadOut;
  if (requestedTotal > length) {
    const scale = length / requestedTotal;
    leadIn *= scale;
    leadOut *= scale;
  }
  const entering = leadIn <= 0 ? 1 : smoothstep(distance / leadIn);
  const leaving = leadOut <= 0 ? 1 : smoothstep((length - distance) / leadOut);
  return Math.min(entering, leaving);
}

function modulatedPressure(distance: number, period: number, depth: number, phase: number): number {
  const wavelength = Math.max(EXPRESSIVE_RESAMPLE_STEP, finiteOr(period, 20));
  const amount = clamp(finiteOr(depth, 0), 0, 1);
  const radians = (distance / wavelength) * Math.PI * 2 + (finiteOr(phase, 0) * Math.PI) / 180;
  const wave = 0.5 - 0.5 * Math.cos(radians);
  return 1 - amount * wave;
}

function curvaturePressure(points: number[][], index: number, relief: number): number {
  if (index <= 0 || index >= points.length - 1) return 1;
  const previous = points[index - 1];
  const point = points[index];
  const next = points[index + 1];
  const incoming = Math.atan2(point[1] - previous[1], point[0] - previous[0]);
  const outgoing = Math.atan2(next[1] - point[1], next[0] - point[0]);
  const turn = Math.abs(Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming)));
  const response = smoothstep(turn / (Math.PI / 2));
  return 1 - clamp(finiteOr(relief, 0), 0, 1) * response;
}

/** Build expressive operations from ordered machine-space runs using final-path arc length. */
export function createExpressiveOperations(
  groups: PreparedMachineGroup[],
  penUp: number,
  options: ExpressiveOperationOptions,
): MachineOperation[] {
  if (
    options.mode === 'constant' &&
    options.surfaceCompensation.mode === 'off' &&
    !options.lineWeightPressure
  )
    return createConstantContactOperations(groups, penUp, finiteOr(options.contactZ, -3));

  const operations: MachineOperation[] = [];
  let sourceRun = 0;
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) operations.push({ kind: 'pen-change', color: group.color });
    for (const [runIndex, run] of group.runs.entries()) {
      const sampled = resampleRun(run);
      const [start] = sampled.points;
      if (!start || sampled.points.length < 2) continue;
      operations.push({
        kind: 'travel',
        point: { x: start[0], y: start[1], z: penUp, pressure: 0 },
      });
      operations.push({
        kind: 'stroke',
        stroke: {
          sourceRun,
          reversed: false,
          points: sampled.points.map(([x, y], index) => {
            const envelope = taperedPressure(
              sampled.distances[index],
              sampled.length,
              options.leadIn,
              options.leadOut,
            );
            const behavior =
              options.mode === 'modulated'
                ? modulatedPressure(
                    sampled.distances[index],
                    options.modulationPeriod,
                    options.modulationDepth,
                    options.modulationPhase,
                  )
                : options.mode === 'curvature'
                  ? curvaturePressure(sampled.points, index, options.curvatureRelief)
                  : 1;
            const weight = options.lineWeightPressure
              ? clamp(finiteOr(group.runWeights?.[runIndex] ?? 0, 0), 0, 1)
              : 1;
            return machinePointForPressure(
              x,
              y,
              options.mode === 'constant' && !options.lineWeightPressure
                ? 0
                : envelope * behavior * weight,
              options,
            );
          }),
        },
      });
      sourceRun += 1;
    }
  });
  return operations;
}
