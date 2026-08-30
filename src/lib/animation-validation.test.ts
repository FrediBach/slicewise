import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import { createAnimationProject, type AnimationParameterDescriptor } from './animation-project';
import { isAnimationProject, validateAnimationProject } from './animation-validation';

const parameters = [
  { controlId: 'zoom', settingKey: 'zoom', kind: 'continuous', min: 0.2, max: 3 },
  { controlId: 'lines', settingKey: 'lines', kind: 'integer', min: 1, max: 100 },
  { controlId: 'color', settingKey: 'color', kind: 'color' },
] as const satisfies readonly AnimationParameterDescriptor[];

describe('animation project validation', () => {
  it('accepts a complete current project', () => {
    const project = createAnimationProject(contourSettings, parameters);

    expect(validateAnimationProject(project, parameters)).toEqual({ valid: true, errors: [] });
    expect(isAnimationProject(project, parameters)).toBe(true);
  });

  it('reports duplicate times, incomplete values, and invalid envelopes', () => {
    const project = createAnimationProject(contourSettings, parameters);
    const invalid = structuredClone(project) as unknown as Record<string, unknown>;
    invalid.fps = 0;
    invalid.keyframes = [
      project.keyframes[0],
      {
        ...structuredClone(project.keyframes[0]),
        id: 'other',
        values: { zoom: 8 },
      },
    ];

    const result = validateAnimationProject(invalid, parameters);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'FPS is outside the supported range.',
        'Keyframe 1 has a duplicate time.',
        'Keyframe 1 has an invalid zoom value.',
        'Keyframe 1 has an invalid lines value.',
        'Keyframe 1 has an invalid color value.',
      ]),
    );
  });

  it('requires a sorted, protected time-zero keyframe', () => {
    const project = createAnimationProject(contourSettings, parameters);
    project.keyframes[0].timeMs = 100;

    const result = validateAnimationProject(project, parameters);
    expect(result.errors).toContain('A protected time-zero keyframe is required.');
  });
});
