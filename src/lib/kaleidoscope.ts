type Polyline = number[];

export interface KaleidoscopeSettings {
  kaleidoscope: boolean;
  kaleidoscopeSegments: number;
  kaleidoscopeRotation: number;
}

const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function samePoint(run: Polyline, x: number, y: number): boolean {
  return (
    run.length >= 2 &&
    Math.abs(run[run.length - 2] - x) <= EPSILON &&
    Math.abs(run[run.length - 1] - y) <= EPSILON
  );
}

function clipRunToWedge(
  run: Polyline,
  centerX: number,
  centerY: number,
  startAngle: number,
  wedgeAngle: number,
): Polyline[] {
  if (run.length < 4) return [];
  const startX = Math.cos(startAngle);
  const startY = Math.sin(startAngle);
  const endX = Math.cos(startAngle + wedgeAngle);
  const endY = Math.sin(startAngle + wedgeAngle);
  const constraints = [
    (x: number, y: number) => startX * (y - centerY) - startY * (x - centerX),
    (x: number, y: number) => endY * (x - centerX) - endX * (y - centerY),
  ];
  const clipped: Polyline[] = [];
  let current: Polyline | null = null;

  for (let index = 0; index + 3 < run.length; index += 2) {
    const x0 = run[index];
    const y0 = run[index + 1];
    const x1 = run[index + 2];
    const y1 = run[index + 3];
    let enter = 0;
    let leave = 1;
    let visible = true;
    for (const constraint of constraints) {
      const value0 = constraint(x0, y0);
      const value1 = constraint(x1, y1);
      if (value0 < -EPSILON && value1 < -EPSILON) {
        visible = false;
        break;
      }
      if (value0 < -EPSILON || value1 < -EPSILON) {
        const crossing = value0 / (value0 - value1);
        if (value0 < -EPSILON) enter = Math.max(enter, crossing);
        else leave = Math.min(leave, crossing);
      }
    }
    if (!visible || enter > leave + EPSILON) {
      current = null;
      continue;
    }

    const ax = x0 + (x1 - x0) * enter;
    const ay = y0 + (y1 - y0) * enter;
    const bx = x0 + (x1 - x0) * leave;
    const by = y0 + (y1 - y0) * leave;
    if (!current || !samePoint(current, ax, ay)) {
      current = [ax, ay];
      clipped.push(current);
    }
    if (!samePoint(current, bx, by)) current.push(bx, by);
  }

  return clipped.filter((candidate) => candidate.length >= 4);
}

function transformSector(
  run: Polyline,
  centerX: number,
  centerY: number,
  startAngle: number,
  wedgeAngle: number,
  sector: number,
): Polyline {
  const reflected = sector % 2 === 1;
  const rotation = reflected ? (sector + 1) * wedgeAngle : sector * wedgeAngle;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const transformed: Polyline = [];
  for (let index = 0; index < run.length; index += 2) {
    const localX = run[index] - centerX;
    const localY = run[index + 1] - centerY;
    const sourceX = reflected
      ? localX * Math.cos(2 * startAngle) + localY * Math.sin(2 * startAngle)
      : localX;
    const sourceY = reflected
      ? localX * Math.sin(2 * startAngle) - localY * Math.cos(2 * startAngle)
      : localY;
    transformed.push(
      centerX + sourceX * cos - sourceY * sin,
      centerY + sourceX * sin + sourceY * cos,
    );
  }
  return transformed;
}

/** Clips a polyline to one radial wedge, then mirrors it around the artboard centre. */
export function kaleidoscopeRun(
  run: Polyline,
  settings: KaleidoscopeSettings,
  width: number,
  height: number,
): Polyline[] {
  if (!settings.kaleidoscope) return [run];
  const segments = clamp(Math.round(settings.kaleidoscopeSegments || 6), 3, 24);
  const startAngle = ((Number(settings.kaleidoscopeRotation) || 0) * Math.PI) / 180;
  const wedgeAngle = (Math.PI * 2) / segments;
  const centerX = width / 2;
  const centerY = height / 2;
  const sourceRuns = clipRunToWedge(run, centerX, centerY, startAngle, wedgeAngle);
  return sourceRuns.flatMap((source) =>
    Array.from({ length: segments }, (_, sector) =>
      transformSector(source, centerX, centerY, startAngle, wedgeAngle, sector),
    ),
  );
}
