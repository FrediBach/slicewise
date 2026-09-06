/** Deterministic, plotter-safe annotations for simulated topographic maps. */

import { clipRunToGlitchRectangle } from './block-glitch';

type Polyline = number[];

export interface MapAnnotationOptions {
  width: number;
  height: number;
  margin: number;
  lineCount: number;
  strokeWidth: number;
  color: string;
  backgroundColor: string;
  title: string;
  /** Normalized scalar levels, aligned with sourceRuns. Absent for decorative line art. */
  levels?: readonly (number | undefined)[];
}

export interface MapAnnotations {
  svg: string;
  runs: Polyline[];
  paths: number;
  nodes: number;
  locations: string[];
  altitudes: number[];
  masks: LabelMask[];
}

// Compact single-stroke lettering. Each pair is one point on a 4 × 6 grid.
const GLYPHS: Record<string, string> = {
  '0': '103041453616050110',
  '1': '122026|0646',
  '2': '0110304142300646',
  '3': '0030414223|2344453606',
  '4': '300343|4046',
  '5': '4000033344453606',
  '6': '401000063646443403',
  '7': '004026',
  '8': '103041423313020110|13233445463616050413',
  '9': '4341301001021333434606',
  A: '062046|1333',
  C: '401000063646',
  D: '060010304042443606',
  E: '40000646|0333',
  G: '4010000636464323',
  H: '0006|4046|0343',
  I: '0040|2026|0646',
  K: '0006|400346',
  L: '000646',
  M: '0600224046',
  N: '06004640',
  O: '1030404244361606040210',
  P: '06003040423303',
  R: '06003040423303|2346',
  S: '401000022344463606',
  T: '0040|2026',
  U: '0006364640',
  V: '002640',
};

const PLACE_NAMES = [
  'ALPINE',
  'CEDAR',
  'CREST',
  'HAVEN',
  'LAKE',
  'NORTH',
  'PASS',
  'PINE',
  'RIDGE',
  'STONE',
  'SUMMIT',
  'VALE',
] as const;

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const fmt = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function makeRng(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function runLength(run: Polyline): number {
  let length = 0;
  for (let index = 2; index + 1 < run.length; index += 2)
    length += Math.hypot(run[index] - run[index - 2], run[index + 1] - run[index - 1]);
  return length;
}

function pointAlong(run: Polyline, fraction: number): [number, number] {
  const target = runLength(run) * clamp(fraction, 0, 1);
  let travelled = 0;
  for (let index = 2; index + 1 < run.length; index += 2) {
    const ax = run[index - 2],
      ay = run[index - 1],
      bx = run[index],
      by = run[index + 1];
    const segment = Math.hypot(bx - ax, by - ay);
    if (travelled + segment >= target && segment > 0) {
      const amount = (target - travelled) / segment;
      return [ax + (bx - ax) * amount, ay + (by - ay) * amount];
    }
    travelled += segment;
  }
  return [run.at(-2) || 0, run.at(-1) || 0];
}

function textWidth(text: string, cell: number): number {
  return Math.max(0, (text.length * 6 - 2) * cell);
}

export type LabelMask = { x: number; y: number; width: number; height: number; angle: number };

type MapLabel = LabelMask & { text: string; cell: number };

function transformRun(run: Polyline, mask: LabelMask, inverse = false): Polyline {
  const c = Math.cos(mask.angle),
    s = Math.sin(mask.angle);
  const result: number[] = [];
  for (let i = 0; i < run.length; i += 2) {
    const x = run[i] - (inverse ? mask.x : 0),
      y = run[i + 1] - (inverse ? mask.y : 0);
    result.push(
      inverse ? x * c + y * s : mask.x + x * c - y * s,
      inverse ? -x * s + y * c : mask.y + x * s + y * c,
    );
  }
  return result;
}

/** Cut real pen-up gaps, using the same rotated rectangles as the SVG labels. */
export function clearMapLabelGaps(run: Polyline, masks: readonly LabelMask[]): Polyline[] {
  let result = [run];
  for (const mask of masks)
    result = result.flatMap((part) =>
      clipRunToGlitchRectangle(
        transformRun(part, mask, true),
        {
          left: -0.65,
          top: -0.65,
          right: mask.width + 0.65,
          bottom: mask.height + 0.65,
        },
        false,
      ).map((part) => transformRun(part, mask)),
    );
  return result;
}

function strokeText(label: MapLabel): Polyline[] {
  const runs: Polyline[] = [];
  for (let index = 0; index < label.text.length; index++) {
    for (const stroke of (GLYPHS[label.text[index]] || '').split('|')) {
      const run: number[] = [];
      for (let i = 0; i + 1 < stroke.length; i += 2)
        run.push((index * 6 + Number(stroke[i])) * label.cell, Number(stroke[i + 1]) * label.cell);
      if (run.length >= 4) runs.push(transformRun(run, label));
    }
  }
  return runs;
}

function serialiseRuns(runs: readonly Polyline[]): string {
  return runs
    .map((run) => {
      if (run.length < 4) return '';
      let path = `M${fmt(run[0])} ${fmt(run[1])}`;
      for (let index = 2; index + 1 < run.length; index += 2)
        path += `L${fmt(run[index])} ${fmt(run[index + 1])}`;
      return path;
    })
    .join('');
}

export function createMapAnnotations(
  sourceRuns: readonly Polyline[],
  options: MapAnnotationOptions,
): MapAnnotations {
  const { width, height } = options;
  const inset = Math.max(3, options.margin);
  const minDimension = Math.min(width, height);
  const candidates: Array<{ run: Polyline; length: number; level: number | undefined }> = [];
  for (let index = 0; index < sourceRuns.length; index++) {
    const run = sourceRuns[index];
    if (run.length < 6 || !run.every(Number.isFinite)) continue;
    const length = runLength(run);
    if (length >= 8) candidates.push({ run, length, level: options.levels?.[index] });
  }
  candidates.sort((a, b) => b.length - a.length);
  if (!candidates.length)
    return { svg: '', runs: [], paths: 0, nodes: 0, locations: [], altitudes: [], masks: [] };
  // Name choices are independent of viewport, contour count, and line sorting.
  const rng = makeRng(hashText(options.title));
  const labels: MapLabel[] = [],
    symbols: Polyline[] = [];
  const locations: string[] = [],
    altitudes: number[] = [];
  const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const place = (
    text: string,
    anchorX: number,
    anchorY: number,
    cell: number,
    angle: number,
  ): boolean => {
    const w = textWidth(text, cell),
      h = cell * 6;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const label = {
      text,
      cell,
      width: w,
      height: h,
      angle,
      x: anchorX - (w / 2) * c + (h / 2) * s,
      y: anchorY - (w / 2) * s - (h / 2) * c,
    };
    const corners = transformRun([0, 0, w, 0, w, h, 0, h], label);
    const xs = corners.filter((_, i) => i % 2 === 0),
      ys = corners.filter((_, i) => i % 2 === 1);
    const box = {
      left: Math.min(...xs) - 1.5,
      right: Math.max(...xs) + 1.5,
      top: Math.min(...ys) - 1.5,
      bottom: Math.max(...ys) + 1.5,
    };
    if (
      box.left < inset ||
      box.right > width - inset ||
      box.top < inset ||
      box.bottom > height - inset ||
      occupied.some(
        (b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top,
      )
    )
      return false;
    occupied.push(box);
    labels.push(label);
    return true;
  };

  // Elevations follow actual scalar positions, never contour perimeter or sort order.
  // These are illustrative metre values: the source mesh has no georeferencing.
  const byLevel = new Map<number, typeof candidates>();
  for (const candidate of candidates)
    if (candidate.level !== undefined && Number.isFinite(candidate.level)) {
      const altitude = Math.round((clamp(candidate.level, 0, 1) * 1800) / 10) * 10;
      const group = byLevel.get(altitude) || [];
      group.push(candidate);
      byLevel.set(altitude, group);
    }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const target = clamp(Math.round(options.lineCount / 8), 2, 10);
  const selected = levels.filter(
    (_, i) => i % Math.max(1, Math.ceil(levels.length / target)) === 0,
  );
  for (const altitude of selected) {
    let placed = false;
    for (const { run, length } of byLevel.get(altitude)!) {
      const cell = clamp(minDimension * 0.0025, 0.3, 0.5),
        label = `${altitude}M`;
      if (length < textWidth(label, cell) * 2.5) continue;
      for (const fraction of [0.5, 0.28, 0.72, 0.14, 0.86]) {
        const span = (textWidth(label, cell) / length) * 0.55;
        const a = pointAlong(run, fraction - span),
          b = pointAlong(run, fraction + span);
        const [x, y] = pointAlong(run, fraction);
        // Avoid tight corners, peaks and hairpins that cannot hold legible inline text.
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < textWidth(label, cell) * 0.9) continue;
        let angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        if (place(label, x, y, cell, angle)) {
          altitudes.push(altitude);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }
  const names = [...PLACE_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const placeTarget = clamp(Math.round(minDimension / 65), 2, 4);
  for (
    let attempt = 0;
    attempt < Math.min(candidates.length * 4, 100) && locations.length < placeTarget;
    attempt++
  ) {
    const candidate = candidates[Math.floor(rng() * candidates.length)];
    const [x, y] = pointAlong(candidate.run, 0.15 + rng() * 0.7);
    const cell = clamp(minDimension * 0.003, 0.35, 0.55);
    const name = names[locations.length],
      labelWidth = textWidth(name, cell);
    const labelX = x + labelWidth / 2 + 3;
    if (place(name, labelX, y, cell, 0)) {
      symbols.push([x - 0.8, y, x + 0.8, y], [x, y - 0.8, x, y + 0.8]);
      locations.push(name);
    }
  }
  const runs = [...symbols, ...labels.flatMap(strokeText)];
  const svg = `<g id="topographic-annotations" data-locations="${locations.join(',')}" data-altitudes="${altitudes.join(',')}" data-elevation-units="illustrative-metres" fill="none" stroke="${options.color}" stroke-width="${fmt(Math.max(0.16, options.strokeWidth * 0.75))}" stroke-linecap="round" stroke-linejoin="round"><path d="${serialiseRuns(symbols)}"/>${labels.map((label) => `<path data-map-label="${label.text}" d="${serialiseRuns(strokeText(label))}"/>`).join('')}</g>`;
  return {
    svg,
    runs,
    paths: runs.length,
    nodes: runs.reduce((sum, run) => sum + run.length / 2, 0),
    locations,
    altitudes,
    masks: labels,
  };
}
