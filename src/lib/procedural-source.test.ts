import { expect, it } from 'vitest';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { computeContours } from './contour-engine';
import { GEN_DEFAULTS, generateMesh } from './generativeMesh';
import { TERRAIN_DEFAULTS, generateTerrain } from './generative-terrain';
import { vertexNormals, weld } from './mesh';
import {
  normalizeProceduralSettings,
  proceduralSourceKey,
  resolveProceduralMesh,
} from './procedural-source';
import {
  addAnimationKeyframe,
  createAnimationProject,
  evaluateAnimationSettings,
  updateAnimationKeyframeValue,
  type AnimationParameterDescriptor,
} from './animation-project';

it.each(['generative', 'terrain'] as const)(
  'renders %s frames identically to independently generated source geometry',
  (source) => {
    const base = makeContourMesh();
    const settings = {
      ...contourSettings,
      ...GEN_DEFAULTS,
      ...TERRAIN_DEFAULTS,
      genRes: 32,
      terrainRes: 32,
      genBlend: 65,
      terrainRelief: 80,
      proceduralSource: source,
      proceduralUpY: true,
      lines: 5,
      hidden: false,
    };
    const generated = source === 'terrain' ? generateTerrain(settings) : generateMesh(settings);
    const expectedMesh = weld({ verts: generated.positions, tris: generated.indices });
    for (let i = 0; i < expectedMesh.V.length; i += 3) {
      const y = expectedMesh.V[i + 1];
      expectedMesh.V[i + 1] = -expectedMesh.V[i + 2];
      expectedMesh.V[i + 2] = y;
    }
    const expected = computeContours(
      { ...expectedMesh, N: vertexNormals(expectedMesh.V, expectedMesh.T) },
      { ...settings, proceduralSource: undefined },
      false,
    );
    const result = computeContours(base, settings, false);
    expect(result.toolpaths.length).toBeGreaterThan(0);
    expect(result.svg).toBe(expected.svg);
    expect(result.toolpaths).toEqual(expected.toolpaths);
  },
);

it('reuses installed and cached meshes, bounds retention, and preserves uploaded sources', () => {
  const source = makeContourMesh();
  const settings = { proceduralSource: 'terrain' as const, terrainRes: 32, terrainRelief: 30 };
  expect(resolveProceduralMesh(source, {})).toBe(source);
  const installed = { ...source, proceduralKey: proceduralSourceKey(settings) };
  expect(resolveProceduralMesh(installed, settings)).toBe(installed);
  const first = resolveProceduralMesh(source, settings);
  expect(first.terrain).toBe(true);
  expect(resolveProceduralMesh(source, { ...settings })).toBe(first);
  for (const terrainRelief of [40, 50, 60])
    resolveProceduralMesh(source, { ...settings, terrainRelief });
  const again = resolveProceduralMesh(source, settings);
  expect(again).not.toBe(first);
  expect(again.V).toEqual(first.V);
  expect(source).toEqual(makeContourMesh());
});

it('regenerates both morph dimensions and exports their different contours', () => {
  const source = makeContourMesh();
  const settings = {
    ...contourSettings,
    ...TERRAIN_DEFAULTS,
    terrainRes: 32,
    lines: 4,
    proceduralSource: 'terrain' as const,
    morphEnabled: true,
    morphSteps: 2,
    morphSecondEnabled: true,
    morphStepsY: 2,
    morphTargets: { terrainRelief: 90 },
    morphTargets2: { terrainScale: 4 },
  };
  const result = computeContours(source, settings, false);
  expect(result.svg.match(/data-morph-x-step=/g)).toHaveLength(4);
  const paths = [];
  for (const terrainScale of [settings.terrainScale, 4])
    for (const terrainRelief of [settings.terrainRelief, 90]) {
      const instance = computeContours(
        source,
        { ...settings, terrainScale, terrainRelief, morphEnabled: false, suppressBackground: true },
        false,
      );
      paths.push(...instance.toolpaths.flatMap((group) => group.runs));
    }
  expect(result.toolpaths.flatMap((group) => group.runs)).toEqual(paths);
});

it('animates generated shape, rounds resolution, and holds seeds until the next keyframe', () => {
  const descriptors: AnimationParameterDescriptor[] = [
    { controlId: 'genBlend', settingKey: 'genBlend', kind: 'continuous', min: 0, max: 100 },
    { controlId: 'genSeed', settingKey: 'genSeed', kind: 'seed', min: 0, max: 9999 },
    { controlId: 'genRes', settingKey: 'genRes', kind: 'integer', min: 32, max: 192 },
  ];
  const settings = {
    ...contourSettings,
    ...GEN_DEFAULTS,
    genRes: 32,
    genBlend: 0,
    proceduralSource: 'generative' as const,
    lines: 4,
  };
  let project = createAnimationProject(settings, descriptors, { durationMs: 1000 });
  project = addAnimationKeyframe(project, 1000, 'end', descriptors);
  for (const [key, value] of [
    ['genBlend', 80],
    ['genSeed', 8],
    ['genRes', 35],
  ] as const)
    project = updateAnimationKeyframeValue(project, 'end', key, value, descriptors);
  const middle = evaluateAnimationSettings(project, 500, descriptors);
  expect(middle).toMatchObject({ genBlend: 40, genSeed: 0, genRes: 34 });
  expect(evaluateAnimationSettings(project, 1000, descriptors).genSeed).toBe(8);
  expect(computeContours(makeContourMesh(), middle, false).svg).not.toBe(
    computeContours(makeContourMesh(), settings, false).svg,
  );
  expect(settings.genBlend).toBe(0);
  expect(
    normalizeProceduralSettings({ genRes: 999, genSeed: 2.7, terrainRelief: NaN }),
  ).toMatchObject({ genRes: 192, genSeed: 3, terrainRelief: TERRAIN_DEFAULTS.terrainRelief });
});
