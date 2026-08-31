import {
  type ContourFeatureKey,
  type ContourSequenceSource,
  type ContourSliceFeature,
} from './contour-features';
import { autoRotateEuclidean, euclideanRhythm, rotateRhythm } from './euclidean-rhythm';
import { normalizeFeatureValues, quantizeFeatureToMidi } from './music-quantization';
import type { DrumLane, MelodicLane, SequencerLane } from './sequencer-project';

export interface SequenceStepBase {
  index: number;
  sourcePosition: number;
  candidateHit: boolean;
  contourValues: Readonly<Record<ContourFeatureKey, number>>;
}

export interface MelodicSequenceStep extends SequenceStepBase {
  kind: 'melodic';
  midiNote: number;
  velocity: number;
  gate: number;
}

export interface DrumSequenceStep extends SequenceStepBase {
  kind: 'drum';
  voice: DrumLane['drum']['voice'];
  midiNote: number;
  velocity: number;
  decay: number;
  tone: number;
  pan: number;
}

export type ContourSequenceStep = MelodicSequenceStep | DrumSequenceStep;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
const lerp = (minimum: number, maximum: number, amount: number): number =>
  minimum + (maximum - minimum) * amount;

function orderedSlices(
  source: ContourSequenceSource | undefined,
  direction: SequencerLane['direction'],
): ContourSliceFeature[] {
  const slices = source?.slices.slice().sort((a, b) => a.index - b.index) ?? [];
  if (direction === 'reverse') return slices.reverse();
  if (direction === 'ping-pong' && slices.length > 2)
    return [...slices, ...slices.slice(1, -1).reverse()];
  return slices;
}

/** Resolves a musical grid step back to the original contour slices it samples. */
export function contourSlicesForStep(
  lane: SequencerLane,
  source: ContourSequenceSource | undefined,
  stepIndex: number,
): ContourSliceFeature[] {
  const slices = orderedSlices(source, lane.direction);
  if (!slices.length) return [];
  const index = ((Math.round(stepIndex) % lane.steps) + lane.steps) % lane.steps;
  const start = (index * slices.length) / lane.steps;
  const end = ((index + 1) * slices.length) / lane.steps;
  const sampled = slices.slice(Math.floor(start), Math.max(Math.floor(start) + 1, Math.ceil(end)));
  return [...new Map(sampled.map((slice) => [slice.index, slice])).values()];
}

/** Area-averages a descriptor signal onto a stable musical grid. */
export function resampleFeatureValues(values: readonly number[], steps: number): number[] {
  const count = clamp(Math.round(Number.isFinite(steps) ? steps : 1), 1, 64);
  if (!values.length) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, index) => {
    const start = (index * values.length) / count;
    const end = ((index + 1) * values.length) / count;
    let sum = 0;
    let weight = 0;
    for (let sourceIndex = Math.floor(start); sourceIndex < Math.ceil(end); sourceIndex++) {
      const overlap = Math.max(0, Math.min(end, sourceIndex + 1) - Math.max(start, sourceIndex));
      if (!overlap) continue;
      const value = values[sourceIndex];
      sum += (Number.isFinite(value) ? value : 0) * overlap;
      weight += overlap;
    }
    return weight ? sum / weight : 0;
  });
}

function mappedFeature(
  slices: readonly ContourSliceFeature[],
  key: ContourFeatureKey,
  steps: number,
  influence: number,
): number[] {
  const normalized = normalizeFeatureValues(
    resampleFeatureValues(
      slices.map((slice) => slice[key]),
      steps,
    ),
  );
  const amount = clamp(influence, 0, 100) / 100;
  return normalized.map((value) => 0.5 + (value - 0.5) * amount);
}

const featureKeys: readonly ContourFeatureKey[] = [
  'level',
  'pathCount',
  'length',
  'area',
  'centroidX',
  'centroidY',
  'closedness',
  'roughness',
];

function mappedContourValues(
  slices: readonly ContourSliceFeature[],
  steps: number,
  influence: number,
): Record<ContourFeatureKey, number[]> {
  return Object.fromEntries(
    featureKeys.map((key) => [key, mappedFeature(slices, key, steps, influence)]),
  ) as Record<ContourFeatureKey, number[]>;
}

function contourEnergy(values: Readonly<Record<ContourFeatureKey, readonly number[]>>): number[] {
  const sources: ContourFeatureKey[] = ['area', 'length', 'roughness', 'pathCount'];
  return Array.from(
    { length: values.area.length },
    (_, index) => sources.reduce((sum, key) => sum + values[key][index], 0) / sources.length,
  );
}

function gatePattern(
  lane: SequencerLane,
  values: Readonly<Record<ContourFeatureKey, readonly number[]>>,
): boolean[] {
  if (lane.rotation === 'auto')
    return autoRotateEuclidean(lane.steps, lane.pulses, contourEnergy(values)).pattern;
  return rotateRhythm(euclideanRhythm(lane.steps, lane.pulses), lane.rotation);
}

function sourcePosition(index: number, steps: number): number {
  return steps <= 1 ? 0 : index / (steps - 1);
}

function melodicSteps(
  lane: MelodicLane,
  slices: readonly ContourSliceFeature[],
): MelodicSequenceStep[] {
  const values = mappedContourValues(slices, lane.steps, lane.contourInfluence);
  const pitch = values[lane.melody.pitchSource];
  const velocity = values[lane.melody.velocitySource];
  const gate = values[lane.melody.gateSource];
  const notes = quantizeFeatureToMidi(pitch, {
    root: lane.melody.root,
    scale: lane.melody.scale,
    lowestOctave: lane.melody.lowestOctave,
    octaveRange: lane.melody.octaveRange,
    inverted: lane.melody.invertPitch,
    voiceLeading: lane.melody.voiceLeading,
    maximumLeap: lane.melody.maximumLeap,
    valuesAreNormalized: true,
  });
  const pattern = gatePattern(lane, values);
  return notes.map((midiNote, index) => ({
    kind: 'melodic',
    index,
    sourcePosition: sourcePosition(index, notes.length),
    candidateHit: pattern[index],
    contourValues: Object.fromEntries(
      featureKeys.map((key) => [key, values[key][index]]),
    ) as Record<ContourFeatureKey, number>,
    midiNote,
    velocity: lerp(lane.melody.velocityMinimum, lane.melody.velocityMaximum, velocity[index]),
    gate: lerp(lane.melody.gateMinimum, lane.melody.gateMaximum, gate[index]),
  }));
}

function drumSteps(lane: DrumLane, slices: readonly ContourSliceFeature[]): DrumSequenceStep[] {
  const values = mappedContourValues(slices, lane.steps, lane.contourInfluence);
  const velocity = values[lane.drum.velocitySource];
  const decay = values[lane.drum.decaySource];
  const tone = values[lane.drum.toneSource];
  const pan = values[lane.drum.panSource];
  const pattern = gatePattern(lane, values);
  return pattern.map((candidateHit, index) => ({
    kind: 'drum',
    index,
    sourcePosition: sourcePosition(index, pattern.length),
    candidateHit,
    contourValues: Object.fromEntries(
      featureKeys.map((key) => [key, values[key][index]]),
    ) as Record<ContourFeatureKey, number>,
    voice: lane.drum.voice,
    midiNote: clamp(Math.round(lane.drum.midiNote), 0, 127),
    velocity: lerp(lane.drum.velocityMinimum, lane.drum.velocityMaximum, velocity[index]),
    decay: lerp(lane.drum.decayMinimum, lane.drum.decayMaximum, decay[index]),
    tone: lerp(lane.drum.toneMinimum, lane.drum.toneMaximum, tone[index]),
    pan: lerp(lane.drum.panMinimum, lane.drum.panMaximum, pan[index]),
  }));
}

export function createContourSequence(
  lane: SequencerLane,
  source?: ContourSequenceSource,
): ContourSequenceStep[] {
  const slices = orderedSlices(source, lane.direction);
  return lane.kind === 'melodic' ? melodicSteps(lane, slices) : drumSteps(lane, slices);
}
