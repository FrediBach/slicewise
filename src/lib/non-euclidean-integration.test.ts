import { describe, expect, it } from 'vitest';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { computeContours, type ContourMesh, type ContourSettings } from './contour-engine';
import { generateGCode } from './gcode';
import { generateHyperbolicTiling } from './hyperbolic-tiling';

const finiteOutput = (value: string): boolean => !/(?:NaN|undefined|Infinity)/.test(value);

function assertBothPlotterProfiles(
  result: ReturnType<typeof computeContours>,
  settings: ContourSettings,
): void {
  for (const [machine, origin] of [
    ['UUNA TEK 3.0 · A3', 'rear-left'],
    ['Generic Z-axis plotter', 'bottom-left'],
  ] as const) {
    const gcode = generateGCode(
      result.toolpaths,
      { width: settings.pw, height: settings.ph },
      {
        machine,
        origin,
        clipToArtboard: settings.clipToArtboard,
        optimizeTravel: true,
        mergeTolerance: 0.15,
      },
    );
    expect(gcode).toContain(`; Machine: ${machine}`);
    expect(gcode).toContain(`; Origin: ${origin}`);
    expect(finiteOutput(gcode)).toBe(true);
  }
}

const hardeningSettings = {
  ...contourSettings,
  az: -28,
  el: 38,
  roll: 17,
  zoom: 0.92,
  panX: 3,
  panY: -4,
  lines: 6,
  quality: 4,
  gapEase: 'sine-in-out',
  easeStrength: 125,
  easeCycles: 2,
  easeCenter: 42,
  hide: true,
  sil: true,
  lineWeightMode: 'wave',
  lineWeightInterval: 3,
  lineWeightAmount: 70,
  gradientEnabled: true,
  gradientColors: 3,
  lineIndexColorEnabled: true,
  lineIndexColors: [{ index: 2, color: '#22c55e', series: 'single' as const, reverse: false }],
  humanizer: true,
  humanizerAmount: 16,
  yarnCurl: true,
  yarnCutPercent: 12,
  yarnCurlSize: 75,
  blockGlitch: true,
  blockGlitchCount: 4,
  blockGlitchWidth: 22,
  blockGlitchHeight: 9,
  blockGlitchDisplacement: 7,
  blockGlitchDirection: 'horizontal',
  blockGlitchSeed: 41,
  scanBandGlitch: true,
  scanBandGlitchCount: 10,
  scanBandGlitchThickness: 60,
  scanBandGlitchDisplacement: 5,
  scanBandGlitchDensity: 45,
  scanBandGlitchOrientation: 'horizontal',
  scanBandGlitchSeed: 29,
  staggeredSlices: true,
  staggeredSlicesCount: 7,
  staggeredSlicesExtent: 75,
  staggeredSlicesDisplacement: 6,
  staggeredSlicesOrientation: 'horizontal',
  staggeredSlicesPattern: 'alternating',
  clipToArtboard: true,
  maskEnabled: true,
  maskOutline: true,
  maskRoundness: 82,
  maskScaleX: 94,
  maskScaleY: 90,
  maskOffsetX: 3,
  maskOffsetY: -2,
  blueprint: true,
  topographicMap: true,
  vectorZoom1Enabled: true,
  vectorZoom1Shape: 'circle',
  vectorZoom1CenterX: 42,
  vectorZoom1CenterY: 48,
  vectorZoom1Width: 18,
  vectorZoom1Height: 18,
  vectorZoom1Corner: 'top-right',
  vectorZoom1Size: 28,
  vectorZoom1Margin: 9,
  vectorZoom1Color: '#f97316',
  morphEnabled: true,
  morphSteps: 2,
  morphTargets: { zoom: 1.04, panX: 7 },
  morphSecondEnabled: true,
  morphStepsY: 2,
  morphTargets2: { roll: 29, panY: 2 },
} satisfies ContourSettings;

const meshCases: ReadonlyArray<readonly [string, Partial<ContourSettings>]> = [
  [
    'Möbius projection',
    {
      projectionWarpMode: 'mobius',
      mobiusDirection: 32,
      mobiusDisplacement: 48,
      mobiusRotation: -24,
      mobiusStrength: 85,
    },
  ],
  ['stereographic projection', { projectionWarpMode: 'stereographic', sphericalStrength: 72 }],
  ['gnomonic projection', { projectionWarpMode: 'gnomonic', sphericalStrength: 55 }],
  ['Lambert projection', { projectionWarpMode: 'lambert', sphericalStrength: 78 }],
  [
    'circle inversion',
    {
      projectionWarpMode: 'inversion',
      inversionCenterX: 38,
      inversionCenterY: -31,
      inversionRadius: 62,
      inversionStrength: 68,
    },
  ],
  [
    'spherical wavefront',
    { axis: 'spherical', waveCenterX: 22, waveCenterY: -14, waveCenterZ: 18 },
  ],
  [
    'cylindrical wavefront',
    {
      axis: 'cylindrical',
      waveCenterX: -18,
      waveCenterY: 12,
      waveCenterZ: 5,
      cylinderAzimuth: 34,
      cylinderElevation: 61,
    },
  ],
  [
    'two-source geodesic field',
    {
      axis: 'geodesic',
      geodesicMode: 'nearest',
      geodesicSeedAzimuth: 25,
      geodesicSeedElevation: 62,
      geodesicSeedBAzimuth: -145,
      geodesicSeedBElevation: -48,
    },
  ],
  [
    'Gaussian-curvature field',
    {
      axis: 'curvature',
      curvatureMethod: 'gaussian',
      curvatureSmoothing: 3,
      curvatureRange: 97,
      curvatureContrast: 115,
      curvatureIncludeZero: true,
    },
  ],
];

describe('non-Euclidean release compatibility', () => {
  it.each(meshCases)('composes %s across preview, effects, morphs, and exports', (_name, mode) => {
    const mesh = makeContourMesh();
    const settings = { ...hardeningSettings, ...mode };
    const quick = computeContours(mesh, { ...settings, previewDetail: 0.5 }, true);
    const exact = computeContours(mesh, settings, false);

    expect(quick.paths).toBeGreaterThan(0);
    expect(quick.toolpaths).toEqual([]);
    expect(exact.paths).toBeGreaterThan(0);
    expect(exact.toolpaths.length).toBeGreaterThan(0);
    expect(finiteOutput(quick.svg)).toBe(true);
    expect(finiteOutput(exact.svg)).toBe(true);
    expect(exact.svg).toContain('data-morph-x-step="2"');
    expect(exact.svg).toContain('data-morph-y-step="2"');
    expect(exact.svg).toContain('id="topographic-annotations"');
    expect(exact.svg).toContain('id="technical-annotations"');
    assertBothPlotterProfiles(exact, settings);
  });

  it.each([
    ['mobius', { mobiusDirection: 20, mobiusDisplacement: 40, mobiusRotation: -15 }],
    ['stereographic', { sphericalStrength: 70 }],
    ['gnomonic', { sphericalStrength: 45 }],
    ['lambert', { sphericalStrength: 75 }],
    [
      'inversion',
      { inversionCenterX: 45, inversionCenterY: 35, inversionRadius: 55, inversionStrength: 60 },
    ],
  ] as const)('applies %s safely to imported SVG centreline geometry', (mode, parameters) => {
    const mesh: ContourMesh = {
      V: new Float32Array([-0.8, -0.55, 0, -0.2, 0.65, 0, 0.45, 0.42, 0, 0.78, -0.5, 0]),
      T: new Uint32Array(),
      lineArt: { offsets: new Uint32Array([0, 4]), kind: 'svg' },
    };
    const settings = {
      ...contourSettings,
      ...parameters,
      projectionWarpMode: mode,
      az: -90,
      el: 90,
      roll: 13,
      zoom: 0.9,
      panX: 4,
      panY: -3,
      clipToArtboard: true,
      gradientEnabled: true,
      humanizer: true,
      yarnCurl: true,
      maskEnabled: true,
      maskScaleX: 92,
      maskScaleY: 88,
      blueprint: true,
      topographicMap: true,
    } satisfies ContourSettings;
    const result = computeContours(mesh, settings, false);

    expect(result.paths).toBeGreaterThan(0);
    expect(result.toolpaths.length).toBeGreaterThan(0);
    expect(finiteOutput(result.svg)).toBe(true);
    assertBothPlotterProfiles(result, settings);
  });

  it('composes generated hyperbolic line art with navigation, styling, masks, and annotations', () => {
    const tiling = generateHyperbolicTiling({ p: 7, q: 3, depth: 2 });
    const vertices = new Float32Array((tiling.points.length / 2) * 3);
    for (let index = 0; index < tiling.points.length / 2; index++) {
      vertices[index * 3] = tiling.points[index * 2];
      vertices[index * 3 + 1] = tiling.points[index * 2 + 1];
    }
    const mesh: ContourMesh = {
      V: vertices,
      T: new Uint32Array(),
      lineArt: { offsets: tiling.offsets, kind: 'hyperbolic-tiling' },
    };
    const settings = {
      ...hardeningSettings,
      az: -90,
      el: 90,
      projectionWarpMode: 'mobius',
      mobiusDirection: -35,
      mobiusDisplacement: 36,
      mobiusRotation: 28,
      mobiusStrength: 90,
      tilingDiskScale: 88,
      morphTargets: { tilingDiskScale: 68, mobiusDisplacement: 52 },
      morphTargets2: { mobiusRotation: -32 },
    } satisfies ContourSettings;
    const quick = computeContours(mesh, { ...settings, previewDetail: 0.5 }, true);
    const exact = computeContours(mesh, settings, false);

    expect(quick.paths).toBeGreaterThan(0);
    expect(quick.toolpaths).toEqual([]);
    expect(exact.paths).toBeGreaterThan(0);
    expect(exact.toolpaths.length).toBeGreaterThan(0);
    expect(exact.svg).toContain('id="topographic-annotations"');
    expect(exact.svg).toContain('id="technical-annotations"');
    expect(finiteOutput(exact.svg)).toBe(true);
    assertBothPlotterProfiles(exact, settings);
  }, 10_000);
});
