import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  createColorGradient,
  createColorPair,
  maxChroma,
  mulberry32,
  oklchToHex,
  parseColor,
} from './colorPair';

describe('colour pairing', () => {
  it('is reproducible for a seed', () => {
    expect(createColorPair({ seed: 42 })).toEqual(createColorPair({ seed: 42 }));
    expect(createColorPair({ seed: 42 })).not.toEqual(createColorPair({ seed: 43 }));
  });

  it('preserves a supplied base colour and generates a contrasting partner', () => {
    const pair = createColorPair({ color: '#336699', seed: 7, minContrast: 4.5 });

    expect(pair.a.hex).toBe('#336699');
    expect(pair.contrast).toBeGreaterThanOrEqual(4.5);
    expect(pair.lightnessDiff).toBeGreaterThan(0);
  });

  it('accepts shorthand hex and rejects malformed colours', () => {
    const parsed = parseColor('#abc');

    expect(oklchToHex(parsed)).toBe('#aabbcc');
    expect(() => parseColor('not-a-colour')).toThrow(/Bad color/);
  });

  it('computes WCAG contrast symmetrically', () => {
    const black = parseColor('#000000');
    const white = parseColor('#ffffff');

    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
  });

  it('accepts RGB and gamut-maps OKLCH object inputs', () => {
    expect(oklchToHex(parseColor({ r: 255, g: 0, b: 0 }))).toBe('#ff0000');

    const mapped = parseColor({ L: 0.6, C: 1, H: 40 });
    expect(mapped.L).toBeCloseTo(0.6, 6);
    expect(mapped.C).toBeLessThanOrEqual(maxChroma(0.6, 40));
    expect(oklchToHex(mapped)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('enforces the configured perceptual lightness gap across seeds', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      expect(createColorPair({ seed, minLightnessDiff: 0.2 }).lightnessDiff).toBeGreaterThanOrEqual(
        0.1999,
      );
    }
  });

  it('supports reproducible RNG streams and custom random sources', () => {
    const first = mulberry32(123);
    const second = mulberry32(123);
    const sequence = Array.from({ length: 5 }, () => first());

    expect(sequence).toEqual(Array.from({ length: 5 }, () => second()));
    expect(sequence.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(createColorPair({ rng: () => 0.5 })).toEqual(createColorPair({ rng: () => 0.5 }));
  });

  it('creates a reproducible custom gradient anchored to the supplied ink colour', () => {
    const first = createColorGradient('#336699', { count: 5, rng: mulberry32(42) });
    const second = createColorGradient('#336699', { count: 5, rng: mulberry32(42) });

    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(first[0]).toEqual({ position: 0, color: '#336699' });
    expect(first.at(-1)?.position).toBe(1);
    expect(new Set(first.map(({ color }) => color)).size).toBeGreaterThan(2);
  });
});
