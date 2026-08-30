import { describe, expect, it } from 'vitest';
import {
  applyAnimationEasing,
  interpolateAnimationValue,
  interpolateRgbColor,
  normalizeAnimationValue,
} from './animation-interpolation';

describe('animation interpolation', () => {
  it('evaluates the supported easing curves deterministically', () => {
    expect(applyAnimationEasing(0.5, 'linear')).toBe(0.5);
    expect(applyAnimationEasing(0.5, 'ease-in')).toBe(0.25);
    expect(applyAnimationEasing(0.5, 'ease-out')).toBe(0.75);
    expect(applyAnimationEasing(0.25, 'ease-in-out')).toBe(0.125);
    expect(applyAnimationEasing(0.75, 'ease-in-out')).toBe(0.875);
    expect(applyAnimationEasing(1, 'hold')).toBe(0);
  });

  it('normalizes typed values and interpolates RGB channels', () => {
    expect(normalizeAnimationValue(4.6, 'integer', 0, 5)).toBe(5);
    expect(normalizeAnimationValue(4.6, 'seed', 0, 5)).toBe(5);
    expect(normalizeAnimationValue('#ABCDEF', 'color')).toBe('#abcdef');
    expect(normalizeAnimationValue('red', 'color')).toBeUndefined();
    expect(interpolateRgbColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('rounds integer results and keeps seeds discrete', () => {
    expect(interpolateAnimationValue(2, 5, 0.5, 'continuous')).toBe(3.5);
    expect(interpolateAnimationValue(2, 5, 0.5, 'integer')).toBe(4);
    expect(interpolateAnimationValue(2, 5, 0.999, 'seed')).toBe(2);
    expect(interpolateAnimationValue(2, 5, 1, 'seed')).toBe(5);
  });
});
