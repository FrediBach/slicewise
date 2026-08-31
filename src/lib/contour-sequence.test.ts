import { describe, expect, it } from 'vitest';
import type { ContourSequenceSource } from './contour-features';
import { createContourSequence, resampleFeatureValues } from './contour-sequence';
import { scaleRegister } from './music-quantization';
import { createDrumLane, createMelodicLane } from './sequencer-project';

const source: ContourSequenceSource = {
  version: 1,
  slices: Array.from({ length: 8 }, (_, index) => ({
    index,
    level: index / 7,
    pathCount: index + 1,
    length: (index + 1) * 10,
    area: index === 5 ? 500 : index * index,
    centroidX: index * 2,
    centroidY: 20 - index,
    closedness: index / 7,
    roughness: index % 2,
  })),
};

describe('resampleFeatureValues', () => {
  it('area-averages signals when reducing or expanding the grid', () => {
    expect(resampleFeatureValues([0, 2, 4, 6], 2)).toEqual([1, 5]);
    expect(resampleFeatureValues([2, 6], 4)).toEqual([2, 2, 6, 6]);
    expect(resampleFeatureValues([], 3)).toEqual([0, 0, 0]);
  });
});

describe('createContourSequence', () => {
  it('creates scale-safe melodic steps with exactly the Euclidean pulse count', () => {
    const lane = {
      ...createMelodicLane(),
      steps: 8,
      pulses: 3,
      melody: { ...createMelodicLane().melody, maximumLeap: 5 },
    };
    const sequence = createContourSequence(lane, source);
    const register = scaleRegister(lane.melody);

    expect(sequence).toHaveLength(8);
    expect(sequence.filter((step) => step.candidateHit)).toHaveLength(3);
    expect(sequence.every((step) => step.kind === 'melodic')).toBe(true);
    expect(sequence.every((step) => register.includes(step.midiNote))).toBe(true);
    expect(
      sequence
        .slice(1)
        .every(
          (step, index) =>
            Math.abs(step.midiNote - sequence[index].midiNote) <= lane.melody.maximumLeap,
        ),
    ).toBe(true);
  });

  it('reverses descriptor mappings without rotating the Euclidean gate', () => {
    const forwardLane = { ...createMelodicLane(), steps: 8, rotation: 0 as const };
    const reverseLane = { ...forwardLane, direction: 'reverse' as const };
    const forward = createContourSequence(forwardLane, source);
    const reverse = createContourSequence(reverseLane, source);

    expect(reverse.map((step) => step.candidateHit)).toEqual(
      forward.map((step) => step.candidateHit),
    );
    expect(reverse[0].velocity).toBeCloseTo(forward.at(-1)!.velocity);
    expect(reverse.at(-1)!.velocity).toBeCloseTo(forward[0].velocity);
  });

  it('creates bounded drum expression from the shared contour source', () => {
    const lane = { ...createDrumLane(), steps: 8, pulses: 2 };
    const sequence = createContourSequence(lane, source);

    expect(sequence.filter((step) => step.candidateHit)).toHaveLength(2);
    expect(sequence.every((step) => step.kind === 'drum' && step.voice === 'kick')).toBe(true);
    expect(sequence.every((step) => step.midiNote === 36)).toBe(true);
    expect(
      sequence.every((step) => {
        if (step.kind !== 'drum') return false;
        return (
          step.velocity >= lane.drum.velocityMinimum &&
          step.velocity <= lane.drum.velocityMaximum &&
          step.pan >= lane.drum.panMinimum &&
          step.pan <= lane.drum.panMaximum
        );
      }),
    ).toBe(true);
  });

  it('keeps missing geometry deterministic and contour influence neutral', () => {
    const lane = { ...createMelodicLane(), steps: 4, contourInfluence: 0 };
    expect(createContourSequence(lane)).toEqual(createContourSequence(lane, source));
  });
});
