import { createMapFeatures, mapPlaceName, type MapFeature } from './map-features';
import { resolveMapSettings, type MapSettings } from './map-settings';
/** Deterministic, plotter-safe annotations for simulated topographic maps. */

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
  map?: Partial<MapSettings>;
  terrainFeatures?: MapFeature[];
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
  features: MapFeature[];
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
  B: '00063041423303|2344453606',
  C: '401000063646',
  D: '060010304042443606',
  E: '40000646|0333',
  F: '060040|0333',
  G: '4010000636464323',
  H: '0006|4046|0343',
  I: '0040|2026|0646',
  J: '0040|3035160604',
  K: '0006|400346',
  L: '000646',
  M: '0600224046',
  N: '06004640',
  O: '1030404244361606040210',
  P: '06003040423303',
  Q: '103041453616050110|2346',
  R: '06003040423303|2346',
  S: '401000022344463606',
  T: '0040|2026',
  U: '0006364640',
  V: '002640',
  W: '0006234640',
  X: '0046|4006',
  Y: '002340|2326',
  Z: '00400646',
  '-': '0343',
  '.': '2526',
  "'": '2021',
};

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

export type LabelMask = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  padding?: number;
};

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

type PreparedMask = LabelMask & {
  c: number;
  s: number;
  pad: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};
const preparedMasks = new WeakMap<readonly LabelMask[], PreparedMask[]>();
function prepareMasks(masks: readonly LabelMask[]): PreparedMask[] {
  const cached = preparedMasks.get(masks);
  if (cached) return cached;
  const prepared = masks.map((mask) => {
    const pad = mask.padding ?? 0.65,
      c = Math.cos(mask.angle),
      s = Math.sin(mask.angle);
    const corners = transformRun(
      [
        -pad,
        -pad,
        mask.width + pad,
        -pad,
        mask.width + pad,
        mask.height + pad,
        -pad,
        mask.height + pad,
      ],
      mask,
    );
    return {
      ...mask,
      c,
      s,
      pad,
      left: Math.min(corners[0], corners[2], corners[4], corners[6]),
      right: Math.max(corners[0], corners[2], corners[4], corners[6]),
      top: Math.min(corners[1], corners[3], corners[5], corners[7]),
      bottom: Math.max(corners[1], corners[3], corners[5], corners[7]),
    };
  });
  preparedMasks.set(masks, prepared);
  return prepared;
}

/** Subtract the union of label/symbol corridors in one segment pass. No repeated fragmentation. */
export function clearMapLabelGaps(run: Polyline, masks: readonly LabelMask[]): Polyline[] {
  if (!masks.length) return [run];
  const prepared = prepareMasks(masks);
  const result: number[][] = [];
  let current: number[] = [];
  const flush = () => {
    if (current.length >= 4 && runLength(current) >= 0.05) result.push(current);
    current = [];
  };
  for (let i = 2; i < run.length; i += 2) {
    const ax = run[i - 2],
      ay = run[i - 1],
      dx = run[i] - ax,
      dy = run[i + 1] - ay;
    const left = Math.min(ax, run[i]),
      right = Math.max(ax, run[i]),
      top = Math.min(ay, run[i + 1]),
      bottom = Math.max(ay, run[i + 1]);
    const intervals: Array<[number, number]> = [];
    for (const mask of prepared) {
      if (right < mask.left || left > mask.right || bottom < mask.top || top > mask.bottom)
        continue;
      const x = (ax - mask.x) * mask.c + (ay - mask.y) * mask.s;
      const y = -(ax - mask.x) * mask.s + (ay - mask.y) * mask.c;
      const vx = dx * mask.c + dy * mask.s,
        vy = -dx * mask.s + dy * mask.c;
      let lo = 0,
        hi = 1;
      for (const [p, v, min, max] of [
        [x, vx, -mask.pad, mask.width + mask.pad],
        [y, vy, -mask.pad, mask.height + mask.pad],
      ]) {
        if (Math.abs(v) < 1e-12) {
          if (p < min || p > max) hi = -1;
        } else {
          const a = (min - p) / v,
            b = (max - p) / v;
          lo = Math.max(lo, Math.min(a, b));
          hi = Math.min(hi, Math.max(a, b));
        }
      }
      if (hi > lo + 1e-10) intervals.push([lo, hi]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const emit = (start: number, end: number) => {
      if (end - start < 1e-10) return;
      const x = ax + dx * start,
        y = ay + dy * start;
      if (current.length && Math.hypot(current.at(-2)! - x, current.at(-1)! - y) > 1e-7) flush();
      if (!current.length) current.push(x, y);
      current.push(ax + dx * end, ay + dy * end);
    };
    let cursor = 0;
    for (const [start, end] of intervals) {
      if (start > cursor) emit(cursor, start);
      if (end > cursor) {
        flush();
        cursor = end;
      }
    }
    if (cursor < 1) emit(cursor, 1);
  }
  flush();
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
  const settings = resolveMapSettings(options.map);
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
    return {
      svg: '',
      runs: [],
      paths: 0,
      nodes: 0,
      locations: [],
      altitudes: [],
      masks: [],
      features: [],
    };
  // Name choices are independent of viewport, contour count, and line sorting.
  const rng = makeRng(hashText(options.title) ^ settings.mapSeed);
  const features = [
    ...(options.terrainFeatures ?? []),
    ...createMapFeatures({ runs: sourceRuns, width, height, margin: options.margin }, settings),
  ];
  const labels: MapLabel[] = [],
    symbols: Polyline[] = [];
  const locations: string[] = [],
    altitudes: number[] = [];
  const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  for (const feature of features) {
    if (feature.kind === 'road' || feature.kind === 'river') continue;
    for (const mask of feature.masks)
      occupied.push({
        left: mask.x - 0.5,
        top: mask.y - 0.5,
        right: mask.x + mask.width + 0.5,
        bottom: mask.y + mask.height + 0.5,
      });
  }
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
  const target = settings.mapElevations;
  const selected =
    target === 0
      ? []
      : levels.filter((_, i) => i % Math.max(1, Math.ceil(levels.length / target)) === 0);
  for (const altitude of selected) {
    let placed = false;
    for (const { run, length } of byLevel.get(altitude)!) {
      const cell = (clamp(minDimension * 0.0025, 0.3, 0.5) * settings.mapTextScale) / 100,
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
  const namedFeatures = features.filter((feature) => feature.kind !== 'house');
  const usedNames = new Set<string>();
  // Name features first, then add settlement and geographic labels. All labels share one budget.
  for (let attempt = 0; attempt < 240 && locations.length < settings.mapLabels; attempt++) {
    const feature = attempt < namedFeatures.length ? namedFeatures[attempt] : undefined;
    const candidate = candidates[Math.floor(rng() * candidates.length)];
    const [x, y] = feature?.anchor ?? pointAlong(candidate.run, 0.15 + rng() * 0.7);
    const cell = (clamp(minDimension * 0.003, 0.35, 0.55) * settings.mapTextScale) / 100;
    const name = feature?.name ?? mapPlaceName(attempt, settings.mapSeed);
    if (usedNames.has(name)) continue;
    const labelWidth = textWidth(name, cell);
    const offset = feature
      ? (((Math.min(width, height) / 150) * settings.mapSymbolScale) / 100) * 4 + 2
      : 3;
    for (const [labelX, labelY] of [
      [x + labelWidth / 2 + offset, y],
      [x - labelWidth / 2 - offset, y],
      [x, y + offset + cell * 4],
    ]) {
      if (place(name, labelX, labelY, cell, 0)) {
        if (!feature) symbols.push([x - 0.8, y, x + 0.8, y], [x, y - 0.8, x, y + 0.8]);
        locations.push(name);
        usedNames.add(name);
        break;
      }
    }
  }
  // Text knocks out feature lines too; symbols never redraw under the lettering.
  const featureRuns = features.map((feature) => ({
    ...feature,
    runs: feature.runs.flatMap((run) => clearMapLabelGaps(run, labels)),
  }));
  const runs = [
    ...featureRuns.flatMap((feature) => feature.runs),
    ...symbols,
    ...labels.flatMap(strokeText),
  ];
  const svg = `<g id="topographic-annotations" data-locations="${locations.join(',')}" data-altitudes="${altitudes.join(',')}" data-elevation-units="illustrative-metres" fill="none" stroke="${options.color}" stroke-width="${fmt(Math.max(0.16, options.strokeWidth * 0.75))}" stroke-linecap="round" stroke-linejoin="round">${featureRuns.map((feature) => `<path data-map-feature="${feature.kind}" d="${serialiseRuns(feature.runs)}"/>`).join('')}<path d="${serialiseRuns(symbols)}"/>${labels.map((label) => `<path data-map-label="${label.text}" d="${serialiseRuns(strokeText(label))}"/>`).join('')}</g>`;
  return {
    svg,
    runs,
    paths: runs.length,
    nodes: runs.reduce((sum, run) => sum + run.length / 2, 0),
    locations,
    altitudes,
    masks: [...features.flatMap((feature) => feature.masks), ...labels],
    features,
  };
}
