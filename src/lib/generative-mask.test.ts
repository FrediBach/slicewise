import { describe, expect, it } from 'vitest';
import {
  clipRunToGenerativeMask,
  generativeMaskPath,
  pointInGenerativeMask,
  type GenerativeMaskSettings,
} from './generative-mask';

const settings: GenerativeMaskSettings = {
  maskEnabled: true,
  maskOutline: false,
  maskRoundness: 100,
  maskScaleX: 100,
  maskScaleY: 100,
  maskOffsetX: 0,
  maskOffsetY: 0,
  maskLfo1Amplitude: 0,
  maskLfo1Cycles: 3,
  maskLfo1Phase: 0,
  maskLfo1Waveform: 0,
  maskLfo2Amplitude: 0,
  maskLfo2Cycles: 5,
  maskLfo2Phase: 90,
  maskLfo2Waveform: 0,
};

describe('generative output mask', () => {
  it('morphs between a circular and rectangular boundary', () => {
    expect(pointInGenerativeMask(settings, 100, 100, 10, 18, 18)).toBe(false);
    expect(pointInGenerativeMask({ ...settings, maskRoundness: 0 }, 100, 100, 10, 18, 18)).toBe(
      true,
    );
  });

  it('clips paths at the mask boundary', () => {
    const [run] = clipRunToGenerativeMask([-20, 50, 120, 50], settings, 100, 100, 10);

    expect(run[0]).toBeCloseTo(10, 3);
    expect(run.at(-2)).toBeCloseTo(90, 3);
    expect(run[1]).toBeCloseTo(50, 6);
    expect(run.at(-1)).toBeCloseTo(50, 6);
  });

  it('positions the mask independently on both axes', () => {
    const shifted = {
      ...settings,
      maskScaleX: 50,
      maskScaleY: 50,
      maskOffsetX: 50,
      maskOffsetY: -50,
    };

    expect(pointInGenerativeMask(shifted, 100, 100, 10, 70, 30)).toBe(true);
    expect(pointInGenerativeMask(shifted, 100, 100, 10, 30, 70)).toBe(false);
  });

  it('keeps fractional cycle morphs closed and deterministic', () => {
    const morphed = {
      ...settings,
      maskLfo1Amplitude: 30,
      maskLfo1Cycles: 3.5,
      maskLfo1Waveform: 72,
      maskLfo2Amplitude: 18,
      maskLfo2Cycles: 6.25,
      maskLfo2Phase: 123,
    };
    const first = generativeMaskPath(morphed, 120, 100, 8);
    const second = generativeMaskPath(morphed, 120, 100, 8);

    expect(first).toBe(second);
    expect(first).toMatch(/^M/);
    expect(first).toMatch(/Z$/);
    expect(first).not.toMatch(/NaN|Infinity/);
  });
});
