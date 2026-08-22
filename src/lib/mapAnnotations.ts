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
}

export interface MapAnnotations {
  svg: string;
  runs: Polyline[];
  paths: number;
  nodes: number;
  locations: string[];
  altitudes: number[];
}

const GLYPHS: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
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
  return Math.max(0, text.length * cell * 7 * 0.62);
}

type MapLabel = { text: string; x: number; y: number; cell: number };

function strokeText(text: string, x: number, y: number, cell: number): Polyline[] {
  const runs: Polyline[] = [];
  for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
    const glyph = GLYPHS[text[characterIndex]];
    if (!glyph) continue;
    const offsetX = x + characterIndex * cell * 6;
    for (let row = 0; row < glyph.length; row++) {
      const pixels = glyph[row];
      let column = 0;
      while (column < pixels.length) {
        while (column < pixels.length && pixels[column] !== '1') column++;
        const start = column;
        while (column < pixels.length && pixels[column] === '1') column++;
        if (start < column)
          runs.push([
            offsetX + start * cell,
            y + row * cell,
            offsetX + (column - 0.2) * cell,
            y + row * cell,
          ]);
      }
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
  const inset = clamp(options.margin * 0.45, 3, 10);
  const candidates: Array<{ run: Polyline; length: number }> = [];
  for (const run of sourceRuns) {
    if (run.length < 6) continue;
    const length = runLength(run);
    if (length >= 8) candidates.push({ run, length });
  }
  candidates.sort((a, b) => b.length - a.length);
  if (!candidates.length)
    return { svg: '', runs: [], paths: 0, nodes: 0, locations: [], altitudes: [] };

  const geometrySignature = candidates
    .slice(0, 24)
    .map(({ run, length }) => `${fmt(run[0])},${fmt(run[1])},${fmt(length)}`)
    .join('|');
  const rng = makeRng(hashText(`${options.title}|${width}|${height}|${geometrySignature}`));
  const runs: Polyline[] = [];
  const symbolRuns: Polyline[] = [];
  const labels: MapLabel[] = [];
  const locations: string[] = [];
  const altitudes: number[] = [];
  const occupied: Array<[number, number]> = [];
  const minDimension = Math.min(width, height);

  // Index-contour-style altitude callouts. Long outer contours receive lower
  // synthetic elevations; progressively shorter contours receive higher ones.
  const altitudeCount = clamp(Math.round(options.lineCount / 10), 2, 6);
  for (let index = 0; index < altitudeCount; index++) {
    const candidateIndex = Math.round(
      ((index + 1) / (altitudeCount + 1)) * (candidates.length - 1),
    );
    const candidate = candidates[candidateIndex];
    const [anchorX, anchorY] = pointAlong(candidate.run, 0.22 + rng() * 0.56);
    const altitude = Math.round((((index + 1) / (altitudeCount + 1)) * 1800) / 50) * 50;
    const label = `${altitude}M`;
    const cell = clamp(minDimension * 0.0034, 0.28, 0.48);
    const labelWidth = textWidth(label, cell);
    const x = clamp(anchorX - labelWidth / 2, inset, width - inset - labelWidth);
    const y = clamp(anchorY - cell * 4.7, inset, height - inset - cell * 7);
    const tick = [anchorX - cell, anchorY, anchorX + cell, anchorY];
    runs.push(tick);
    symbolRuns.push(tick);
    runs.push(...strokeText(label, x, y, cell));
    labels.push({ text: label, x, y, cell });
    occupied.push([x + labelWidth / 2, y + cell * 3.5]);
    altitudes.push(altitude);
  }

  // Place names use the same contour geometry as anchors, then reject points
  // that crowd earlier labels. The seeded order is stable for a given design.
  const placeTarget = clamp(Math.round(minDimension / 45), 3, 6);
  const names = [...PLACE_NAMES];
  for (let index = names.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    [names[index], names[swap]] = [names[swap], names[index]];
  }
  for (
    let attempt = 0;
    attempt < candidates.length * 4 && locations.length < placeTarget;
    attempt++
  ) {
    const candidate = candidates[Math.floor(rng() * candidates.length)];
    const [markerX, markerY] = pointAlong(candidate.run, 0.12 + rng() * 0.76);
    if (
      markerX < inset + 5 ||
      markerX > width - inset - 5 ||
      markerY < inset + 5 ||
      markerY > height - inset - 5 ||
      occupied.some(([x, y]) => Math.hypot(markerX - x, markerY - y) < minDimension * 0.14)
    )
      continue;
    const name = names[locations.length];
    const cell = clamp(minDimension * 0.0042, 0.34, 0.56);
    const labelWidth = textWidth(name, cell);
    const labelX =
      markerX + cell * 3 + labelWidth <= width - inset
        ? markerX + cell * 3
        : markerX - cell * 3 - labelWidth;
    const labelY = clamp(markerY - cell * 3.5, inset, height - inset - cell * 7);
    const radius = cell * 1.25;
    const marker = [
      markerX,
      markerY - radius,
      markerX + radius,
      markerY,
      markerX,
      markerY + radius,
      markerX - radius,
      markerY,
      markerX,
      markerY - radius,
    ];
    runs.push(marker);
    symbolRuns.push(marker);
    runs.push(...strokeText(name, labelX, labelY, cell));
    labels.push({ text: name, x: labelX, y: labelY, cell });
    occupied.push([markerX, markerY]);
    locations.push(name);
  }

  const pathData = serialiseRuns(symbolRuns);
  const escapedLocations = locations.join(',');
  const masks = labels
    .map(({ text, x, y, cell }) => {
      const fontSize = cell * 7;
      const padding = Math.max(0.45, cell * 1.2);
      return `<rect data-label-mask="${text}" x="${fmt(x - padding)}" y="${fmt(y - padding)}" width="${fmt(textWidth(text, cell) + padding * 2)}" height="${fmt(fontSize + padding * 2)}" rx="${fmt(padding * 0.55)}"/>`;
    })
    .join('');
  const text = labels
    .map(({ text, x, y, cell }) => {
      const fontSize = cell * 7;
      return `<text x="${fmt(x)}" y="${fmt(y + fontSize * 0.82)}" font-size="${fmt(fontSize)}">${text}</text>`;
    })
    .join('');
  const svg = `<g id="topographic-annotations" data-locations="${escapedLocations}" data-altitudes="${altitudes.join(',')}"><g fill="${options.backgroundColor}" stroke="none">${masks}</g><g fill="${options.color}" stroke="none" font-family="DM Mono,ui-monospace,monospace" font-weight="500" letter-spacing="${fmt(minDimension * 0.0007)}">${text}</g><path d="${pathData}" fill="none" stroke="${options.color}" stroke-width="${fmt(Math.max(0.18, options.strokeWidth * 0.78))}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return {
    svg,
    runs,
    paths: runs.length,
    nodes: runs.reduce((sum, run) => sum + run.length / 2, 0),
    locations,
    altitudes,
  };
}
