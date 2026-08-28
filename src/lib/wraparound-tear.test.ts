import { describe, expect, it } from 'vitest';
import {
  applyWraparoundTear,
  resolveWraparoundTear,
  type WraparoundTearSettings,
} from './wraparound-tear';

const settings: WraparoundTearSettings = {
  wraparoundTear: true,
  wraparoundTearOrientation: 'horizontal',
  wraparoundTearPosition: 50,
  wraparoundTearSize: 20,
  wraparoundTearShift: 30,
};

describe('wraparound tear', () => {
  it('resolves a horizontal band relative to the drawable artboard', () => {
    expect(resolveWraparoundTear(settings, 120, 100, 10)).toEqual({
      band: { left: 10, top: 42, right: 110, bottom: 58, dx: 30, dy: 0 },
      period: 100,
    });
  });

  it('resolves a vertical band and normalizes large signed shifts', () => {
    expect(
      resolveWraparoundTear(
        {
          ...settings,
          wraparoundTearOrientation: 'vertical',
          wraparoundTearPosition: 25,
          wraparoundTearSize: 40,
          wraparoundTearShift: -90,
        },
        120,
        100,
        10,
      ),
    ).toEqual({
      band: { left: 25, top: 10, right: 65, bottom: 90, dx: 0, dy: -10 },
      period: 80,
    });
  });

  it('wraps horizontal overflow without losing its source length', () => {
    const tear = resolveWraparoundTear(settings, 120, 100, 10);
    const result = applyWraparoundTear([[20, 50, 100, 50]], tear);

    expect(result).toEqual([
      [50, 50, 110, 50],
      [10, 50, 30, 50],
    ]);
    const length = result.reduce((sum, run) => sum + Math.abs(run.at(-2)! - run[0]), 0);
    expect(length).toBe(80);
  });

  it('preserves geometry outside the band and supports negative vertical wrapping', () => {
    const tear = resolveWraparoundTear(
      {
        ...settings,
        wraparoundTearOrientation: 'vertical',
        wraparoundTearPosition: 50,
        wraparoundTearSize: 20,
        wraparoundTearShift: -25,
      },
      100,
      120,
      10,
    );
    expect(
      applyWraparoundTear(
        [
          [50, 20, 50, 100],
          [10, 40, 20, 40],
        ],
        tear,
      ),
    ).toEqual([
      [10, 40, 20, 40],
      [50, 10, 50, 75],
      [50, 95, 50, 110],
    ]);
  });

  it('is a cloning no-op when disabled', () => {
    const source = [[0, 0, 10, 10]];
    const result = applyWraparoundTear(source, null);
    expect(resolveWraparoundTear({ ...settings, wraparoundTear: false }, 100, 100)).toBeNull();
    expect(result).toEqual(source);
    expect(result[0]).not.toBe(source[0]);
  });

  it('does not split paths when the periodic shift resolves to zero', () => {
    const source = [[0, 50, 120, 50]];
    const tear = resolveWraparoundTear({ ...settings, wraparoundTearShift: 100 }, 120, 100, 10);

    expect(applyWraparoundTear(source, tear)).toEqual(source);
  });
});
