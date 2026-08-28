import { describe, expect, it } from 'vitest';
import {
  applySampleAndHold,
  sampleAndHoldPolyline,
  type SampleAndHoldSettings,
} from './sample-and-hold';

const settings: SampleAndHoldSettings = {
  sampleAndHold: true,
  sampleAndHoldAxis: 'y',
  sampleAndHoldSpacing: 4,
  sampleAndHoldLength: 2,
  sampleAndHoldMix: 100,
};

describe('sample-and-hold geometry', () => {
  it('resamples by arc length and holds the selected coordinate', () => {
    expect(sampleAndHoldPolyline([0, 0, 10, 10], settings)).toEqual([
      0, 0, 2.5, 0, 5, 5, 7.5, 5, 10, 10,
    ]);
  });

  it('supports the X axis and a partial mix', () => {
    expect(
      sampleAndHoldPolyline([0, 0, 10, 10], {
        ...settings,
        sampleAndHoldAxis: 'x',
        sampleAndHoldMix: 50,
      }),
    ).toEqual([0, 0, 1.25, 2.5, 5, 5, 6.25, 7.5, 10, 10]);
  });

  it('keeps closed runs closed with complete hold groups', () => {
    const result = sampleAndHoldPolyline([0, 0, 10, 0, 10, 10, 0, 10, 0, 0], {
      ...settings,
      sampleAndHoldSpacing: 6,
      sampleAndHoldLength: 3,
    });

    expect(result.slice(-2)).toEqual(result.slice(0, 2));
    for (let index = 2; index + 1 < result.length - 2; index += 2)
      expect(
        Math.hypot(result[index] - result[index - 2], result[index + 1] - result[index - 1]),
      ).toBeGreaterThan(0);
    expect(result.flat().every(Number.isFinite)).toBe(true);
  });

  it('caps emitted samples for very long runs', () => {
    const result = sampleAndHoldPolyline([0, 0, 10000, 10000], {
      ...settings,
      sampleAndHoldSpacing: 0.01,
    });

    expect(result.length / 2).toBe(8192);
    const closed = sampleAndHoldPolyline([0, 0, 10000, 0, 10000, 10000, 0, 0], {
      ...settings,
      sampleAndHoldSpacing: 0.01,
    });
    expect(closed.length / 2).toBeLessThanOrEqual(8192);
  });

  it('removes consecutive samples collapsed by the held coordinate', () => {
    const result = sampleAndHoldPolyline([0, 0, 0, 10], {
      ...settings,
      sampleAndHoldSpacing: 2,
    });

    expect(result).toEqual([0, 0, 0, 4, 0, 8]);
  });

  it('is a cloning no-op when disabled or mixed to zero', () => {
    const source = [[0, 0, 10, 10]];
    const disabled = applySampleAndHold(source, { ...settings, sampleAndHold: false });
    const unmixed = applySampleAndHold(source, { ...settings, sampleAndHoldMix: 0 });

    expect(disabled).toEqual(source);
    expect(unmixed).toEqual(source);
    expect(disabled[0]).not.toBe(source[0]);
    expect(unmixed[0]).not.toBe(source[0]);
  });
});
