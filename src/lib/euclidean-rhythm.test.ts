import { describe, expect, it } from 'vitest';
import { autoRotateEuclidean, euclideanRhythm, rotateRhythm } from './euclidean-rhythm';

describe('euclideanRhythm', () => {
  it('distributes exactly five hits over sixteen steps', () => {
    const pattern = euclideanRhythm(16, 5);
    const hitIndexes = pattern.flatMap((hit, index) => (hit ? [index] : []));
    const gaps = hitIndexes.map((hit, index) => {
      const next = hitIndexes[(index + 1) % hitIndexes.length];
      return (next - hit + pattern.length) % pattern.length;
    });

    expect(pattern).toHaveLength(16);
    expect(hitIndexes).toHaveLength(5);
    expect(new Set(gaps)).toEqual(new Set([3, 4]));
  });

  it('handles silent, full, clamped, and rotated patterns', () => {
    expect(euclideanRhythm(4, 0)).toEqual([false, false, false, false]);
    expect(euclideanRhythm(4, 9)).toEqual([true, true, true, true]);
    expect(rotateRhythm([true, false, false], -1)).toEqual([false, false, true]);
  });
});

describe('autoRotateEuclidean', () => {
  it('aligns hits to the strongest contour steps with stable tie breaking', () => {
    const aligned = autoRotateEuclidean(8, 2, [0, 0, 10, 0, 0, 0, 8, 0]);

    expect(aligned.pattern.flatMap((hit, index) => (hit ? [index] : []))).toEqual([2, 6]);
    expect(autoRotateEuclidean(4, 1, [1, 1, 1, 1]).rotation).toBe(0);
  });

  it('area-averages source energy when its resolution differs from the grid', () => {
    const aligned = autoRotateEuclidean(4, 1, [0, 0, 0, 0, 10, 10, 0, 0]);
    expect(aligned.pattern).toEqual([false, false, true, false]);
  });
});
