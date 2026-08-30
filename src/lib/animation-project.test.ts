import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import {
  addAnimationKeyframe,
  createAnimationProject,
  evaluateAnimationSettings,
  moveAnimationKeyframe,
  removeAnimationKeyframe,
  setAnimationKeyframeEasing,
  updateAnimationKeyframeValue,
  updateAnimationTiming,
  type AnimationParameterDescriptor,
} from './animation-project';

const parameters = [
  { controlId: 'zoom', settingKey: 'zoom', kind: 'number', min: 0.2, max: 3 },
  { controlId: 'blockGlitchSeed', settingKey: 'blockGlitchSeed', kind: 'seed', min: 0, max: 9999 },
  { controlId: 'color', settingKey: 'color', kind: 'color' },
] as const satisfies readonly AnimationParameterDescriptor[];

describe('animation projects', () => {
  it('captures a detached base and protected first keyframe', () => {
    const project = createAnimationProject(contourSettings, parameters);

    expect(project.durationMs).toBe(5000);
    expect(project.fps).toBe(30);
    expect(project.export.width % 2).toBe(0);
    expect(project.export.height % 2).toBe(0);
    expect(project.keyframes).toEqual([
      {
        id: 'keyframe-0',
        timeMs: 0,
        values: {
          zoom: contourSettings.zoom,
          blockGlitchSeed: contourSettings.blockGlitchSeed,
          color: contourSettings.color,
        },
        easingToNext: 'linear',
      },
    ]);

    project.baseSettings.zoom = 2;
    expect(contourSettings.zoom).not.toBe(2);
  });

  it('adds a complete interpolated keyframe without accepting duplicate times or ids', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 5000, 'end', parameters);
    project = updateAnimationKeyframeValue(project, 'end', 'zoom', 3, parameters);
    const middle = addAnimationKeyframe(project, 2500, 'middle', parameters);

    expect(middle.keyframes.map(({ id }) => id)).toEqual(['keyframe-0', 'middle', 'end']);
    expect(middle.keyframes[1].values.zoom).toBe(2);
    expect(addAnimationKeyframe(middle, 2500, 'duplicate-time', parameters)).toBe(middle);
    expect(addAnimationKeyframe(middle, 3000, 'middle', parameters)).toBe(middle);
  });

  it('evaluates numeric and RGB values while holding seeds', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 5000, 'end', parameters);
    project = updateAnimationKeyframeValue(project, 'end', 'zoom', 3, parameters);
    project = updateAnimationKeyframeValue(project, 'end', 'color', '#ffffff', parameters);
    project = updateAnimationKeyframeValue(project, 'end', 'blockGlitchSeed', 9, parameters);

    const middle = evaluateAnimationSettings(project, 2500, parameters);
    expect(middle.zoom).toBe(2);
    expect(middle.color).toBe('#8a8c8d');
    expect(middle.blockGlitchSeed).toBe(contourSettings.blockGlitchSeed);
    expect(middle.morphEnabled).toBe(false);
    expect(middle.morphSecondEnabled).toBe(false);
    expect(middle.morphTargets).toEqual({});
    expect(middle.morphTargets2).toEqual({});

    expect(evaluateAnimationSettings(project, 5000, parameters)).toMatchObject({
      zoom: 3,
      color: '#ffffff',
      blockGlitchSeed: 9,
    });
  });

  it('applies easing to outgoing segments and preserves exact endpoints', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 5000, 'end', parameters);
    project = updateAnimationKeyframeValue(project, 'end', 'zoom', 3, parameters);
    project = setAnimationKeyframeEasing(project, 'keyframe-0', 'ease-in');

    expect(evaluateAnimationSettings(project, 2500, parameters).zoom).toBe(1.5);
    expect(evaluateAnimationSettings(project, 0, parameters).zoom).toBe(1);
    expect(evaluateAnimationSettings(project, 5000, parameters).zoom).toBe(3);
  });

  it('clamps values and keeps invalid edits immutable', () => {
    const project = createAnimationProject(contourSettings, parameters);
    const clamped = updateAnimationKeyframeValue(project, 'keyframe-0', 'zoom', 99, parameters);

    expect(clamped.keyframes[0].values.zoom).toBe(3);
    expect(project.keyframes[0].values.zoom).toBe(contourSettings.zoom);
    expect(updateAnimationKeyframeValue(project, 'keyframe-0', 'unknown', 2, parameters)).toBe(
      project,
    );
    expect(updateAnimationKeyframeValue(project, 'keyframe-0', 'color', 'red', parameters)).toBe(
      project,
    );
  });

  it('moves and removes non-initial keyframes only', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 3000, 'later', parameters);

    expect(moveAnimationKeyframe(project, 'keyframe-0', 1000)).toBe(project);
    project = moveAnimationKeyframe(project, 'later', 2000);
    expect(project.keyframes[1].timeMs).toBe(2000);
    expect(removeAnimationKeyframe(project, 'keyframe-0')).toBe(project);
    project = removeAnimationKeyframe(project, 'later');
    expect(project.keyframes).toHaveLength(1);
  });

  it('normalizes timing without truncating existing keyframes', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 4000, 'later', parameters);

    expect(updateAnimationTiming(project, { durationMs: 1000, fps: 500 })).toMatchObject({
      durationMs: 4000,
      fps: 120,
    });
  });
});
