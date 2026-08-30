import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import {
  addAnimationKeyframe,
  createAnimationProject,
  duplicateAnimationKeyframe,
  evaluateAnimationSettings,
  moveAnimationKeyframe,
  removeAnimationKeyframe,
  setAnimationKeyframeEasing,
  updateAnimationKeyframeValue,
  updateAnimationExportSettings,
  updateAnimationTiming,
  type AnimationParameterDescriptor,
} from './animation-project';

const parameters = [
  { controlId: 'zoom', settingKey: 'zoom', kind: 'continuous', min: 0.2, max: 3 },
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

  it('holds a segment until returning the exact next keyframe', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 5000, 'end', parameters);
    project = updateAnimationKeyframeValue(project, 'end', 'zoom', 3, parameters);
    project = setAnimationKeyframeEasing(project, 'keyframe-0', 'hold');

    expect(evaluateAnimationSettings(project, 4999, parameters).zoom).toBe(1);
    expect(evaluateAnimationSettings(project, 5000, parameters).zoom).toBe(3);
  });

  it('rounds integer interpolation after easing', () => {
    const integerParameters = [
      { controlId: 'lines', settingKey: 'lines', kind: 'integer', min: 1, max: 100 },
    ] as const satisfies readonly AnimationParameterDescriptor[];
    let project = createAnimationProject(contourSettings, integerParameters);
    project = addAnimationKeyframe(project, 5000, 'end', integerParameters);
    project = updateAnimationKeyframeValue(project, 'end', 'lines', 11, integerParameters);

    expect(evaluateAnimationSettings(project, 2000, integerParameters).lines).toBe(9);
    expect(evaluateAnimationSettings(project, 0, integerParameters).lines).toBe(8);
    expect(evaluateAnimationSettings(project, 5000, integerParameters).lines).toBe(11);
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

  it('duplicates a detached keyframe and rejects occupied ids and times', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 3000, 'source', parameters);
    project = updateAnimationKeyframeValue(project, 'source', 'zoom', 2.5, parameters);
    const duplicate = duplicateAnimationKeyframe(project, 'source', 4000, 'copy');

    expect(duplicate.keyframes.at(-1)).toMatchObject({
      id: 'copy',
      timeMs: 4000,
      values: { zoom: 2.5 },
    });
    duplicate.keyframes.at(-1)!.values.zoom = 1.5;
    expect(project.keyframes.at(-1)!.values.zoom).toBe(2.5);
    expect(duplicateAnimationKeyframe(project, 'source', 3000, 'copy')).toBe(project);
    expect(duplicateAnimationKeyframe(project, 'source', 4000, 'source')).toBe(project);
  });

  it('normalizes timing without truncating existing keyframes', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 4000, 'later', parameters);

    expect(updateAnimationTiming(project, { durationMs: 1000, fps: 500 })).toMatchObject({
      durationMs: 4000,
      fps: 120,
    });
  });

  it('normalizes export dimensions and keeps edits isolated', () => {
    const project = createAnimationProject(contourSettings, parameters);
    const updated = updateAnimationExportSettings(project, {
      width: 721,
      height: 405,
      bitrate: 2_500_000.4,
    });

    expect(updated.export).toEqual({ width: 722, height: 406, bitrate: 2_500_000 });
    expect(project.export).not.toEqual(updated.export);
  });

  it('evaluates deterministically without mutating project snapshots', () => {
    let project = createAnimationProject(contourSettings, parameters);
    project = addAnimationKeyframe(project, 5000, 'end', parameters);
    project = updateAnimationKeyframeValue(project, 'end', 'zoom', 3, parameters);
    const before = structuredClone(project);

    const first = evaluateAnimationSettings(project, 1234, parameters);
    const second = evaluateAnimationSettings(project, 1234, parameters);

    expect(first).toEqual(second);
    expect(project).toEqual(before);
    first.zoom = 99;
    expect(project.baseSettings.zoom).toBe(contourSettings.zoom);
  });
});
