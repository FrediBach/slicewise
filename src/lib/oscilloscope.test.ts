import { describe, expect, it } from 'vitest';
import { createOscilloscopeEffect } from './oscilloscope';

describe('createOscilloscopeEffect', () => {
  const source = [[10, 50, 30, 30, 50, 70, 70, 50]];

  it('creates deterministic finite scanlines, echoes, and a closed frame', () => {
    const first = createOscilloscopeEffect(source, 80, 100, 5, {
      oscilloscopeSpacing: 4,
      oscilloscopeIntensity: 65,
    });
    const second = createOscilloscopeEffect(source, 80, 100, 5, {
      oscilloscopeSpacing: 4,
      oscilloscopeIntensity: 65,
    });

    expect(first).toEqual(second);
    expect(first.scanlines.length).toBeGreaterThan(10);
    expect(first.echoes).toHaveLength(4);
    expect(first.frame.slice(0, 2)).toEqual(first.frame.slice(-2));
    expect([...first.scanlines, ...first.echoes, first.frame].flat().every(Number.isFinite)).toBe(
      true,
    );
  });

  it('uses intensity for interference without relying on non-line styling', () => {
    const flat = createOscilloscopeEffect(source, 80, 100, 5, {
      oscilloscopeSpacing: 5,
      oscilloscopeIntensity: 0,
    });
    const active = createOscilloscopeEffect(source, 80, 100, 5, {
      oscilloscopeSpacing: 5,
      oscilloscopeIntensity: 100,
    });

    expect(flat.echoes).toHaveLength(0);
    expect(
      flat.scanlines.every((run) =>
        run.every((value, index) => index % 2 === 0 || value === run[1]),
      ),
    ).toBe(true);
    expect(
      active.scanlines.some((run) =>
        run.some((value, index) => index % 2 === 1 && value !== run[1]),
      ),
    ).toBe(true);
  });
});
