import { type ContourSettings } from './contour-engine';
import { HYPERBOLIC_TILING_DEFAULTS, isHyperbolicPair } from './hyperbolic-tiling';

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const vectorZoomDefaults = [
  { x: 45, y: 45, shape: 'rectangle', corner: 'top-right' },
  { x: 55, y: 45, shape: 'rectangle', corner: 'top-left' },
  { x: 45, y: 55, shape: 'circle', corner: 'bottom-right' },
  { x: 55, y: 55, shape: 'circle', corner: 'bottom-left' },
] as const;

const projectionWarpModes = [
  'none',
  'klein-poincare',
  'mobius',
  'stereographic',
  'gnomonic',
  'lambert',
  'inversion',
] as const;

/** Normalize old or incomplete saved settings without mutating stored data. */
export function normalizeParameterSnapshot(snapshot: ContourSettings): ContourSettings {
  const restored = structuredClone(snapshot);
  const values = restored as unknown as Record<string, unknown>;

  for (let index = 1; index <= 4; index++) {
    const prefix = `vectorZoom${index}`;
    const defaults = vectorZoomDefaults[index - 1];
    values[`${prefix}Enabled`] = values[`${prefix}Enabled`] === true;
    values[`${prefix}Shape`] = ['rectangle', 'circle'].includes(String(values[`${prefix}Shape`]))
      ? values[`${prefix}Shape`]
      : defaults.shape;
    values[`${prefix}Corner`] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(
      String(values[`${prefix}Corner`]),
    )
      ? values[`${prefix}Corner`]
      : defaults.corner;
    values[`${prefix}Color`] = /^#[0-9a-f]{6}$/i.test(String(values[`${prefix}Color`]))
      ? values[`${prefix}Color`]
      : restored.color || '#15181a';
    for (const [suffix, fallback] of [
      ['CenterX', defaults.x],
      ['CenterY', defaults.y],
      ['Width', 20],
      ['Height', 20],
      ['Size', 30],
      ['Margin', 14],
    ] as const) {
      values[`${prefix}${suffix}`] = Number.isFinite(values[`${prefix}${suffix}`])
        ? values[`${prefix}${suffix}`]
        : fallback;
    }
  }

  restored.lineIndexColorEnabled = restored.lineIndexColorEnabled ?? false;
  restored.lineIndexColors = restored.lineIndexColors?.length
    ? restored.lineIndexColors
    : [{ index: 1, color: '#ef4444', series: 'single', reverse: false }];
  restored.blockGlitch = restored.blockGlitch === true;
  restored.blockGlitchCount = Number.isFinite(restored.blockGlitchCount)
    ? restored.blockGlitchCount
    : 3;
  restored.blockGlitchWidth = Number.isFinite(restored.blockGlitchWidth)
    ? restored.blockGlitchWidth
    : 18;
  restored.blockGlitchHeight = Number.isFinite(restored.blockGlitchHeight)
    ? restored.blockGlitchHeight
    : 6;
  restored.blockGlitchDisplacement = Number.isFinite(restored.blockGlitchDisplacement)
    ? restored.blockGlitchDisplacement
    : 8;
  restored.blockGlitchDirection = ['horizontal', 'vertical', 'both'].includes(
    String(restored.blockGlitchDirection),
  )
    ? restored.blockGlitchDirection
    : 'horizontal';
  restored.blockGlitchClearDestination = restored.blockGlitchClearDestination === true;
  restored.blockGlitchSeed = Number.isFinite(restored.blockGlitchSeed)
    ? restored.blockGlitchSeed
    : 1;
  restored.scanBandGlitch = restored.scanBandGlitch === true;
  restored.scanBandGlitchCount = Number.isFinite(restored.scanBandGlitchCount)
    ? restored.scanBandGlitchCount
    : 12;
  restored.scanBandGlitchThickness = Number.isFinite(restored.scanBandGlitchThickness)
    ? restored.scanBandGlitchThickness
    : 55;
  restored.scanBandGlitchDisplacement = Number.isFinite(restored.scanBandGlitchDisplacement)
    ? restored.scanBandGlitchDisplacement
    : 6;
  restored.scanBandGlitchDensity = Number.isFinite(restored.scanBandGlitchDensity)
    ? restored.scanBandGlitchDensity
    : 50;
  restored.scanBandGlitchOrientation = ['horizontal', 'vertical'].includes(
    String(restored.scanBandGlitchOrientation),
  )
    ? restored.scanBandGlitchOrientation
    : 'horizontal';
  restored.scanBandGlitchSeed = Number.isFinite(restored.scanBandGlitchSeed)
    ? restored.scanBandGlitchSeed
    : 2;
  restored.staggeredSlices = restored.staggeredSlices === true;
  restored.staggeredSlicesCount = Number.isFinite(restored.staggeredSlicesCount)
    ? restored.staggeredSlicesCount
    : 12;
  restored.staggeredSlicesExtent = Number.isFinite(restored.staggeredSlicesExtent)
    ? restored.staggeredSlicesExtent
    : 70;
  restored.staggeredSlicesDisplacement = Number.isFinite(restored.staggeredSlicesDisplacement)
    ? restored.staggeredSlicesDisplacement
    : 10;
  restored.staggeredSlicesOrientation = ['horizontal', 'vertical'].includes(
    String(restored.staggeredSlicesOrientation),
  )
    ? restored.staggeredSlicesOrientation
    : 'horizontal';
  restored.staggeredSlicesPattern = ['ramp', 'alternating', 'seeded'].includes(
    String(restored.staggeredSlicesPattern),
  )
    ? restored.staggeredSlicesPattern
    : 'ramp';
  restored.staggeredSlicesSeed = Number.isFinite(restored.staggeredSlicesSeed)
    ? restored.staggeredSlicesSeed
    : 3;
  restored.lensFocalLength = Number.isFinite(restored.lensFocalLength)
    ? restored.lensFocalLength
    : 50;
  restored.lensPerspective = Number.isFinite(restored.lensPerspective)
    ? restored.lensPerspective
    : 0;
  restored.lensWarpExponent = Number.isFinite(restored.lensWarpExponent)
    ? restored.lensWarpExponent
    : 0;
  restored.projectionWarpMode = projectionWarpModes.includes(
    restored.projectionWarpMode as (typeof projectionWarpModes)[number],
  )
    ? restored.projectionWarpMode
    : restored.lensWarpExponent !== 0
      ? 'klein-poincare'
      : 'none';
  restored.mobiusDirection = Number.isFinite(restored.mobiusDirection)
    ? restored.mobiusDirection
    : 0;
  restored.mobiusDisplacement = Number.isFinite(restored.mobiusDisplacement)
    ? restored.mobiusDisplacement
    : 0;
  restored.mobiusRotation = Number.isFinite(restored.mobiusRotation) ? restored.mobiusRotation : 0;
  restored.mobiusStrength = Number.isFinite(restored.mobiusStrength)
    ? restored.mobiusStrength
    : 100;
  restored.sphericalStrength = Number.isFinite(restored.sphericalStrength)
    ? restored.sphericalStrength
    : 100;
  restored.inversionCenterX = Number.isFinite(restored.inversionCenterX)
    ? restored.inversionCenterX
    : 0;
  restored.inversionCenterY = Number.isFinite(restored.inversionCenterY)
    ? restored.inversionCenterY
    : 0;
  restored.inversionRadius = Number.isFinite(restored.inversionRadius)
    ? restored.inversionRadius
    : 50;
  restored.inversionStrength = Number.isFinite(restored.inversionStrength)
    ? restored.inversionStrength
    : 100;

  restored.tilingP = Number.isFinite(restored.tilingP)
    ? Math.round(restored.tilingP)
    : HYPERBOLIC_TILING_DEFAULTS.tilingP;
  restored.tilingQ = Number.isFinite(restored.tilingQ)
    ? Math.round(restored.tilingQ)
    : HYPERBOLIC_TILING_DEFAULTS.tilingQ;
  if (!isHyperbolicPair(restored.tilingP, restored.tilingQ)) {
    restored.tilingP = HYPERBOLIC_TILING_DEFAULTS.tilingP;
    restored.tilingQ = HYPERBOLIC_TILING_DEFAULTS.tilingQ;
  }
  restored.tilingDepth = Number.isFinite(restored.tilingDepth)
    ? Math.round(restored.tilingDepth)
    : HYPERBOLIC_TILING_DEFAULTS.tilingDepth;
  restored.tilingDiskScale = Number.isFinite(restored.tilingDiskScale)
    ? restored.tilingDiskScale
    : HYPERBOLIC_TILING_DEFAULTS.tilingDiskScale;

  restored.waveCenterX = Number.isFinite(restored.waveCenterX) ? restored.waveCenterX : 0;
  restored.waveCenterY = Number.isFinite(restored.waveCenterY) ? restored.waveCenterY : 0;
  restored.waveCenterZ = Number.isFinite(restored.waveCenterZ) ? restored.waveCenterZ : 0;
  restored.cylinderAzimuth = Number.isFinite(restored.cylinderAzimuth)
    ? restored.cylinderAzimuth
    : 0;
  restored.cylinderElevation = Number.isFinite(restored.cylinderElevation)
    ? restored.cylinderElevation
    : 90;
  restored.geodesicSeedAzimuth = Number.isFinite(restored.geodesicSeedAzimuth)
    ? restored.geodesicSeedAzimuth
    : 0;
  restored.geodesicSeedElevation = Number.isFinite(restored.geodesicSeedElevation)
    ? restored.geodesicSeedElevation
    : 90;
  restored.geodesicMode = ['single', 'nearest', 'difference', 'voronoi'].includes(
    String(restored.geodesicMode),
  )
    ? restored.geodesicMode
    : 'single';
  restored.geodesicSeedBAzimuth = Number.isFinite(restored.geodesicSeedBAzimuth)
    ? restored.geodesicSeedBAzimuth
    : 0;
  restored.geodesicSeedBElevation = Number.isFinite(restored.geodesicSeedBElevation)
    ? restored.geodesicSeedBElevation
    : -90;
  restored.curvatureMethod = ['gaussian', 'mean'].includes(String(restored.curvatureMethod))
    ? restored.curvatureMethod
    : 'gaussian';
  restored.curvatureSmoothing = Number.isFinite(restored.curvatureSmoothing)
    ? restored.curvatureSmoothing
    : 2;
  restored.curvatureRange = Number.isFinite(restored.curvatureRange) ? restored.curvatureRange : 98;
  restored.curvatureContrast = Number.isFinite(restored.curvatureContrast)
    ? restored.curvatureContrast
    : 100;
  restored.curvatureIncludeZero = restored.curvatureIncludeZero !== false;
  restored.explodeAmount = Number.isFinite(restored.explodeAmount) ? restored.explodeAmount : 0;

  if (!Number.isFinite(restored.lensDistortion)) {
    const legacyCurve: Readonly<Record<string, number>> = {
      clean: 0,
      wide: -0.18,
      fisheye: -0.4,
      tele: 0.16,
    };
    restored.lensDistortion = clamp(
      ((legacyCurve[restored.lens || 'clean'] || 0) * (restored.lensAmount ?? 100)) / 0.4,
      -100,
      100,
    );
  }
  return restored;
}
