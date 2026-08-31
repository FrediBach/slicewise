import type { ContourFeatureKey } from './contour-features';

export const SEQUENCER_PROJECT_VERSION = 1 as const;

export type ScaleName =
  'minor-pentatonic' | 'major-pentatonic' | 'major' | 'natural-minor' | 'dorian' | 'chromatic';
export type ProbabilityCurve = 'linear' | 'ease-in' | 'ease-out' | 'threshold';
export type VariationMode = 'repeat' | 'evolve';
export type LaneDirection = 'forward' | 'reverse' | 'ping-pong';

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
  contourInfluence: number;
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
  gateMinimum: number;
  gateMaximum: number;
  velocityMinimum: number;
  velocityMaximum: number;
  polyphony: 1 | 2 | 3 | 4;
}

export interface DrumLaneSettings {
  voice: 'kick' | 'snare' | 'closed-hat' | 'open-hat' | 'clap' | 'tom';
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
  melody: MelodicLaneSettings;
};
export type DrumLane = SequencerLaneBase & { kind: 'drum'; drum: DrumLaneSettings };
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

const laneBase = (id: string, name: string): SequencerLaneBase => ({
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
  contourInfluence: 100,
});

export function createMelodicLane(id = 'melody-1', name = 'Contour pluck'): MelodicLane {
  return {
    ...laneBase(id, name),
    kind: 'melodic',
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
      gateMinimum: 0.25,
      gateMaximum: 0.9,
      velocityMinimum: 0.35,
      velocityMaximum: 0.95,
      polyphony: 1,
    },
  };
}

export function createDrumLane(id = 'drum-1', name = 'Contour kick'): DrumLane {
  return {
    ...laneBase(id, name),
    pulses: 4,
    kind: 'drum',
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
