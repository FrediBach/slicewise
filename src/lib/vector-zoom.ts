export type VectorZoomShape = 'rectangle' | 'circle';
export type VectorZoomCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface VectorZoomSettings {
  vectorZoom1Enabled?: boolean;
  vectorZoom1Shape?: VectorZoomShape;
  vectorZoom1CenterX?: number;
  vectorZoom1CenterY?: number;
  vectorZoom1Width?: number;
  vectorZoom1Height?: number;
  vectorZoom1Corner?: VectorZoomCorner;
  vectorZoom1Size?: number;
  vectorZoom1Margin?: number;
  vectorZoom1Color?: string;
  vectorZoom2Enabled?: boolean;
  vectorZoom2Shape?: VectorZoomShape;
  vectorZoom2CenterX?: number;
  vectorZoom2CenterY?: number;
  vectorZoom2Width?: number;
  vectorZoom2Height?: number;
  vectorZoom2Corner?: VectorZoomCorner;
  vectorZoom2Size?: number;
  vectorZoom2Margin?: number;
  vectorZoom2Color?: string;
  vectorZoom3Enabled?: boolean;
  vectorZoom3Shape?: VectorZoomShape;
  vectorZoom3CenterX?: number;
  vectorZoom3CenterY?: number;
  vectorZoom3Width?: number;
  vectorZoom3Height?: number;
  vectorZoom3Corner?: VectorZoomCorner;
  vectorZoom3Size?: number;
  vectorZoom3Margin?: number;
  vectorZoom3Color?: string;
  vectorZoom4Enabled?: boolean;
  vectorZoom4Shape?: VectorZoomShape;
  vectorZoom4CenterX?: number;
  vectorZoom4CenterY?: number;
  vectorZoom4Width?: number;
  vectorZoom4Height?: number;
  vectorZoom4Corner?: VectorZoomCorner;
  vectorZoom4Size?: number;
  vectorZoom4Margin?: number;
  vectorZoom4Color?: string;
}

type Point = [x: number, y: number];
type Region = {
  shape: VectorZoomShape;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type ResolvedVectorZoom = {
  source: Region;
  target: Region;
  scale: number;
  color: string;
};

export type VectorZoomGuides = {
  dashedRuns: number[][];
  outlineRuns: number[][];
  groups: Array<{ color: string; runs: number[][] }>;
};

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;
const pointAt = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const samePoint = (a: Point, b: Point, epsilon = 1e-7): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= epsilon;

function setting(settings: VectorZoomSettings, index: number, suffix: string): unknown {
  return (settings as unknown as Record<string, unknown>)[`vectorZoom${index}${suffix}`];
}

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Resolve the four UI slots into sheet-space source and destination regions. */
export function resolveVectorZooms(
  settings: VectorZoomSettings,
  width: number,
  height: number,
  margin: number,
): ResolvedVectorZoom[] {
  const zooms: ResolvedVectorZoom[] = [];
  const inheritedColor = String(
    (settings as unknown as Record<string, unknown>).color || '#15181a',
  );
  for (let index = 1; index <= 4; index++) {
    if (!setting(settings, index, 'Enabled')) continue;
    const shape = setting(settings, index, 'Shape') === 'circle' ? 'circle' : 'rectangle';
    const sourceWidth = (width * clamp(finite(setting(settings, index, 'Width'), 20), 2, 80)) / 100;
    const sourceHeight =
      shape === 'circle'
        ? sourceWidth
        : (height * clamp(finite(setting(settings, index, 'Height'), 20), 2, 80)) / 100;
    const source: Region = {
      shape,
      cx: (width * clamp(finite(setting(settings, index, 'CenterX'), 50), 0, 100)) / 100,
      cy: (height * clamp(finite(setting(settings, index, 'CenterY'), 50), 0, 100)) / 100,
      rx: sourceWidth / 2,
      ry: sourceHeight / 2,
    };
    const targetLongEdge =
      (Math.min(width, height) * clamp(finite(setting(settings, index, 'Size'), 30), 10, 60)) / 100;
    const scale = targetLongEdge / Math.max(sourceWidth, sourceHeight);
    const targetRx = source.rx * scale;
    const targetRy = source.ry * scale;
    const edgeMargin = clamp(
      finite(setting(settings, index, 'Margin'), finite(margin, 14)),
      0,
      Math.min(width, height) * 0.45,
    );
    const requestedColor = String(setting(settings, index, 'Color') || inheritedColor);
    const color = /^#[0-9a-f]{6}$/i.test(requestedColor) ? requestedColor : '#15181a';
    const requestedCorner = String(setting(settings, index, 'Corner') || 'top-right');
    const corner: VectorZoomCorner = [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ].includes(requestedCorner)
      ? (requestedCorner as VectorZoomCorner)
      : 'top-right';
    const target: Region = {
      shape,
      rx: targetRx,
      ry: targetRy,
      cx: corner.endsWith('left')
        ? Math.min(edgeMargin, Math.max(0, width - targetRx * 2)) + targetRx
        : width - Math.min(edgeMargin, Math.max(0, width - targetRx * 2)) - targetRx,
      cy: corner.startsWith('top')
        ? Math.min(edgeMargin, Math.max(0, height - targetRy * 2)) + targetRy
        : height - Math.min(edgeMargin, Math.max(0, height - targetRy * 2)) - targetRy,
    };
    zooms.push({ source, target, scale, color });
  }
  return zooms;
}

function inside(point: Point, region: Region): boolean {
  if (region.shape === 'circle') {
    const dx = (point[0] - region.cx) / region.rx;
    const dy = (point[1] - region.cy) / region.ry;
    return dx * dx + dy * dy <= 1 + 1e-9;
  }
  return (
    Math.abs(point[0] - region.cx) <= region.rx + 1e-9 &&
    Math.abs(point[1] - region.cy) <= region.ry + 1e-9
  );
}

function segmentBreaks(a: Point, b: Point, region: Region): number[] {
  const values = [0, 1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (region.shape === 'rectangle') {
    if (Math.abs(dx) > 1e-12)
      for (const x of [region.cx - region.rx, region.cx + region.rx]) {
        const t = (x - a[0]) / dx;
        const y = a[1] + dy * t;
        if (y >= region.cy - region.ry - 1e-9 && y <= region.cy + region.ry + 1e-9) values.push(t);
      }
    if (Math.abs(dy) > 1e-12)
      for (const y of [region.cy - region.ry, region.cy + region.ry]) {
        const t = (y - a[1]) / dy;
        const x = a[0] + dx * t;
        if (x >= region.cx - region.rx - 1e-9 && x <= region.cx + region.rx + 1e-9) values.push(t);
      }
  } else {
    const ax = (a[0] - region.cx) / region.rx;
    const ay = (a[1] - region.cy) / region.ry;
    const sx = dx / region.rx;
    const sy = dy / region.ry;
    const qa = sx * sx + sy * sy;
    const qb = 2 * (ax * sx + ay * sy);
    const qc = ax * ax + ay * ay - 1;
    const discriminant = qb * qb - 4 * qa * qc;
    if (qa > 1e-14 && discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      values.push((-qb - root) / (2 * qa), (-qb + root) / (2 * qa));
    }
  }
  const normalized: number[] = [];
  for (const value of values)
    if (value >= -1e-9 && value <= 1 + 1e-9) normalized.push(clamp(value, 0, 1));
  normalized.sort((left, right) => left - right);
  const unique: number[] = [];
  for (const value of normalized)
    if (!unique.length || Math.abs(value - unique[unique.length - 1]) > 1e-8) unique.push(value);
  return unique;
}

function clipRun(run: number[], region: Region, keepInside: boolean): number[][] {
  const result: number[][] = [];
  let current: number[] | null = null;
  const flush = () => {
    if (current && current.length >= 4) result.push(current);
    current = null;
  };
  for (let index = 0; index + 3 < run.length; index += 2) {
    const a: Point = [run[index], run[index + 1]];
    const b: Point = [run[index + 2], run[index + 3]];
    const breaks = segmentBreaks(a, b, region);
    for (let part = 0; part + 1 < breaks.length; part++) {
      const start = pointAt(a, b, breaks[part]);
      const end = pointAt(a, b, breaks[part + 1]);
      if (samePoint(start, end)) continue;
      const midpoint = pointAt(start, end, 0.5);
      if (inside(midpoint, region) !== keepInside) {
        flush();
        continue;
      }
      if (!current || !samePoint([current.at(-2)!, current.at(-1)!], start)) {
        flush();
        current = [...start, ...end];
      } else current.push(...end);
    }
  }
  flush();
  return result;
}

function transformRun(run: number[], zoom: ResolvedVectorZoom): number[] {
  const transformed: number[] = [];
  for (let index = 0; index + 1 < run.length; index += 2)
    transformed.push(
      zoom.target.cx + (run[index] - zoom.source.cx) * zoom.scale,
      zoom.target.cy + (run[index + 1] - zoom.source.cy) * zoom.scale,
    );
  return transformed;
}

/** Cut destination windows out of the base art, then add cropped, uniformly scaled copies. */
export function applyVectorZooms(runs: readonly number[][], zooms: readonly ResolvedVectorZoom[]) {
  if (!zooms.length) return runs.map((run) => run.slice());
  let baseRuns = runs.map((run) => run.slice());
  for (const zoom of zooms) baseRuns = baseRuns.flatMap((run) => clipRun(run, zoom.target, false));
  const insetRuns = zooms.flatMap((zoom) =>
    runs.flatMap((run) => clipRun(run, zoom.source, true).map((part) => transformRun(part, zoom))),
  );
  return [...baseRuns, ...insetRuns];
}

function boundary(region: Region): number[] {
  if (region.shape === 'rectangle') {
    const left = region.cx - region.rx;
    const right = region.cx + region.rx;
    const top = region.cy - region.ry;
    const bottom = region.cy + region.ry;
    return [left, top, right, top, right, bottom, left, bottom, left, top];
  }
  const run: number[] = [];
  const steps = 96;
  for (let index = 0; index <= steps; index++) {
    const angle = (index / steps) * Math.PI * 2;
    run.push(region.cx + Math.cos(angle) * region.rx, region.cy + Math.sin(angle) * region.ry);
  }
  return run;
}

function dashRun(run: number[], dashLength: number, gapLength: number): number[][] {
  const result: number[][] = [];
  let drawing = true;
  let remaining = dashLength;
  let current: number[] | null = null;
  for (let index = 0; index + 3 < run.length; index += 2) {
    let start: Point = [run[index], run[index + 1]];
    const end: Point = [run[index + 2], run[index + 3]];
    let length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    while (length > 1e-9) {
      const consumed = Math.min(length, remaining);
      const next: Point = [
        start[0] + ((end[0] - start[0]) * consumed) / length,
        start[1] + ((end[1] - start[1]) * consumed) / length,
      ];
      if (drawing) {
        if (!current) current = [...start];
        current.push(...next);
      }
      start = next;
      length -= consumed;
      remaining -= consumed;
      if (remaining <= 1e-9) {
        if (drawing && current && current.length >= 4) result.push(current);
        current = null;
        drawing = !drawing;
        remaining = drawing ? dashLength : gapLength;
      }
    }
  }
  if (drawing && current && current.length >= 4) result.push(current);
  return result;
}

function boundaryPointToward(region: Region, point: Point): Point {
  const dx = point[0] - region.cx;
  const dy = point[1] - region.cy;
  if (Math.abs(dx) + Math.abs(dy) < 1e-9) return [region.cx, region.cy];
  if (region.shape === 'circle') {
    const factor =
      1 / Math.sqrt((dx * dx) / (region.rx * region.rx) + (dy * dy) / (region.ry * region.ry));
    return [region.cx + dx * factor, region.cy + dy * factor];
  }
  const factor = Math.min(
    region.rx / Math.max(Math.abs(dx), 1e-12),
    region.ry / Math.max(Math.abs(dy), 1e-12),
  );
  return [region.cx + dx * factor, region.cy + dy * factor];
}

/** Build plotter-real dashed source borders/leaders and solid destination borders. */
export function vectorZoomGuides(
  zooms: readonly ResolvedVectorZoom[],
  strokeWidth: number,
): VectorZoomGuides {
  const dashLength = clamp(strokeWidth * 7, 1.2, 3);
  const gapLength = dashLength * 0.65;
  const dashedRuns: number[][] = [];
  const outlineRuns: number[][] = [];
  const groups: Array<{ color: string; runs: number[][] }> = [];
  for (const zoom of zooms) {
    const zoomDashedRuns = dashRun(boundary(zoom.source), dashLength, gapLength);
    const sourceEnd = boundaryPointToward(zoom.source, [zoom.target.cx, zoom.target.cy]);
    const targetEnd = boundaryPointToward(zoom.target, [zoom.source.cx, zoom.source.cy]);
    zoomDashedRuns.push(...dashRun([...sourceEnd, ...targetEnd], dashLength, gapLength));
    const zoomOutlineRuns = [boundary(zoom.target)];
    dashedRuns.push(...zoomDashedRuns);
    outlineRuns.push(...zoomOutlineRuns);
    groups.push({ color: zoom.color, runs: [...zoomDashedRuns, ...zoomOutlineRuns] });
  }
  return { dashedRuns, outlineRuns, groups };
}
