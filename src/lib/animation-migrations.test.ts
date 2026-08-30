import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import { type AnimationParameterDescriptor } from './animation-project';
import { migrateAnimationProject } from './animation-migrations';
import { validateAnimationProject } from './animation-validation';

const parameters = [
  { controlId: 'zoom', settingKey: 'zoom', kind: 'continuous', min: 0.2, max: 3 },
  { controlId: 'lines', settingKey: 'lines', kind: 'integer', min: 1, max: 100 },
  { controlId: 'color', settingKey: 'color', kind: 'color' },
] as const satisfies readonly AnimationParameterDescriptor[];

describe('animation project migrations', () => {
  it('normalizes incomplete version-one data and adds the protected keyframe', () => {
    const migrated = migrateAnimationProject(
      {
        version: 1,
        durationMs: 1000.4,
        fps: 29.7,
        loopPreview: true,
        export: { width: 721, height: 405, bitrate: 1_000_000.2 },
        keyframes: [
          {
            id: 'later',
            timeMs: 750.4,
            values: { zoom: 99, lines: 10.6, color: '#ABCDEF' },
            easingToNext: 'unknown',
          },
        ],
      },
      contourSettings,
      parameters,
    );

    expect(migrated).toMatchObject({
      version: 1,
      durationMs: 1000,
      fps: 30,
      loopPreview: true,
      export: { width: 722, height: 406, bitrate: 1_000_000 },
    });
    expect(migrated.keyframes).toEqual([
      expect.objectContaining({ id: 'keyframe-0', timeMs: 0 }),
      expect.objectContaining({
        id: 'later',
        timeMs: 750,
        values: { zoom: 3, lines: 11, color: '#abcdef' },
        easingToNext: 'linear',
      }),
    ]);
    expect(validateAnimationProject(migrated, parameters).valid).toBe(true);
  });

  it('resolves duplicate ids and times deterministically', () => {
    const migrated = migrateAnimationProject(
      {
        keyframes: [
          { id: 'same', timeMs: 0, values: {} },
          { id: 'same', timeMs: 1000, values: {} },
          { id: 'discarded-time', timeMs: 1000, values: {} },
        ],
      },
      contourSettings,
      parameters,
    );

    expect(migrated.keyframes.map(({ id, timeMs }) => [id, timeMs])).toEqual([
      ['same', 0],
      ['same-2', 1000],
    ]);
    expect(validateAnimationProject(migrated, parameters).valid).toBe(true);
  });

  it('falls back to a fresh detached project for unsupported versions', () => {
    const migrated = migrateAnimationProject({ version: 2 }, contourSettings, parameters);
    migrated.baseSettings.zoom = 2;

    expect(migrated.version).toBe(1);
    expect(migrated.keyframes).toHaveLength(1);
    expect(contourSettings.zoom).toBe(1);
  });
});
