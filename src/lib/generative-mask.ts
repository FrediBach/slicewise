'use strict';

export type MaskRun = number[];

export interface GenerativeMaskSettings {
  maskEnabled: boolean;
  maskRoundness: number;
  maskScaleX: number;
  maskScaleY: number;
  maskOffsetX: number;
  maskOffsetY: number;
  maskLfo1Amplitude: number;
  maskLfo1Cycles: number;
  maskLfo1Phase: number;
  maskLfo1Waveform: number;
  maskLfo2Amplitude: number;
  maskLfo2Cycles: number;
  maskLfo2Phase: number;
  maskLfo2Waveform: number;
}

type Point = [x: number, y: number];

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const samePoint = (a: Point, b: Point, epsilon = 1e-6): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= epsilon;

function waveform(angle: number, morph: number): number {
  const sine = Math.sin(angle);
  const triangle = (2 / Math.PI) * Math.asin(sine);
  const square = Math.tanh(6 * sine) / Math.tanh(6);
  const position = clamp(morph, 0, 100) / 50;
  return position <= 1
    ? sine + (triangle - sine) * position
    : triangle + (square - triangle) * (position - 1);
}

/**
 * Interpolate between adjacent integer harmonics instead of evaluating a
 * fractional frequency directly. The mask therefore remains closed while its
 * cycle count can still morph continuously.
 */
function oscillator(angle: number, cycles: number, phase: number, morph: number): number {
  const frequency = clamp(cycles, 1, 12);
  const low = Math.floor(frequency);
  const high = Math.ceil(frequency);
  const mix = frequency - low;
  const a = waveform(angle * low + phase, morph);
  if (low === high) return a;
  return a + (waveform(angle * high + phase, morph) - a) * mix;
}

function maskMetrics(
  settings: GenerativeMaskSettings,
  width: number,
  height: number,
  margin: number,
) {
  const availableWidth = Math.max(0.01, width - Math.max(0, margin) * 2);
  const availableHeight = Math.max(0.01, height - Math.max(0, margin) * 2);
  return {
    cx: width / 2 + (availableWidth * clamp(settings.maskOffsetX, -100, 100)) / 200,
    cy: height / 2 + (availableHeight * clamp(settings.maskOffsetY, -100, 100)) / 200,
    rx: (availableWidth * clamp(settings.maskScaleX, 10, 100)) / 200,
    ry: (availableHeight * clamp(settings.maskScaleY, 10, 100)) / 200,
    exponent: 2 + Math.pow(1 - clamp(settings.maskRoundness, 0, 100) / 100, 1.5) * 30,
  };
}

function boundaryRadius(settings: GenerativeMaskSettings, angle: number, exponent: number): number {
  const base = Math.pow(
    Math.pow(Math.abs(Math.cos(angle)), exponent) + Math.pow(Math.abs(Math.sin(angle)), exponent),
    -1 / exponent,
  );
  const first = oscillator(
    angle,
    settings.maskLfo1Cycles,
    (settings.maskLfo1Phase * Math.PI) / 180,
    settings.maskLfo1Waveform,
  );
  const second = oscillator(
    angle,
    settings.maskLfo2Cycles,
    (settings.maskLfo2Phase * Math.PI) / 180,
    settings.maskLfo2Waveform,
  );
  const modulation =
    first * clamp(settings.maskLfo1Amplitude, 0, 45) * 0.01 +
    second * clamp(settings.maskLfo2Amplitude, 0, 45) * 0.01;
  return base * Math.max(0.12, 1 + modulation);
}

export function pointInGenerativeMask(
  settings: GenerativeMaskSettings,
  width: number,
  height: number,
  margin: number,
  x: number,
  y: number,
): boolean {
  if (!settings.maskEnabled) return true;
  const { cx, cy, rx, ry, exponent } = maskMetrics(settings, width, height, margin);
  const nx = (x - cx) / rx,
    ny = (y - cy) / ry;
  const distance = Math.hypot(nx, ny);
  if (distance < 1e-12) return true;
  return distance <= boundaryRadius(settings, Math.atan2(ny, nx), exponent) + 1e-9;
}

/** Clip a polyline to the continuously evaluated generative mask boundary. */
export function clipRunToGenerativeMask(
  run: MaskRun,
  settings: GenerativeMaskSettings,
  width: number,
  height: number,
  margin: number,
): MaskRun[] {
  if (!settings.maskEnabled) return run.length >= 4 ? [run] : [];
  if (run.length < 4 || width <= 0 || height <= 0) return [];
  const clipped: MaskRun[] = [];
  let current: MaskRun | null = null;
  const maxCycles = Math.max(settings.maskLfo1Cycles, settings.maskLfo2Cycles, 1);
  const sampleLength = Math.max(0.2, Math.min(width, height) / (maxCycles * 14 + 56));
  const inside = (point: Point): boolean =>
    pointInGenerativeMask(settings, width, height, margin, point[0], point[1]);
  const interpolate = (a: Point, b: Point, amount: number): Point => [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
  ];
  const intersection = (a: Point, b: Point, aInside: boolean): Point => {
    let low = 0,
      high = 1;
    for (let iteration = 0; iteration < 18; iteration++) {
      const middle = (low + high) / 2;
      if (inside(interpolate(a, b, middle)) === aInside) low = middle;
      else high = middle;
    }
    return interpolate(a, b, aInside ? low : high);
  };
  const flush = (): void => {
    if (current && current.length >= 4) clipped.push(current);
    current = null;
  };

  for (let index = 0; index + 3 < run.length; index += 2) {
    const start: Point = [run[index], run[index + 1]],
      end: Point = [run[index + 2], run[index + 3]];
    const divisions = Math.max(
      1,
      Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / sampleLength),
    );
    let a = start,
      aInside = inside(a);
    for (let division = 1; division <= divisions; division++) {
      const b = interpolate(start, end, division / divisions),
        bInside = inside(b);
      if (aInside && bInside) {
        if (!current) current = [...a];
        if (
          division === divisions &&
          !samePoint([current[current.length - 2], current[current.length - 1]], b)
        )
          current.push(...b);
      } else if (aInside) {
        const edge = intersection(a, b, true);
        if (!current) current = [...a];
        current.push(...edge);
        flush();
      } else if (bInside) {
        const edge = intersection(a, b, false);
        flush();
        current = [...edge];
        if (division === divisions) current.push(...b);
      } else flush();
      a = b;
      aInside = bInside;
    }
  }
  flush();
  return clipped;
}

export function generativeMaskPath(
  settings: GenerativeMaskSettings,
  width: number,
  height: number,
  margin: number,
): string {
  const { cx, cy, rx, ry, exponent } = maskMetrics(settings, width, height, margin);
  const samples = Math.max(
    192,
    Math.ceil(Math.max(settings.maskLfo1Cycles, settings.maskLfo2Cycles, 1) * 32),
  );
  let path = '';
  for (let index = 0; index < samples; index++) {
    const angle = (index / samples) * Math.PI * 2,
      radius = boundaryRadius(settings, angle, exponent),
      x = cx + Math.cos(angle) * rx * radius,
      y = cy + Math.sin(angle) * ry * radius;
    path += `${index ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`;
  }
  return path + 'Z';
}
