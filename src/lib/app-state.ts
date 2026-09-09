import type { ContourMesh, ContourSettings, ContourToolpathGroup } from './contour-engine';
import type { ContourSequenceSource } from './contour-features';
import { GEN_DEFAULTS, type GenerativeParams } from './generativeMesh';
import { TERRAIN_DEFAULTS, type TerrainParams } from './generative-terrain';
import { HYPERBOLIC_TILING_DEFAULTS } from './hyperbolic-tiling';
import { OBJECT_DEFAULTS } from './object-settings';
import { WEAVE_DEFAULTS } from './contour-weave-settings';
import { SLICE_RAY_DEFAULTS } from './slice-rays-settings';
import { MAP_DEFAULTS } from './map-settings';
import { resolveWeatherColors } from './weather-bands';
import { DEFAULT_GCODE_PROFILE_ID } from './gcode-profiles';
import { defaultUunaExpressiveMotion, type UunaExpressiveMotion } from './gcode-3d-toolpaths';

export type RawMesh = {
  verts: Float32Array | Float64Array;
  tris: Uint32Array;
};

export type RenderMesh = ContourMesh & {
  V: Float32Array;
  T: Uint32Array;
  N: Float32Array;
  lineArt?: { offsets: Uint32Array; kind?: 'svg' | 'hyperbolic-tiling' };
};
export type NormalizedMesh = Omit<RenderMesh, 'N'> & { N?: Float32Array };

type RenderSettings = Omit<ContourSettings, 'documentTitle' | 'suppressBackground'>;
export type AppState = RenderSettings &
  GenerativeParams &
  TerrainParams & {
    mesh: RenderMesh | null;
    name: string;
    source: string;
    upY: boolean;
    svgSource: string | null;
    svgSourceName: string;
    svgDepth: number;
    svgRounded: boolean;
    svgRoundness: number;
    svgMode: 'extrude' | 'centerline';
    svgCenterlinePruning: number;
    tilingP: number;
    tilingQ: number;
    tilingDepth: number;
    tilingDiskScale: number;
    exportFormat: string;
    gcodeProfile: string;
    gcodeAutoRotate: boolean;
    drawFeed: number;
    travelFeed: number;
    optimizeTravel: boolean;
    mergeTolerance: number;
    penUp: number;
    penDown: number;
    zFeed: number;
    uunaExpressiveMotion: UunaExpressiveMotion;
    svg: string;
    svgBytes: number;
    toolpaths: ContourToolpathGroup[];
    sequenceSource: ContourSequenceSource | null;
    dragging: boolean;
  };

export function createInitialAppState(): AppState {
  return {
    mesh: null,
    name: 'demo · torus knot',
    source: 'knot',
    upY: false,
    svgSource: null,
    svgSourceName: '',
    svgDepth: 12,
    svgRounded: false,
    svgRoundness: 25,
    svgMode: 'extrude',
    svgCenterlinePruning: 2,
    ...HYPERBOLIC_TILING_DEFAULTS,
    ...GEN_DEFAULTS,
    ...TERRAIN_DEFAULTS,
    az: 35,
    el: 24,
    roll: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    lensFocalLength: 50,
    lensPerspective: 0,
    lensWarpExponent: 0,
    lensDistortion: 0,
    projectionWarpMode: 'none',
    mobiusDirection: 0,
    mobiusDisplacement: 0,
    mobiusRotation: 0,
    mobiusStrength: 100,
    sphericalStrength: 100,
    inversionCenterX: 0,
    inversionCenterY: 0,
    inversionRadius: 50,
    inversionStrength: 100,
    lines: 40,
    gapEase: 'linear',
    easeStrength: 100,
    easeCycles: 1,
    easeCenter: 50,
    quality: 7,
    svgSlicePaths: [],
    svgSliceScale: 100,
    svgSliceX: 0,
    svgSliceY: 0,
    svgSliceRotation: 0,
    axis: 'up',
    cutAz: 0,
    cutEl: 90,
    waveCenterX: 0,
    waveCenterY: 0,
    waveCenterZ: 0,
    cylinderAzimuth: 0,
    cylinderElevation: 90,
    geodesicSeedAzimuth: 0,
    geodesicSeedElevation: 90,
    geodesicMode: 'single',
    geodesicSeedBAzimuth: 0,
    geodesicSeedBElevation: -90,
    curvatureMethod: 'gaussian',
    curvatureSmoothing: 2,
    curvatureRange: 98,
    curvatureContrast: 100,
    curvatureIncludeZero: true,
    divergence: 0,
    sliceLfo: false,
    sliceLfoAmplitude: 75,
    sliceLfoCycles: 2,
    sliceLfoAngle: 0,
    sliceLfoPhase: 0,
    sliceLfoWaveform: 'sine',
    sliceLfoModulation: false,
    sliceLfoModulationMode: 'amplitude',
    sliceLfoModulationDepth: 50,
    sliceLfoModulationCycles: 1,
    sliceLfoModulationPhase: 0,
    explodeAmount: 0,
    blockGlitch: false,
    blockGlitchCount: 3,
    blockGlitchWidth: 18,
    blockGlitchHeight: 6,
    blockGlitchDisplacement: 8,
    blockGlitchDirection: 'horizontal',
    blockGlitchClearDestination: false,
    blockGlitchSeed: 1,
    scanBandGlitch: false,
    scanBandGlitchCount: 12,
    scanBandGlitchThickness: 55,
    scanBandGlitchDisplacement: 6,
    scanBandGlitchDensity: 50,
    scanBandGlitchOrientation: 'horizontal',
    scanBandGlitchSeed: 2,
    staggeredSlices: false,
    staggeredSlicesCount: 12,
    staggeredSlicesExtent: 70,
    staggeredSlicesDisplacement: 10,
    staggeredSlicesOrientation: 'horizontal',
    staggeredSlicesPattern: 'ramp',
    staggeredSlicesSeed: 3,
    wraparoundTear: false,
    wraparoundTearOrientation: 'horizontal',
    wraparoundTearPosition: 50,
    wraparoundTearSize: 18,
    wraparoundTearShift: 20,
    tileShuffle: false,
    tileShuffleRows: 4,
    tileShuffleColumns: 4,
    tileShuffleExtent: 80,
    tileShuffleAffected: 50,
    tileShuffleSeed: 4,
    ...WEAVE_DEFAULTS,
    ...SLICE_RAY_DEFAULTS,
    ...OBJECT_DEFAULTS,
    sampleAndHold: false,
    sampleAndHoldAxis: 'y',
    sampleAndHoldSpacing: 2,
    sampleAndHoldLength: 4,
    sampleAndHoldMix: 100,
    misregistration: false,
    misregistrationCopies: 2,
    misregistrationOffset: 2,
    misregistrationRotation: 0.5,
    misregistrationScope: 'contours',
    misregistrationColor1: '#00a7e1',
    misregistrationColor2: '#ec008c',
    misregistrationColor3: '#ffd400',
    kaleidoscope: false,
    kaleidoscopeSegments: 6,
    kaleidoscopeRotation: 0,
    vectorZoom1Enabled: false,
    vectorZoom1Shape: 'rectangle',
    vectorZoom1CenterX: 45,
    vectorZoom1CenterY: 45,
    vectorZoom1Width: 20,
    vectorZoom1Height: 20,
    vectorZoom1Corner: 'top-right',
    vectorZoom1Size: 30,
    vectorZoom1Margin: 14,
    vectorZoom1Color: '#15181a',
    vectorZoom2Enabled: false,
    vectorZoom2Shape: 'rectangle',
    vectorZoom2CenterX: 55,
    vectorZoom2CenterY: 45,
    vectorZoom2Width: 20,
    vectorZoom2Height: 20,
    vectorZoom2Corner: 'top-left',
    vectorZoom2Size: 30,
    vectorZoom2Margin: 14,
    vectorZoom2Color: '#15181a',
    vectorZoom3Enabled: false,
    vectorZoom3Shape: 'circle',
    vectorZoom3CenterX: 45,
    vectorZoom3CenterY: 55,
    vectorZoom3Width: 20,
    vectorZoom3Height: 20,
    vectorZoom3Corner: 'bottom-right',
    vectorZoom3Size: 30,
    vectorZoom3Margin: 14,
    vectorZoom3Color: '#15181a',
    vectorZoom4Enabled: false,
    vectorZoom4Shape: 'circle',
    vectorZoom4CenterX: 55,
    vectorZoom4CenterY: 55,
    vectorZoom4Width: 20,
    vectorZoom4Height: 20,
    vectorZoom4Corner: 'bottom-left',
    vectorZoom4Size: 30,
    vectorZoom4Margin: 14,
    vectorZoom4Color: '#15181a',
    spiral: false,
    hide: true,
    sil: true,
    sw: 0.35,
    lineWeightMode: 'uniform',
    lineWeightInterval: 5,
    lineWeightAmount: 100,
    color: '#15181a',
    backgroundColor: '#ffffff',
    pw: 210,
    ph: 210,
    margin: 14,
    clipToArtboard: true,
    maskEnabled: false,
    maskOutline: false,
    maskRoundness: 100,
    maskScaleX: 100,
    maskScaleY: 100,
    maskOffsetX: 0,
    maskOffsetY: 0,
    maskLfo1Amplitude: 0,
    maskLfo1Cycles: 3,
    maskLfo1Phase: 0,
    maskLfo1Waveform: 0,
    maskLfo2Amplitude: 0,
    maskLfo2Cycles: 5,
    maskLfo2Phase: 90,
    maskLfo2Waveform: 0,
    bg: true,
    gradientEnabled: false,
    gradientColors: 6,
    gradientStops: [
      { position: 0, color: '#ef4444' },
      { position: 0.2, color: '#f59e0b' },
      { position: 0.4, color: '#84cc16' },
      { position: 0.6, color: '#06b6d4' },
      { position: 0.8, color: '#3b82f6' },
      { position: 1, color: '#8b5cf6' },
    ],
    lineIndexColorEnabled: false,
    lineIndexColors: [{ index: 1, color: '#ef4444', series: 'single', reverse: false }],
    weatherBands: false,
    ...resolveWeatherColors({}),
    halftone: false,
    halftoneSize: 2.4,
    halftoneContrast: 75,
    halftoneCycles: 2,
    chroma: false,
    chromaAmount: 1.5,
    humanizer: false,
    humanizerAmount: 30,
    yarnCurl: false,
    yarnCutPercent: 15,
    yarnCurlSize: 100,
    blueprint: false,
    blueprintStyle: 'blue',
    topographicMap: false,
    ...MAP_DEFAULTS,
    morphEnabled: false,
    morphSteps: 4,
    morphTargets: {},
    morphSecondEnabled: false,
    morphStepsY: 4,
    morphTargets2: {},
    exportFormat: 'svg',
    gcodeProfile: DEFAULT_GCODE_PROFILE_ID,
    gcodeAutoRotate: true,
    drawFeed: 3000,
    travelFeed: 6000,
    optimizeTravel: true,
    mergeTolerance: 0.15,
    penUp: 0,
    penDown: -3,
    zFeed: 2000,
    uunaExpressiveMotion: defaultUunaExpressiveMotion(),
    svg: '',
    svgBytes: 0,
    toolpaths: [],
    sequenceSource: null,
    dragging: false,
  };
}
