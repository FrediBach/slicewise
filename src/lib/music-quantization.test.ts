import { describe, expect, it } from 'vitest';
import {
  normalizeFeatureValues,
  quantizeFeatureToMidi,
  SCALE_INTERVALS,
  scaleRegister,
} from './music-quantization';

describe('normalizeFeatureValues', () => {
  it('uses a robust percentile span and clamps outliers', () => {
    const normalized = normalizeFeatureValues([0, 1, 2, 3, 4, 100]);

    expect(normalized[0]).toBe(0);
    expect(normalized.at(-1)).toBe(1);
    expect(normalized[2]).toBeGreaterThan(0);
    expect(normalized[3]).toBeLessThan(1);
  });

  it('gives flat and invalid sources a neutral value', () => {
    expect(normalizeFeatureValues([7, 7, Number.NaN])).toEqual([0.5, 0.5, 0.5]);
    expect(normalizeFeatureValues([])).toEqual([]);
  });
});

describe('musical quantization', () => {
  const settings = {
    root: 2,
    scale: 'natural-minor' as const,
    lowestOctave: 3,
    octaveRange: 2 as const,
    voiceLeading: 0,
    maximumLeap: 127,
  };

  it('maps the complete feature range into the selected scale and register', () => {
    const register = scaleRegister(settings);
    const notes = quantizeFeatureToMidi([0, 0.25, 0.5, 0.75, 1], settings);

    expect(notes[0]).toBe(register[0]);
    expect(notes.at(-1)).toBe(register.at(-1));
    expect(notes.every((note) => register.includes(note))).toBe(true);
    expect(
      notes.every((note) =>
        SCALE_INTERVALS['natural-minor'].includes((((note - settings.root) % 12) + 12) % 12),
      ),
    ).toBe(true);
  });

  it('supports inversion and limits successive leaps without leaving the scale', () => {
    const forward = quantizeFeatureToMidi([0, 1, 0, 1], { ...settings, maximumLeap: 5 });
    const inverted = quantizeFeatureToMidi([0, 1], { ...settings, inverted: true });

    expect(inverted[0]).toBeGreaterThan(inverted[1]);
    expect(forward.slice(1).every((note, index) => Math.abs(note - forward[index]) <= 5)).toBe(
      true,
    );
    expect(forward.every((note) => scaleRegister(settings).includes(note))).toBe(true);
  });

  it('selects octave equivalents deterministically when voice leading is strong', () => {
    const notes = quantizeFeatureToMidi([0.1, 0.9, 0.1], {
      ...settings,
      octaveRange: 3,
      voiceLeading: 1,
      maximumLeap: 127,
    });

    expect(notes).toEqual([58, 60, 58]);
  });

  it('rank-maps a compressed feature range across the register', () => {
    const notes = quantizeFeatureToMidi([100, 100.001, 100.002, 100.003], settings);

    expect(new Set(notes).size).toBe(4);
    expect(notes[0]).toBe(scaleRegister(settings)[0]);
    expect(notes.at(-1)).toBe(scaleRegister(settings).at(-1));
  });
});
