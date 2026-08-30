import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import { createAnimationProject, type AnimationParameterDescriptor } from './animation-project';
import { localAnimationProjectId, restoreStoredAnimationProject } from './animation-storage';
import { validateAnimationProject } from './animation-validation';

const parameters = [
  { controlId: 'zoom', settingKey: 'zoom', kind: 'continuous', min: 0.2, max: 3 },
  { controlId: 'lines', settingKey: 'lines', kind: 'integer', min: 1, max: 100 },
] as const satisfies readonly AnimationParameterDescriptor[];

describe('animation storage', () => {
  it('creates and reuses a stable browser-local project id', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    const first = localAnimationProjectId(storage);
    const second = localAnimationProjectId(storage);

    expect(first).toMatch(/^animation-/);
    expect(second).toBe(first);
  });

  it('restores a detached current storage envelope', () => {
    const project = createAnimationProject(contourSettings, parameters);
    const restored = restoreStoredAnimationProject(
      {
        storageVersion: 1,
        id: 'local-project',
        updatedAt: '2026-08-30T00:00:00.000Z',
        project,
      },
      contourSettings,
      parameters,
    );
    restored.baseSettings.zoom = 2;

    expect(validateAnimationProject(restored, parameters).valid).toBe(true);
    expect(project.baseSettings.zoom).toBe(1);
  });

  it('migrates legacy raw project records and rejects future versions safely', () => {
    const legacy = restoreStoredAnimationProject(
      {
        version: 1,
        durationMs: 2000,
        fps: 24,
        keyframes: [{ id: 'start', timeMs: 0, values: { zoom: 1.5, lines: 20 } }],
      },
      contourSettings,
      parameters,
    );
    const future = restoreStoredAnimationProject(
      { storageVersion: 2, project: { version: 1, durationMs: 9999 } },
      contourSettings,
      parameters,
    );

    expect(legacy).toMatchObject({ durationMs: 2000, fps: 24 });
    expect(legacy.keyframes[0].values).toEqual({ zoom: 1.5, lines: 20 });
    expect(future).toMatchObject({ version: 1, durationMs: 5000, fps: 30 });
    expect(validateAnimationProject(future, parameters).valid).toBe(true);
  });
});
