import { describe, expect, it } from 'vitest';
import { kaleidoscopeRun } from './kaleidoscope';

describe('kaleidoscope geometry', () => {
  it('clips to one wedge and mirrors it through every radial segment', () => {
    const angle = Math.PI / 6;
    const source = [0, 0, Math.cos(angle) * 10, Math.sin(angle) * 10];
    const runs = kaleidoscopeRun(
      source,
      { kaleidoscope: true, kaleidoscopeSegments: 4, kaleidoscopeRotation: 0 },
      0,
      0,
    );

    expect(runs).toHaveLength(4);
    const endAngles = runs.map((run) => {
      const value = Math.atan2(run.at(-1)!, run.at(-2)!);
      return Math.round((((value * 180) / Math.PI + 360) % 360) * 1000) / 1000;
    });
    expect(endAngles).toEqual([30, 150, 210, 330]);
  });

  it('returns no geometry when a run never enters the source wedge', () => {
    const runs = kaleidoscopeRun(
      [-10, -10, -5, -10],
      { kaleidoscope: true, kaleidoscopeSegments: 6, kaleidoscopeRotation: 0 },
      20,
      20,
    );

    expect(runs).toEqual([]);
  });

  it('leaves disabled geometry untouched', () => {
    const source = [1, 2, 3, 4];
    expect(
      kaleidoscopeRun(
        source,
        { kaleidoscope: false, kaleidoscopeSegments: 6, kaleidoscopeRotation: 0 },
        100,
        100,
      ),
    ).toEqual([source]);
  });
});
