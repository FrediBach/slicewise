import { expect, it } from 'vitest';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { computeContours, type ContourSettings } from './contour-engine';
import { deformMesh } from './mesh-deformation';
import { OBJECT_CONTROLS, OBJECT_DEFAULTS } from './object-settings';
import { generateGCode } from './gcode';
import {
  addAnimationKeyframe,
  createAnimationProject,
  evaluateAnimationSettings,
  updateAnimationKeyframeValue,
} from './animation-project';

const mesh = makeContourMesh();
const object = {
  ...OBJECT_DEFAULTS,
  objectEnabled: true,
  objectScaleX: 125,
  objectTaperAmount: 20,
  objectBulgeAmount: 30,
  objectBulgeCenter: 40,
  objectBulgeWidth: 90,
  objectShearAmount: 20,
  objectShearDirection: 35,
  objectTwistAngle: 45,
  objectBendAngle: 25,
  objectRotationY: 15,
  objectRippleAmount: 5,
  objectNoiseAmount: 3,
};

it.each([
  'up',
  'x',
  'y',
  'cam',
  'custom',
  'spherical',
  'cylindrical',
  'geodesic',
  'curvature',
  'svg',
])(
  'uses the same reshaped surface for %s cuts, visibility, silhouettes, rays and exports',
  (axis) => {
    const settings: ContourSettings = {
      ...contourSettings,
      ...object,
      axis,
      lines: 5,
      sliceRays: true,
      sliceRayAmount: 6,
      waveCenterX: 30,
      svgSlicePaths: [[-0.6, -0.6, 0.6, -0.6, 0.6, 0.6, -0.6, 0.6, -0.6, -0.6]],
      svgSliceScale: 70,
      svgSliceX: 0,
      svgSliceY: 0,
      svgSliceRotation: 0,
    };
    const result = computeContours(mesh, settings, false);
    const expected = computeContours(
      deformMesh(mesh, settings),
      { ...settings, objectEnabled: false },
      false,
    );
    expect(result.toolpaths).toEqual(expected.toolpaths);
    expect(result.svg).toBe(expected.svg);
    expect(result.paths).toBeGreaterThan(0);
    expect(result.svg).not.toMatch(/NaN|Infinity|undefined/);
    for (const origin of ['rear-left', 'bottom-left'] as const) {
      const gcode = generateGCode(
        result.toolpaths,
        { width: settings.pw, height: settings.ph },
        { origin },
      );
      expect(gcode).toContain('G1');
      expect(gcode).not.toMatch(/NaN|Infinity|undefined/);
    }
  },
);

it.each([
  { contourWeave: true },
  { sliceLfo: true, sliceLfoAmplitude: 30 },
  { spiral: true, sliceRays: false },
  { projectionWarpMode: 'mobius' as const, mobiusDisplacement: 25, mobiusStrength: 70 },
  { projectionWarpMode: 'stereographic' as const, sphericalStrength: 35 },
])('composes object deformation with existing construction/projection %j', (mode) => {
  const settings = { ...contourSettings, ...object, ...mode, lines: 5 };
  for (const quick of [true, false]) {
    const result = computeContours(mesh, settings, quick);
    expect(result.svg).not.toMatch(/NaN|Infinity|undefined/);
    expect(result.paths).toBeGreaterThan(0);
    const expected = computeContours(
      deformMesh(mesh, settings),
      { ...settings, objectEnabled: false },
      quick,
    );
    expect(result.svg).toBe(expected.svg);
    expect(result.toolpaths).toEqual(expected.toolpaths);
  }
});

it('deforms independently for each X/Y morph instance', () => {
  const settings = {
    ...contourSettings,
    ...object,
    lines: 4,
    hide: false,
    sil: false,
    morphEnabled: true,
    morphSteps: 2,
    morphTargets: { objectRippleAmount: -5 },
    morphSecondEnabled: true,
    morphStepsY: 2,
    morphTargets2: { objectNoiseAmount: 6 },
  };
  const combined = computeContours(mesh, settings, false);
  const expected = [3, 6].flatMap((objectNoiseAmount) =>
    [5, -5].flatMap((objectRippleAmount) =>
      computeContours(
        mesh,
        { ...settings, morphEnabled: false, objectNoiseAmount, objectRippleAmount },
        false,
      ).toolpaths.flatMap((group) => group.runs),
    ),
  );
  expect(combined.toolpaths.flatMap((group) => group.runs)).toEqual(expected);
  expect(combined.svg.match(/data-morph-x-step=/g)).toHaveLength(4);
});

it('interpolates object parameters in animation and changes actual contour geometry', () => {
  const descriptors = OBJECT_CONTROLS.map(({ id, min, max }) => ({
    controlId: id,
    settingKey: id,
    kind: id === 'objectNoiseSeed' ? ('seed' as const) : ('continuous' as const),
    min,
    max,
  }));
  const settings = { ...contourSettings, ...OBJECT_DEFAULTS, objectEnabled: true };
  let project = createAnimationProject(settings, descriptors);
  project = addAnimationKeyframe(project, 5000, 'end', descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectBendAngle', 60, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectScaleZ', 160, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectBulgeAmount', -60, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectBulgeCenter', 80, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectBulgeWidth', 60, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectShearAmount', 80, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectShearDirection', 90, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectRippleAmount', 10, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectRipplePhase', 180, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectNoiseAmount', 8, descriptors);
  project = updateAnimationKeyframeValue(project, 'end', 'objectNoiseSeed', 42, descriptors);
  const middle = evaluateAnimationSettings(project, 2500, descriptors);
  expect(middle.objectRippleAmount).toBe(5);
  expect(middle.objectRipplePhase).toBe(90);
  expect(middle.objectNoiseAmount).toBe(4);
  expect(middle.objectNoiseSeed).toBe(1);
  expect(evaluateAnimationSettings(project, 5000, descriptors).objectNoiseSeed).toBe(42);
  expect(middle.objectBendAngle).toBe(30);
  expect(middle.objectScaleZ).toBe(130);
  expect(middle.objectBulgeAmount).toBe(-30);
  expect(middle.objectBulgeCenter).toBe(65);
  expect(middle.objectBulgeWidth).toBe(80);
  expect(middle.objectShearAmount).toBe(40);
  expect(middle.objectShearDirection).toBe(45);
  const initial = computeContours(mesh, settings, false);
  const animated = computeContours(mesh, middle, false);
  expect(animated.toolpaths).not.toEqual(initial.toolpaths);
  expect(animated.svg).not.toMatch(/NaN|Infinity/);
  expect(settings.objectBendAngle).toBe(0);
});
