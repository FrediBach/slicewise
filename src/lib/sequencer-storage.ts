import {
  DRUM_VOICE_OPTIONS,
  SEQUENCER_PROJECT_VERSION,
  sequencerLaneColor,
  type SequencerLane,
  type SequencerProject,
} from './sequencer-project';

const STORAGE_KEY = 'slicewise.sequencerProject';

export interface StoredSequencerProject {
  storageVersion: 1;
  updatedAt: string;
  project: SequencerProject;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const featureKeys = [
  'level',
  'pathCount',
  'length',
  'area',
  'centroidX',
  'centroidY',
  'closedness',
  'roughness',
];
const scales = [
  'minor-pentatonic',
  'major-pentatonic',
  'major',
  'natural-minor',
  'dorian',
  'chromatic',
];
const melodicOscillators = ['sine', 'triangle', 'sawtooth', 'square'];

function within(value: unknown, minimum: number, maximum: number): value is number {
  return finite(value) && value >= minimum && value <= maximum;
}

function validProbability(value: Record<string, unknown>): boolean {
  if (value.mode === 'off') return true;
  if (
    !['repeat', 'evolve'].includes(String(value.variation)) ||
    ![1, 2, 4, 8].includes(Number(value.holdCycles))
  )
    return false;
  if (value.mode === 'fixed') return within(value.chance, 0, 100);
  return (
    value.mode === 'contour' &&
    featureKeys.includes(String(value.source)) &&
    within(value.minimum, 0, 100) &&
    within(value.maximum, 0, 100) &&
    ['linear', 'ease-in', 'ease-out', 'threshold'].includes(String(value.curve)) &&
    typeof value.inverted === 'boolean'
  );
}

function validVariation(value: Record<string, unknown>): boolean {
  if (value.target === 'off') return true;
  if (
    !['accent', 'octave', 'articulation', 'ratchet'].includes(String(value.target)) ||
    !isRecord(value.probability) ||
    value.probability.mode === 'off' ||
    !validProbability(value.probability)
  )
    return false;
  if (value.target === 'accent') return within(value.amount, 0, 1);
  if (value.target === 'octave') return [12, 24].includes(Number(value.amount));
  if (value.target === 'articulation') return within(value.amount, 0, 0.9);
  return [2, 3, 4].includes(Number(value.amount));
}

function validMelody(value: Record<string, unknown>): boolean {
  return (
    within(value.root, 0, 11) &&
    Number.isInteger(value.root) &&
    scales.includes(String(value.scale)) &&
    within(value.lowestOctave, -1, 9) &&
    Number.isInteger(value.lowestOctave) &&
    [1, 2, 3].includes(Number(value.octaveRange)) &&
    featureKeys.includes(String(value.pitchSource)) &&
    featureKeys.includes(String(value.velocitySource)) &&
    featureKeys.includes(String(value.gateSource)) &&
    typeof value.invertPitch === 'boolean' &&
    within(value.voiceLeading, 0, 1) &&
    within(value.maximumLeap, 0, 127) &&
    Number.isInteger(value.maximumLeap) &&
    ['bass', 'pluck', 'soft-lead'].includes(String(value.voice)) &&
    melodicOscillators.includes(String(value.oscillator)) &&
    within(value.brightness, 0, 1) &&
    within(value.resonance, 0, 20) &&
    within(value.subOscillator, 0, 1) &&
    within(value.attack, 0.001, 2) &&
    within(value.decay, 0.01, 3) &&
    within(value.sustain, 0, 1) &&
    within(value.release, 0.01, 5) &&
    within(value.gateMinimum, 0, 1) &&
    within(value.gateMaximum, 0, 1) &&
    within(value.velocityMinimum, 0, 1) &&
    within(value.velocityMaximum, 0, 1) &&
    [1, 2, 3, 4].includes(Number(value.polyphony))
  );
}

function validDrum(value: Record<string, unknown>): boolean {
  return (
    DRUM_VOICE_OPTIONS.some(({ value: voice }) => voice === value.voice) &&
    within(value.midiNote, 0, 127) &&
    Number.isInteger(value.midiNote) &&
    featureKeys.includes(String(value.velocitySource)) &&
    featureKeys.includes(String(value.decaySource)) &&
    featureKeys.includes(String(value.toneSource)) &&
    featureKeys.includes(String(value.panSource)) &&
    within(value.velocityMinimum, 0, 1) &&
    within(value.velocityMaximum, 0, 1) &&
    within(value.decayMinimum, 0, 3) &&
    within(value.decayMaximum, 0, 3) &&
    within(value.toneMinimum, 0, 1) &&
    within(value.toneMaximum, 0, 1) &&
    within(value.panMinimum, -1, 1) &&
    within(value.panMaximum, -1, 1) &&
    (value.chokeGroup === null || typeof value.chokeGroup === 'string')
  );
}

function validLane(lane: unknown): lane is SequencerLane {
  if (!isRecord(lane)) return false;
  if (
    typeof lane.id !== 'string' ||
    !lane.id.trim() ||
    typeof lane.name !== 'string' ||
    typeof lane.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(lane.color) ||
    !finite(lane.steps) ||
    lane.steps < 1 ||
    lane.steps > 64 ||
    !Number.isInteger(lane.steps) ||
    !finite(lane.pulses) ||
    lane.pulses < 0 ||
    lane.pulses > lane.steps ||
    !Number.isInteger(lane.pulses) ||
    !(lane.rotation === 'auto' || (finite(lane.rotation) && Number.isInteger(lane.rotation))) ||
    !finite(lane.phase) ||
    !Number.isInteger(lane.phase) ||
    !isRecord(lane.timing) ||
    !isRecord(lane.probability) ||
    !finite(lane.seedOffset) ||
    typeof lane.muted !== 'boolean' ||
    typeof lane.solo !== 'boolean' ||
    !['forward', 'reverse', 'ping-pong'].includes(String(lane.direction)) ||
    !isRecord(lane.traversal) ||
    !within(lane.traversal.start, 0, 100) ||
    !within(lane.traversal.end, 0, 100) ||
    lane.traversal.start > lane.traversal.end ||
    !within(lane.traversal.trackPosition, 0, 100) ||
    !['off', ...featureKeys].includes(String(lane.traversal.modulationSource)) ||
    !within(lane.traversal.modulationAmount, -100, 100) ||
    !within(lane.contourInfluence, 0, 100) ||
    !isRecord(lane.variation) ||
    !validVariation(lane.variation)
  )
    return false;
  if (!(
    (lane.timing.mode === 'grid' &&
      ['1/4', '1/8', '1/16', '1/32'].includes(String(lane.timing.subdivision))) ||
    (lane.timing.mode === 'fit' && [1, 2, 4].includes(Number(lane.timing.cycleBars)))
  ))
    return false;
  if (!validProbability(lane.probability)) return false;
  if (lane.kind === 'drum' && lane.variation.target === 'octave') return false;
  return (
    (lane.kind === 'melodic' &&
      ['contour-pluck', 'body-bass', 'fragmentation-pluck'].includes(String(lane.preset)) &&
      isRecord(lane.melody) &&
      validMelody(lane.melody)) ||
    (lane.kind === 'drum' &&
      ['contour-kick', 'fragmented-snare', 'roughness-percussion'].includes(String(lane.preset)) &&
      isRecord(lane.drum) &&
      validDrum(lane.drum))
  );
}

function migrateProject(candidate: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(candidate.lanes)) return candidate;
  let migrated = candidate;
  if (migrated.version === 1)
    migrated = {
      ...migrated,
      version: 2,
      lanes: (migrated.lanes as unknown[]).map((lane) => {
        if (!isRecord(lane)) return lane;
        return {
          ...lane,
          preset: lane.kind === 'drum' ? 'contour-kick' : 'contour-pluck',
          variation: { target: 'off' },
        };
      }),
    };
  if (migrated.version === 2)
    migrated = {
      ...migrated,
      version: 3,
      lanes: (migrated.lanes as unknown[]).map((lane) =>
        isRecord(lane)
          ? {
              ...lane,
              traversal: {
                start: 0,
                end: 100,
                modulationSource: 'off',
                modulationAmount: 0,
              },
            }
          : lane,
      ),
    };
  if (migrated.version === 3)
    migrated = {
      ...migrated,
      version: 4,
      lanes: (migrated.lanes as unknown[]).map((lane, index) => {
        if (!isRecord(lane) || !isRecord(lane.traversal)) return lane;
        return {
          ...lane,
          traversal: {
            ...lane.traversal,
            trackPosition: index % 2 === 0 ? 25 : 75,
          },
        };
      }),
    };
  if (migrated.version === 4)
    migrated = {
      ...migrated,
      version: 5,
      lanes: (migrated.lanes as unknown[]).map((lane) => {
        if (!isRecord(lane)) return lane;
        if (lane.kind === 'melodic' && isRecord(lane.melody)) {
          const voice = String(lane.melody.voice);
          const sound =
            voice === 'bass'
              ? {
                  oscillator: 'sawtooth',
                  brightness: 0.38,
                  resonance: 1.2,
                  subOscillator: 0.45,
                  attack: 0.01,
                  decay: 0.22,
                  sustain: 0.55,
                  release: 0.18,
                }
              : voice === 'soft-lead'
                ? {
                    oscillator: 'sine',
                    brightness: 0.55,
                    resonance: 1.2,
                    subOscillator: 0,
                    attack: 0.04,
                    decay: 0.3,
                    sustain: 0.7,
                    release: 0.4,
                  }
                : {
                    oscillator: 'triangle',
                    brightness: 0.62,
                    resonance: 5,
                    subOscillator: 0,
                    attack: 0.004,
                    decay: 0.16,
                    sustain: 0.18,
                    release: 0.12,
                  };
          return { ...lane, melody: { ...lane.melody, ...sound } };
        }
        if (lane.kind === 'drum' && isRecord(lane.drum) && lane.drum.voice === 'tom')
          return { ...lane, drum: { ...lane.drum, voice: 'mid-tom', midiNote: 47 } };
        return lane;
      }),
    };
  if (migrated.version === 5)
    migrated = {
      ...migrated,
      version: SEQUENCER_PROJECT_VERSION,
      lanes: (migrated.lanes as unknown[]).map((lane, index) =>
        isRecord(lane) ? { ...lane, color: sequencerLaneColor(index) } : lane,
      ),
    };
  return migrated;
}

export function restoreStoredSequencerProject(value: unknown): SequencerProject | null {
  const storedCandidate =
    isRecord(value) && value.storageVersion === 1 && 'project' in value ? value.project : value;
  if (!isRecord(storedCandidate)) return null;
  const candidate = migrateProject(storedCandidate);
  if (
    candidate.version !== SEQUENCER_PROJECT_VERSION ||
    typeof candidate.name !== 'string' ||
    !finite(candidate.tempo) ||
    candidate.tempo < 40 ||
    candidate.tempo > 240 ||
    !isRecord(candidate.timeSignature) ||
    !within(candidate.timeSignature.numerator, 1, 32) ||
    !Number.isInteger(candidate.timeSignature.numerator) ||
    ![4, 8, 16].includes(Number(candidate.timeSignature.denominator)) ||
    !within(candidate.swing, 0, 70) ||
    !finite(candidate.seed) ||
    ![0, 1, 2, 4, 8, 16].includes(Number(candidate.resetBars)) ||
    !isRecord(candidate.harmony) ||
    !within(candidate.harmony.root, 0, 11) ||
    !Number.isInteger(candidate.harmony.root) ||
    !scales.includes(String(candidate.harmony.scale)) ||
    !Array.isArray(candidate.lanes) ||
    candidate.lanes.length > 64 ||
    !candidate.lanes.every(validLane)
  )
    return null;
  const ids = new Set(candidate.lanes.map((lane) => lane.id));
  if (ids.size !== candidate.lanes.length) return null;
  return structuredClone(candidate) as unknown as SequencerProject;
}

export function loadSequencerProject(storage?: StorageLike): SequencerProject | null {
  try {
    const serialized = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
    return serialized ? restoreStoredSequencerProject(JSON.parse(serialized)) : null;
  } catch {
    return null;
  }
}

export function saveSequencerProject(project: SequencerProject, storage?: StorageLike): void {
  if (!restoreStoredSequencerProject(project))
    throw new Error('Cannot save invalid sequencer project');
  const stored: StoredSequencerProject = {
    storageVersion: 1,
    updatedAt: new Date().toISOString(),
    project: structuredClone(project),
  };
  (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify(stored));
}
