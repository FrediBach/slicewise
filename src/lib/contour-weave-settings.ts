/** Model-space fabric controls shared by rendering, UI, and saved settings. */
export const WEAVE_CONTROLS = [
  {
    id: 'weaveAzimuth',
    label: 'Fabric azimuth',
    min: -180,
    max: 180,
    step: 1,
    value: 0,
    unit: '°',
  },
  { id: 'weaveElevation', label: 'Fabric tilt', min: -90, max: 90, step: 1, value: 30, unit: '°' },
  { id: 'weaveRoll', label: 'Fabric roll', min: -180, max: 180, step: 1, value: -30, unit: '°' },
  {
    id: 'weaveAngle',
    label: 'Thread crossing angle',
    min: 10,
    max: 170,
    step: 1,
    value: 90,
    unit: '°',
  },
  { id: 'weaveDensity', label: 'Weft density', min: 25, max: 400, step: 1, value: 100, unit: '%' },
  { id: 'weaveShift', label: 'Weft slide', min: 0, max: 100, step: 1, value: 0, unit: '%' },
  { id: 'weaveTwist', label: 'Fabric twist', min: -360, max: 360, step: 1, value: 0, unit: '°' },
  { id: 'weaveWidth', label: 'Ribbon width', min: 0, max: 12, step: 0.1, value: 0, unit: 'mm' },
  {
    id: 'weaveGap',
    label: 'Crossing clearance',
    min: 0,
    max: 15,
    step: 0.1,
    value: 0.4,
    unit: 'mm',
  },
  {
    id: 'weaveProtection',
    label: 'Gap protection',
    min: 0,
    max: 100,
    step: 1,
    value: 100,
    unit: '%',
  },
  { id: 'weavePhase', label: 'Pattern phase', min: 0, max: 31, step: 1, value: 0, unit: '' },
] as const;
export const WEAVE_PATTERNS = {
  plain: 'Plain weave',
  twill: 'Diagonal twill',
  basket: 'Basket weave',
  warp: 'Warp over',
  weft: 'Weft over',
} as const;
export const WEAVE_OUTPUTS = {
  both: 'Both families',
  warp: 'Warp only',
  weft: 'Weft only',
  crossings: 'Crossing fragments only',
} as const;
type WeaveNumbers = { [K in (typeof WEAVE_CONTROLS)[number]['id']]: number };
export interface ContourWeaveSettings extends WeaveNumbers {
  contourWeave: boolean;
  weavePattern: string;
  weaveOutput: string;
  weaveColor: string;
}
export const WEAVE_DEFAULTS: ContourWeaveSettings = {
  ...(Object.fromEntries(WEAVE_CONTROLS.map(({ id, value }) => [id, value])) as WeaveNumbers),
  contourWeave: false,
  weavePattern: 'plain',
  weaveOutput: 'both',
  weaveColor: '#b87333',
};
export const LEGACY_WEAVE_KEYS = [
  'weaveStride',
  'weaveRotation',
  'weaveScale',
  'weaveOffsetX',
  'weaveOffsetY',
] as const;
export function resolveWeaveSettings(input: Partial<ContourWeaveSettings>): ContourWeaveSettings {
  const result = { ...WEAVE_DEFAULTS, contourWeave: input.contourWeave === true };
  for (const { id, min, max, step } of WEAVE_CONTROLS) {
    const value = input[id];
    if (typeof value === 'number' && Number.isFinite(value))
      result[id] = Math.max(min, Math.min(max, step === 1 ? Math.round(value) : value));
  }
  if (Object.hasOwn(WEAVE_PATTERNS, input.weavePattern ?? ''))
    result.weavePattern = input.weavePattern!;
  if (Object.hasOwn(WEAVE_OUTPUTS, input.weaveOutput ?? ''))
    result.weaveOutput = input.weaveOutput!;
  if (/^#[0-9a-f]{6}$/i.test(input.weaveColor ?? '')) result.weaveColor = input.weaveColor!;
  return result;
}
