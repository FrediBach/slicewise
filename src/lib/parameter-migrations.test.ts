import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import { type ContourSettings } from './contour-engine';
import { HYPERBOLIC_TILING_DEFAULTS } from './hyperbolic-tiling';
import { normalizeParameterSnapshot } from './parameter-migrations';

const snapshot = (overrides: Record<string, unknown> = {}): ContourSettings =>
  ({ ...structuredClone(contourSettings), ...overrides }) as ContourSettings;

describe('parameter snapshot migrations', () => {
  it('fills missing vector-zoom slots without mutating the stored snapshot', () => {
    const stored = snapshot();
    const restored = normalizeParameterSnapshot(stored);

    expect(stored).not.toHaveProperty('vectorZoom1Enabled');
    expect(restored).toMatchObject({
      vectorZoom1Enabled: false,
      vectorZoom1Shape: 'rectangle',
      vectorZoom1CenterX: 45,
      vectorZoom1CenterY: 45,
      vectorZoom1Corner: 'top-right',
      vectorZoom3Shape: 'circle',
      vectorZoom3CenterX: 45,
      vectorZoom3CenterY: 55,
      vectorZoom3Corner: 'bottom-right',
      vectorZoom4Color: contourSettings.color,
    });
  });

  it('preserves valid non-default vector-zoom shapes and values', () => {
    const restored = normalizeParameterSnapshot(
      snapshot({
        vectorZoom3Enabled: true,
        vectorZoom3Shape: 'rectangle',
        vectorZoom3CenterX: 62,
        vectorZoom3Color: '#aabbcc',
      }),
    );

    expect(restored.vectorZoom3Enabled).toBe(true);
    expect(restored.vectorZoom3Shape).toBe('rectangle');
    expect(restored.vectorZoom3CenterX).toBe(62);
    expect(restored.vectorZoom3Color).toBe('#aabbcc');
  });

  it('migrates legacy optical presets into lens distortion', () => {
    const stored = snapshot({ lens: 'fisheye', lensAmount: 50, lensDistortion: undefined });
    const restored = normalizeParameterSnapshot(stored);

    expect(restored.lensDistortion).toBe(-50);
    expect(stored.lensDistortion).toBeUndefined();
  });

  it('uses the legacy warp exponent when the projection mode is absent', () => {
    const restored = normalizeParameterSnapshot(
      snapshot({ projectionWarpMode: 'unsupported', lensWarpExponent: 35 }),
    );

    expect(restored.projectionWarpMode).toBe('klein-poincare');
  });

  it('repairs invalid tiling, intrinsic-field, and curvature values', () => {
    const restored = normalizeParameterSnapshot(
      snapshot({
        tilingP: 4,
        tilingQ: 4,
        tilingDepth: Number.NaN,
        tilingDiskScale: Number.NaN,
        geodesicMode: 'invalid',
        curvatureMethod: 'invalid',
        curvatureSmoothing: Number.NaN,
        curvatureRange: Number.NaN,
        curvatureContrast: Number.NaN,
        explodeAmount: Number.NaN,
      }),
    );

    expect(restored).toMatchObject({
      tilingP: HYPERBOLIC_TILING_DEFAULTS.tilingP,
      tilingQ: HYPERBOLIC_TILING_DEFAULTS.tilingQ,
      tilingDepth: HYPERBOLIC_TILING_DEFAULTS.tilingDepth,
      tilingDiskScale: HYPERBOLIC_TILING_DEFAULTS.tilingDiskScale,
      geodesicMode: 'single',
      curvatureMethod: 'gaussian',
      curvatureSmoothing: 2,
      curvatureRange: 98,
      curvatureContrast: 100,
      explodeAmount: 0,
    });
  });

  it('restores a usable default indexed-colour rule', () => {
    const restored = normalizeParameterSnapshot(
      snapshot({ lineIndexColorEnabled: undefined, lineIndexColors: [] }),
    );

    expect(restored.lineIndexColorEnabled).toBe(false);
    expect(restored.lineIndexColors).toEqual([
      { index: 1, color: '#ef4444', series: 'single', reverse: false },
    ]);
  });

  it('repairs missing or invalid block-glitch settings', () => {
    const restored = normalizeParameterSnapshot(
      snapshot({
        blockGlitch: undefined,
        blockGlitchCount: Number.NaN,
        blockGlitchWidth: Number.NaN,
        blockGlitchHeight: Number.NaN,
        blockGlitchDisplacement: Number.NaN,
        blockGlitchDirection: 'diagonal-only',
        blockGlitchClearDestination: undefined,
        blockGlitchSeed: Number.NaN,
      }),
    );

    expect(restored).toMatchObject({
      blockGlitch: false,
      blockGlitchCount: 3,
      blockGlitchWidth: 18,
      blockGlitchHeight: 6,
      blockGlitchDisplacement: 8,
      blockGlitchDirection: 'horizontal',
      blockGlitchClearDestination: false,
      blockGlitchSeed: 1,
    });
  });

  it('repairs missing or invalid scan-band settings', () => {
    const restored = normalizeParameterSnapshot(
      snapshot({
        scanBandGlitch: undefined,
        scanBandGlitchCount: Number.NaN,
        scanBandGlitchThickness: Number.NaN,
        scanBandGlitchDisplacement: Number.NaN,
        scanBandGlitchDensity: Number.NaN,
        scanBandGlitchOrientation: 'diagonal',
        scanBandGlitchSeed: Number.NaN,
      }),
    );

    expect(restored).toMatchObject({
      scanBandGlitch: false,
      scanBandGlitchCount: 12,
      scanBandGlitchThickness: 55,
      scanBandGlitchDisplacement: 6,
      scanBandGlitchDensity: 50,
      scanBandGlitchOrientation: 'horizontal',
      scanBandGlitchSeed: 2,
    });
  });

  it('repairs missing or invalid staggered-slice settings', () => {
    const restored = normalizeParameterSnapshot(
      snapshot({
        staggeredSlices: undefined,
        staggeredSlicesCount: Number.NaN,
        staggeredSlicesExtent: Number.NaN,
        staggeredSlicesDisplacement: Number.NaN,
        staggeredSlicesOrientation: 'diagonal',
        staggeredSlicesPattern: 'unsupported',
        staggeredSlicesSeed: Number.NaN,
      }),
    );

    expect(restored).toMatchObject({
      staggeredSlices: false,
      staggeredSlicesCount: 12,
      staggeredSlicesExtent: 70,
      staggeredSlicesDisplacement: 10,
      staggeredSlicesOrientation: 'horizontal',
      staggeredSlicesPattern: 'ramp',
      staggeredSlicesSeed: 3,
    });
  });

  it('repairs invalid optical, wavefront, and vector-zoom values', () => {
    const restored = normalizeParameterSnapshot(
      snapshot({
        lensFocalLength: Number.NaN,
        lensPerspective: Number.NaN,
        lensWarpExponent: Number.NaN,
        lensDistortion: Number.NaN,
        projectionWarpMode: 'invalid',
        mobiusDirection: Number.NaN,
        mobiusDisplacement: Number.NaN,
        mobiusRotation: Number.NaN,
        mobiusStrength: Number.NaN,
        sphericalStrength: Number.NaN,
        inversionCenterX: Number.NaN,
        inversionCenterY: Number.NaN,
        inversionRadius: Number.NaN,
        inversionStrength: Number.NaN,
        waveCenterX: Number.NaN,
        waveCenterY: Number.NaN,
        waveCenterZ: Number.NaN,
        cylinderAzimuth: Number.NaN,
        cylinderElevation: Number.NaN,
        geodesicSeedAzimuth: Number.NaN,
        geodesicSeedElevation: Number.NaN,
        geodesicSeedBAzimuth: Number.NaN,
        geodesicSeedBElevation: Number.NaN,
        vectorZoom2Shape: 'triangle',
        vectorZoom2Corner: 'middle',
        vectorZoom2Color: 'red',
        vectorZoom2Width: Number.NaN,
      }),
    );

    expect(restored).toMatchObject({
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
      waveCenterX: 0,
      waveCenterY: 0,
      waveCenterZ: 0,
      cylinderAzimuth: 0,
      cylinderElevation: 90,
      geodesicSeedAzimuth: 0,
      geodesicSeedElevation: 90,
      geodesicSeedBAzimuth: 0,
      geodesicSeedBElevation: -90,
      vectorZoom2Shape: 'rectangle',
      vectorZoom2Corner: 'top-left',
      vectorZoom2Color: contourSettings.color,
      vectorZoom2Width: 20,
    });
  });

  it('preserves valid modern settings and rounds discrete tiling values', () => {
    const rules = [{ index: 3, color: '#112233', series: 'prime' as const, reverse: true }];
    const restored = normalizeParameterSnapshot(
      snapshot({
        lineIndexColorEnabled: true,
        lineIndexColors: rules,
        lensFocalLength: 85,
        lensPerspective: 42,
        lensWarpExponent: 20,
        lensDistortion: -12,
        projectionWarpMode: 'mobius',
        mobiusDirection: 30,
        mobiusDisplacement: 40,
        mobiusRotation: 50,
        mobiusStrength: 60,
        sphericalStrength: 70,
        inversionCenterX: 8,
        inversionCenterY: 9,
        inversionRadius: 55,
        inversionStrength: 80,
        tilingP: 7.2,
        tilingQ: 3.1,
        tilingDepth: 4.4,
        tilingDiskScale: 88,
        geodesicMode: 'nearest',
        curvatureMethod: 'mean',
        curvatureSmoothing: 4,
        curvatureRange: 95,
        curvatureContrast: 125,
        curvatureIncludeZero: false,
        explodeAmount: 45,
      }),
    );

    expect(restored).toMatchObject({
      lineIndexColorEnabled: true,
      lineIndexColors: rules,
      lensFocalLength: 85,
      lensPerspective: 42,
      lensWarpExponent: 20,
      lensDistortion: -12,
      projectionWarpMode: 'mobius',
      mobiusDirection: 30,
      mobiusDisplacement: 40,
      mobiusRotation: 50,
      mobiusStrength: 60,
      sphericalStrength: 70,
      inversionCenterX: 8,
      inversionCenterY: 9,
      inversionRadius: 55,
      inversionStrength: 80,
      tilingP: 7,
      tilingQ: 3,
      tilingDepth: 4,
      tilingDiskScale: 88,
      geodesicMode: 'nearest',
      curvatureMethod: 'mean',
      curvatureSmoothing: 4,
      curvatureRange: 95,
      curvatureContrast: 125,
      curvatureIncludeZero: false,
      explodeAmount: 45,
    });
  });
});
