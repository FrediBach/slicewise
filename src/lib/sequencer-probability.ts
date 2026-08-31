import type { ContourSequenceStep } from './contour-sequence';
import type { LaneProbability, ProbabilityCurve, SequencerLane } from './sequencer-project';

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export function probabilityCurve(curve: ProbabilityCurve, value: number): number {
  const normalized = clamp(Number.isFinite(value) ? value : 0.5, 0, 1);
  if (curve === 'ease-in') return normalized * normalized;
  if (curve === 'ease-out') return 1 - (1 - normalized) * (1 - normalized);
  if (curve === 'threshold') return normalized >= 0.5 ? 1 : 0;
  return normalized;
}

export function probabilityChance(probability: LaneProbability, contourValue = 0.5): number {
  if (probability.mode === 'off') return 1;
  if (probability.mode === 'fixed') return clamp(probability.chance, 0, 100) / 100;
  const lower = Math.min(probability.minimum, probability.maximum);
  const upper = Math.max(probability.minimum, probability.maximum);
  const shape = probability.inverted ? 1 - contourValue : contourValue;
  const amount = probabilityCurve(probability.curve, shape);
  return clamp(lower + (upper - lower) * amount, 0, 100) / 100;
}

/** Stable coordinate hash; playback and export never consume mutable PRNG state. */
export function seededProbabilityValue(
  projectSeed: number,
  laneId: string,
  seedOffset: number,
  heldCycle: number | null,
  stepIndex: number,
): number {
  const coordinate = `${Math.round(projectSeed)}|${laneId}|${Math.round(seedOffset)}|${heldCycle ?? 'repeat'}|${Math.round(stepIndex)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < coordinate.length; index++) {
    hash ^= coordinate.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

export function probabilityHeldCycle(
  probability: Exclude<LaneProbability, { mode: 'off' }>,
  cycleIndex: number,
): number | null {
  return probability.variation === 'repeat'
    ? null
    : Math.floor(Math.max(0, cycleIndex) / probability.holdCycles);
}

export function resolveStepTrigger(
  projectSeed: number,
  lane: SequencerLane,
  step: ContourSequenceStep,
  cycleIndex: number,
): boolean {
  if (!step.candidateHit) return false;
  const probability = lane.probability;
  if (probability.mode === 'off') return true;
  const heldCycle = probabilityHeldCycle(probability, cycleIndex);
  const contourValue =
    probability.mode === 'contour' ? step.contourValues[probability.source] : 0.5;
  return (
    seededProbabilityValue(projectSeed, lane.id, lane.seedOffset, heldCycle, step.index) <
    probabilityChance(probability, contourValue)
  );
}
