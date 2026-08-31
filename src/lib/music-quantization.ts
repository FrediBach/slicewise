import type { ScaleName } from './sequencer-project';

export const SCALE_INTERVALS: Readonly<Record<ScaleName, readonly number[]>> = {
  'minor-pentatonic': [0, 3, 5, 7, 10],
  'major-pentatonic': [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural-minor': [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function percentile(sorted: readonly number[], position: number): number {
  if (!sorted.length) return 0;
  const index = clamp(position, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(index);
  const blend = index - lower;
  return sorted[lower] + (sorted[Math.min(sorted.length - 1, lower + 1)] - sorted[lower]) * blend;
}

/** Normalizes finite values against their robust 10th–90th percentile span. */
export function normalizeFeatureValues(values: readonly number[]): number[] {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return values.map(() => 0.5);
  const low = percentile(finite, 0.1);
  const high = percentile(finite, 0.9);
  if (Math.abs(high - low) <= 1e-12) return values.map(() => 0.5);
  return values.map((value) =>
    Number.isFinite(value) ? clamp((value - low) / (high - low), 0, 1) : 0.5,
  );
}

function rankMap(values: readonly number[]): number[] {
  if (values.length <= 1) return values.map(() => 0.5);
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const ranks = Array.from({ length: values.length }, () => 0.5);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end++;
    const rank = (start + end - 1) / 2 / (ordered.length - 1);
    for (let index = start; index < end; index++) ranks[ordered[index].index] = rank;
    start = end;
  }
  return ranks;
}

export interface QuantizationSettings {
  root: number;
  scale: ScaleName;
  lowestOctave: number;
  octaveRange: 1 | 2 | 3;
  inverted?: boolean;
  voiceLeading: number;
  maximumLeap: number;
  valuesAreNormalized?: boolean;
}

export function scaleRegister(settings: QuantizationSettings): number[] {
  const root = ((Math.round(settings.root) % 12) + 12) % 12;
  const firstRoot = (Math.round(settings.lowestOctave) + 1) * 12 + root;
  const notes: number[] = [];
  for (let octave = 0; octave < settings.octaveRange; octave++)
    for (const interval of SCALE_INTERVALS[settings.scale]) {
      const note = firstRoot + octave * 12 + interval;
      if (note >= 0 && note <= 127) notes.push(note);
    }
  return notes.length ? notes : [clamp(firstRoot, 0, 127)];
}

function closestCandidate(
  candidates: readonly number[],
  target: number,
  previous: number,
  voiceLeading: number,
): number {
  let best = candidates[0];
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const score =
      Math.abs(candidate - target) * (1 - voiceLeading) +
      Math.abs(candidate - previous) * voiceLeading;
    if (score < bestScore - 1e-12 || (Math.abs(score - bestScore) <= 1e-12 && candidate < best)) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Maps arbitrary geometry values into one deterministic, scale-safe melodic line. */
export function quantizeFeatureToMidi(
  values: readonly number[],
  settings: QuantizationSettings,
): number[] {
  const normalized = settings.valuesAreNormalized
    ? values.map((value) => (Number.isFinite(value) ? clamp(value, 0, 1) : 0.5))
    : rankMap(normalizeFeatureValues(values));
  const register = scaleRegister(settings);
  const voiceLeading = clamp(settings.voiceLeading, 0, 1);
  const maximumLeap = clamp(Math.round(settings.maximumLeap), 0, 127);
  const output: number[] = [];

  for (const normalizedValue of normalized) {
    const position = settings.inverted ? 1 - normalizedValue : normalizedValue;
    const target = register[Math.round(position * (register.length - 1))];
    if (!output.length) {
      output.push(target);
      continue;
    }
    const previous = output[output.length - 1];
    const pitchClass = ((target % 12) + 12) % 12;
    const equivalents = register.filter((note) => note % 12 === pitchClass);
    let selected = closestCandidate(equivalents, target, previous, voiceLeading);
    if (Math.abs(selected - previous) > maximumLeap) {
      const reachable = register.filter((note) => Math.abs(note - previous) <= maximumLeap);
      selected = reachable.length
        ? closestCandidate(reachable, target, previous, 0)
        : closestCandidate(register, previous, previous, 1);
    }
    output.push(selected);
  }
  return output;
}
