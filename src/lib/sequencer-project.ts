import type { ContourFeatureKey } from './contour-features';

export const SEQUENCER_PROJECT_VERSION = 5 as const;

export type ScaleName =
  'minor-pentatonic' | 'major-pentatonic' | 'major' | 'natural-minor' | 'dorian' | 'chromatic';
export type ProbabilityCurve = 'linear' | 'ease-in' | 'ease-out' | 'threshold';
export type VariationMode = 'repeat' | 'evolve';
export type LaneDirection = 'forward' | 'reverse' | 'ping-pong';
export type MelodicLanePreset = 'contour-pluck' | 'body-bass' | 'fragmentation-pluck';
export type DrumLanePreset = 'contour-kick' | 'fragmented-snare' | 'roughness-percussion';
export type LanePreset = MelodicLanePreset | DrumLanePreset;
export type VariationTarget = 'accent' | 'octave' | 'articulation' | 'ratchet';
export type MelodicOscillator = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type DrumVoice =
  | 'kick'
  | 'snare'
  | 'closed-hat'
  | 'open-hat'
  | 'clap'
  | 'rimshot'
  | 'low-tom'
  | 'mid-tom'
  | 'high-tom'
  | 'low-conga'
  | 'mid-conga'
  | 'high-conga'
  | 'cowbell'
  | 'crash'
  | 'ride';

export const DRUM_VOICE_OPTIONS: ReadonlyArray<{
  value: DrumVoice;
  label: string;
  midiNote: number;
  chokeGroup: string | null;
}> = [
  { value: 'kick', label: 'Kick', midiNote: 36, chokeGroup: null },
  { value: 'snare', label: 'Snare', midiNote: 38, chokeGroup: null },
  { value: 'clap', label: 'Hand clap', midiNote: 39, chokeGroup: null },
  { value: 'rimshot', label: 'Rimshot', midiNote: 37, chokeGroup: null },
  { value: 'closed-hat', label: 'Closed hi-hat', midiNote: 42, chokeGroup: 'hats' },
  { value: 'open-hat', label: 'Open hi-hat', midiNote: 46, chokeGroup: 'hats' },
  { value: 'low-tom', label: 'Low tom', midiNote: 45, chokeGroup: null },
  { value: 'mid-tom', label: 'Mid tom', midiNote: 47, chokeGroup: null },
  { value: 'high-tom', label: 'High tom', midiNote: 50, chokeGroup: null },
  { value: 'low-conga', label: 'Low conga', midiNote: 64, chokeGroup: null },
  { value: 'mid-conga', label: 'Mid conga', midiNote: 62, chokeGroup: null },
  { value: 'high-conga', label: 'High conga', midiNote: 63, chokeGroup: null },
  { value: 'cowbell', label: 'Cowbell', midiNote: 56, chokeGroup: null },
  { value: 'crash', label: 'Crash cymbal', midiNote: 49, chokeGroup: null },
  { value: 'ride', label: 'Ride cymbal', midiNote: 51, chokeGroup: null },
];

export function drumVoiceDefaults(voice: DrumVoice) {
  return DRUM_VOICE_OPTIONS.find((option) => option.value === voice) ?? DRUM_VOICE_OPTIONS[0];
}

export interface LaneTraversal {
  start: number;
  end: number;
  /** Position around each projected contour used by the preview route. */
  trackPosition: number;
  modulationSource: ContourFeatureKey | 'off';
  /** Negative values dwell on low feature values; positive values dwell on high values. */
  modulationAmount: number;
}

export type LaneTiming =
  | { mode: 'grid'; subdivision: '1/4' | '1/8' | '1/16' | '1/32' }
  | { mode: 'fit'; cycleBars: 1 | 2 | 4 };

export type LaneProbability =
  | { mode: 'off' }
  | {
      mode: 'fixed';
      chance: number;
      variation: VariationMode;
      holdCycles: 1 | 2 | 4 | 8;
    }
  | {
      mode: 'contour';
      source: ContourFeatureKey;
      minimum: number;
      maximum: number;
      curve: ProbabilityCurve;
      inverted: boolean;
      variation: VariationMode;
      holdCycles: 1 | 2 | 4 | 8;
    };

export type LaneVariation =
  | { target: 'off' }
  | {
      target: VariationTarget;
      probability: Exclude<LaneProbability, { mode: 'off' }>;
      amount: number;
    };

export interface SequencerLaneBase {
  id: string;
  name: string;
  steps: number;
  pulses: number;
  rotation: number | 'auto';
  phase: number;
  timing: LaneTiming;
  probability: LaneProbability;
  seedOffset: number;
  muted: boolean;
  solo: boolean;
  direction: LaneDirection;
  traversal: LaneTraversal;
  contourInfluence: number;
  variation: LaneVariation;
}

export interface MelodicLaneSettings {
  root: number;
  scale: ScaleName;
  lowestOctave: number;
  octaveRange: 1 | 2 | 3;
  pitchSource: ContourFeatureKey;
  velocitySource: ContourFeatureKey;
  gateSource: ContourFeatureKey;
  invertPitch: boolean;
  voiceLeading: number;
  maximumLeap: number;
  voice: 'bass' | 'pluck' | 'soft-lead';
  oscillator: MelodicOscillator;
  brightness: number;
  resonance: number;
  subOscillator: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  gateMinimum: number;
  gateMaximum: number;
  velocityMinimum: number;
  velocityMaximum: number;
  polyphony: 1 | 2 | 3 | 4;
}

export interface DrumLaneSettings {
  voice: DrumVoice;
  midiNote: number;
  velocitySource: ContourFeatureKey;
  decaySource: ContourFeatureKey;
  toneSource: ContourFeatureKey;
  panSource: ContourFeatureKey;
  velocityMinimum: number;
  velocityMaximum: number;
  decayMinimum: number;
  decayMaximum: number;
  toneMinimum: number;
  toneMaximum: number;
  panMinimum: number;
  panMaximum: number;
  chokeGroup: string | null;
}

export type MelodicLane = SequencerLaneBase & {
  kind: 'melodic';
  preset: MelodicLanePreset;
  melody: MelodicLaneSettings;
};
export type DrumLane = SequencerLaneBase & {
  kind: 'drum';
  preset: DrumLanePreset;
  drum: DrumLaneSettings;
};
export type SequencerLane = MelodicLane | DrumLane;

export interface SequencerProject {
  version: typeof SEQUENCER_PROJECT_VERSION;
  name: string;
  tempo: number;
  timeSignature: { numerator: number; denominator: 4 | 8 | 16 };
  swing: number;
  seed: number;
  resetBars: 0 | 1 | 2 | 4 | 8 | 16;
  harmony: { root: number; scale: ScaleName };
  lanes: SequencerLane[];
}

const laneBase = (id: string, name: string, trackPosition: number): SequencerLaneBase => ({
  id,
  name,
  steps: 16,
  pulses: 5,
  rotation: 'auto',
  phase: 0,
  timing: { mode: 'grid', subdivision: '1/16' },
  probability: { mode: 'off' },
  seedOffset: 0,
  muted: false,
  solo: false,
  direction: 'forward',
  traversal: { start: 0, end: 100, trackPosition, modulationSource: 'off', modulationAmount: 0 },
  contourInfluence: 100,
  variation: { target: 'off' },
});

export function createMelodicLane(
  id = 'melody-1',
  name = 'Contour pluck',
  preset: MelodicLanePreset = 'contour-pluck',
): MelodicLane {
  const lane: MelodicLane = {
    ...laneBase(id, name, 25),
    kind: 'melodic',
    preset: 'contour-pluck',
    melody: {
      root: 0,
      scale: 'minor-pentatonic',
      lowestOctave: 3,
      octaveRange: 2,
      pitchSource: 'area',
      velocitySource: 'length',
      gateSource: 'closedness',
      invertPitch: false,
      voiceLeading: 0.75,
      maximumLeap: 7,
      voice: 'pluck',
      oscillator: 'triangle',
      brightness: 0.62,
      resonance: 5,
      subOscillator: 0,
      attack: 0.004,
      decay: 0.16,
      sustain: 0.18,
      release: 0.12,
      gateMinimum: 0.25,
      gateMaximum: 0.9,
      velocityMinimum: 0.35,
      velocityMaximum: 0.95,
      polyphony: 1,
    },
  };
  return preset === 'contour-pluck' ? lane : applyLanePreset(lane, preset);
}

export function createDrumLane(
  id = 'drum-1',
  name = 'Contour kick',
  preset: DrumLanePreset = 'contour-kick',
): DrumLane {
  const lane: DrumLane = {
    ...laneBase(id, name, 75),
    pulses: 4,
    kind: 'drum',
    preset: 'contour-kick',
    drum: {
      voice: 'kick',
      midiNote: 36,
      velocitySource: 'area',
      decaySource: 'closedness',
      toneSource: 'roughness',
      panSource: 'centroidX',
      velocityMinimum: 0.45,
      velocityMaximum: 1,
      decayMinimum: 0.12,
      decayMaximum: 0.4,
      toneMinimum: 0.25,
      toneMaximum: 0.75,
      panMinimum: 0,
      panMaximum: 0,
      chokeGroup: null,
    },
  };
  return preset === 'contour-kick' ? lane : applyLanePreset(lane, preset);
}

const contourCondition = (
  source: ContourFeatureKey,
  minimum: number,
  maximum: number,
  inverted = false,
): Exclude<LaneProbability, { mode: 'off' }> => ({
  mode: 'contour',
  source,
  minimum,
  maximum,
  curve: 'ease-in',
  inverted,
  variation: 'evolve',
  holdCycles: 1,
});

/** Applies musical/mapping defaults while retaining lane identity and transport state. */
export function applyLanePreset(lane: MelodicLane, preset: MelodicLanePreset): MelodicLane;
export function applyLanePreset(lane: DrumLane, preset: DrumLanePreset): DrumLane;
export function applyLanePreset(lane: SequencerLane, preset: LanePreset): SequencerLane {
  if (lane.kind === 'melodic') {
    if (preset === 'body-bass')
      return {
        ...lane,
        name: 'Body bass',
        preset,
        pulses: Math.min(lane.steps, 5),
        variation: {
          target: 'accent',
          probability: contourCondition('length', 25, 85),
          amount: 0.3,
        },
        melody: {
          ...lane.melody,
          voice: 'bass',
          oscillator: 'sawtooth',
          brightness: 0.38,
          resonance: 1.2,
          subOscillator: 0.45,
          attack: 0.01,
          decay: 0.22,
          sustain: 0.55,
          release: 0.18,
          pitchSource: 'area',
          velocitySource: 'length',
          gateSource: 'closedness',
          lowestOctave: 2,
          octaveRange: 2,
          maximumLeap: 5,
          gateMinimum: 0.45,
          gateMaximum: 0.95,
        },
      };
    if (preset === 'fragmentation-pluck')
      return {
        ...lane,
        name: 'Fragmentation pluck',
        preset,
        pulses: Math.min(lane.steps, 7),
        variation: {
          target: 'octave',
          probability: contourCondition('pathCount', 10, 65),
          amount: 12,
        },
        melody: {
          ...lane.melody,
          voice: 'pluck',
          oscillator: 'square',
          brightness: 0.72,
          resonance: 6.5,
          subOscillator: 0,
          attack: 0.002,
          decay: 0.1,
          sustain: 0.08,
          release: 0.08,
          pitchSource: 'centroidY',
          velocitySource: 'pathCount',
          gateSource: 'closedness',
          lowestOctave: 3,
          octaveRange: 2,
          gateMinimum: 0.15,
          gateMaximum: 0.65,
        },
      };
    const defaults = createMelodicLane(lane.id);
    return {
      ...defaults,
      steps: lane.steps,
      pulses: Math.min(defaults.pulses, lane.steps),
      rotation: lane.rotation,
      phase: lane.phase,
      timing: lane.timing,
      probability: lane.probability,
      seedOffset: lane.seedOffset,
      muted: lane.muted,
      solo: lane.solo,
      direction: lane.direction,
      traversal: lane.traversal,
      contourInfluence: lane.contourInfluence,
    };
  }
  if (preset === 'fragmented-snare')
    return {
      ...lane,
      name: 'Fragmented snare',
      preset,
      pulses: Math.min(lane.steps, 5),
      variation: {
        target: 'articulation',
        probability: contourCondition('pathCount', 20, 80),
        amount: 0.55,
      },
      drum: {
        ...lane.drum,
        voice: 'snare',
        midiNote: 38,
        velocitySource: 'pathCount',
        decaySource: 'closedness',
        toneSource: 'roughness',
        panMinimum: -0.15,
        panMaximum: 0.15,
      },
    };
  if (preset === 'roughness-percussion')
    return {
      ...lane,
      name: 'Roughness percussion',
      preset,
      pulses: Math.min(lane.steps, 9),
      variation: {
        target: 'ratchet',
        probability: contourCondition('roughness', 5, 60),
        amount: 3,
      },
      drum: {
        ...lane.drum,
        voice: 'closed-hat',
        midiNote: 42,
        velocitySource: 'roughness',
        decaySource: 'roughness',
        toneSource: 'roughness',
        panMinimum: -0.35,
        panMaximum: 0.35,
        chokeGroup: 'hats',
      },
    };
  const defaults = createDrumLane(lane.id);
  return {
    ...defaults,
    steps: lane.steps,
    pulses: Math.min(defaults.pulses, lane.steps),
    rotation: lane.rotation,
    phase: lane.phase,
    timing: lane.timing,
    probability: lane.probability,
    seedOffset: lane.seedOffset,
    muted: lane.muted,
    solo: lane.solo,
    direction: lane.direction,
    traversal: lane.traversal,
    contourInfluence: lane.contourInfluence,
  };
}

export function setLaneVariationTarget(
  lane: SequencerLane,
  target: LaneVariation['target'],
): SequencerLane {
  if (target === 'off') return { ...lane, variation: { target: 'off' } };
  if (target === 'octave' && lane.kind === 'drum') return lane;
  const source =
    target === 'accent'
      ? lane.kind === 'melodic'
        ? lane.melody.velocitySource
        : lane.drum.velocitySource
      : target === 'articulation'
        ? lane.kind === 'melodic'
          ? lane.melody.gateSource
          : lane.drum.decaySource
        : 'roughness';
  return {
    ...lane,
    variation: {
      target,
      probability: contourCondition(source, 15, 70),
      amount:
        target === 'octave' ? 12 : target === 'ratchet' ? 2 : target === 'accent' ? 0.25 : 0.5,
    },
  };
}

export function createSequencerProject(): SequencerProject {
  return {
    version: SEQUENCER_PROJECT_VERSION,
    name: 'Untitled contour sequence',
    tempo: 110,
    timeSignature: { numerator: 4, denominator: 4 },
    swing: 0,
    seed: 1,
    resetBars: 0,
    harmony: { root: 0, scale: 'minor-pentatonic' },
    lanes: [createMelodicLane(), createDrumLane()],
  };
}
