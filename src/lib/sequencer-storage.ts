import {
  SEQUENCER_PROJECT_VERSION,
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
    within(value.gateMinimum, 0, 1) &&
    within(value.gateMaximum, 0, 1) &&
    within(value.velocityMinimum, 0, 1) &&
    within(value.velocityMaximum, 0, 1) &&
    [1, 2, 3, 4].includes(Number(value.polyphony))
  );
}

function validDrum(value: Record<string, unknown>): boolean {
  return (
    ['kick', 'snare', 'closed-hat', 'open-hat', 'clap', 'tom'].includes(String(value.voice)) &&
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
    !within(lane.contourInfluence, 0, 100)
  )
    return false;
  if (!(
    (lane.timing.mode === 'grid' &&
      ['1/4', '1/8', '1/16', '1/32'].includes(String(lane.timing.subdivision))) ||
    (lane.timing.mode === 'fit' && [1, 2, 4].includes(Number(lane.timing.cycleBars)))
  ))
    return false;
  if (!validProbability(lane.probability)) return false;
  return (
    (lane.kind === 'melodic' && isRecord(lane.melody) && validMelody(lane.melody)) ||
    (lane.kind === 'drum' && isRecord(lane.drum) && validDrum(lane.drum))
  );
}

export function restoreStoredSequencerProject(value: unknown): SequencerProject | null {
  const candidate =
    isRecord(value) && value.storageVersion === 1 && 'project' in value ? value.project : value;
  if (!isRecord(candidate)) return null;
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
