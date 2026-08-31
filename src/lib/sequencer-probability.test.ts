import { describe, expect, it } from 'vitest';
import { createContourSequence } from './contour-sequence';
import {
  probabilityChance,
  probabilityCurve,
  probabilityHeldCycle,
  resolveStepVariation,
  resolveStepTrigger,
  seededProbabilityValue,
} from './sequencer-probability';
import { createMelodicLane } from './sequencer-project';

describe('sequencer probability', () => {
  it('maps fixed and contour probability ranges with bounded curves', () => {
    expect(
      probabilityChance({ mode: 'fixed', chance: 35, variation: 'repeat', holdCycles: 1 }),
    ).toBe(0.35);
    expect(
      probabilityChance(
        {
          mode: 'contour',
          source: 'area',
          minimum: 20,
          maximum: 80,
          curve: 'linear',
          inverted: false,
          variation: 'repeat',
          holdCycles: 1,
        },
        0.5,
      ),
    ).toBe(0.5);
    expect(probabilityCurve('ease-in', 0.5)).toBe(0.25);
    expect(probabilityCurve('ease-out', 0.5)).toBe(0.75);
    expect(probabilityCurve('threshold', 0.49)).toBe(0);
  });

  it('keeps Repeat coordinates stable and changes Evolve only at hold boundaries', () => {
    const repeatA = seededProbabilityValue(42, 'lead', 3, null, 5);
    const repeatB = seededProbabilityValue(42, 'lead', 3, null, 5);
    const heldA = seededProbabilityValue(42, 'lead', 3, 0, 5);
    const heldB = seededProbabilityValue(42, 'lead', 3, 1, 5);

    expect(repeatA).toBe(repeatB);
    expect(heldA).not.toBe(heldB);
    expect(
      [0, 1, 2, 3, 4].map((cycle) =>
        probabilityHeldCycle(
          { mode: 'fixed', chance: 50, variation: 'evolve', holdCycles: 2 },
          cycle,
        ),
      ),
    ).toEqual([0, 0, 1, 1, 2]);
    expect(
      probabilityHeldCycle({ mode: 'fixed', chance: 50, variation: 'repeat', holdCycles: 1 }, 999),
    ).toBeNull();
  });

  it('applies probability only after the Euclidean candidate gate', () => {
    const base = { ...createMelodicLane(), steps: 4, pulses: 1, rotation: 0 as const };
    const steps = createContourSequence(base);
    const candidate = steps.find((step) => step.candidateHit)!;
    const rest = steps.find((step) => !step.candidateHit)!;
    const certain = {
      ...base,
      probability: {
        mode: 'fixed' as const,
        chance: 100,
        variation: 'evolve' as const,
        holdCycles: 2 as const,
      },
    };
    const impossible = {
      ...certain,
      probability: { ...certain.probability, chance: 0 },
    };

    expect(resolveStepTrigger(1, certain, candidate, 100)).toBe(true);
    expect(resolveStepTrigger(1, certain, rest, 100)).toBe(false);
    expect(resolveStepTrigger(1, impossible, candidate, 100)).toBe(false);
  });

  it('uses the configured contour descriptor reproducibly', () => {
    const lane = {
      ...createMelodicLane(),
      steps: 2,
      pulses: 2,
      probability: {
        mode: 'contour' as const,
        source: 'area' as const,
        minimum: 0,
        maximum: 100,
        curve: 'threshold' as const,
        inverted: false,
        variation: 'repeat' as const,
        holdCycles: 1 as const,
      },
    };
    const steps = createContourSequence(lane, {
      version: 1,
      slices: [
        {
          index: 0,
          level: 0,
          pathCount: 1,
          length: 1,
          area: 0,
          centroidX: 0,
          centroidY: 0,
          closedness: 0,
          roughness: 0,
        },
        {
          index: 1,
          level: 1,
          pathCount: 1,
          length: 1,
          area: 10,
          centroidX: 0,
          centroidY: 0,
          closedness: 1,
          roughness: 1,
        },
      ],
    });

    expect(steps.map((step) => resolveStepTrigger(7, lane, step, 0))).toEqual([false, true]);
    expect(steps.map((step) => resolveStepTrigger(7, lane, step, 0))).toEqual([false, true]);
  });

  it('resolves expression independently from trigger probability', () => {
    const lane = {
      ...createMelodicLane(),
      probability: { mode: 'off' as const },
      variation: {
        target: 'accent' as const,
        probability: {
          mode: 'fixed' as const,
          chance: 100,
          variation: 'repeat' as const,
          holdCycles: 1 as const,
        },
        amount: 0.25,
      },
    };
    const step = createContourSequence(lane).find(({ candidateHit }) => candidateHit)!;

    expect(resolveStepTrigger(11, lane, step, 0)).toBe(true);
    expect(resolveStepVariation(11, lane, step, 0)).toEqual({ target: 'accent', amount: 0.25 });
  });
});
