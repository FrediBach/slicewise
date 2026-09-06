export const SLICE_RAY_CONTROLS = [
  { id: 'sliceRayAmount', label: 'Ray amount', min: 0, max: 200, value: 24, unit: '/ slice' },
  { id: 'sliceRayLength', label: 'Ray length', min: 0, max: 100, value: 12, unit: '% model' },
  { id: 'sliceRayVariation', label: 'Length variation', min: 0, max: 100, value: 35, unit: '%' },
  { id: 'sliceRayFade', label: 'Ray fade', min: 0, max: 100, value: 50, unit: '%' },
] as const;

type RayNumbers = { [K in (typeof SLICE_RAY_CONTROLS)[number]['id']]: number };
export interface SliceRaySettings extends RayNumbers {
  sliceRays: boolean;
}
export const SLICE_RAY_DEFAULTS: SliceRaySettings = {
  sliceRays: false,
  sliceRayAmount: 24,
  sliceRayLength: 12,
  sliceRayVariation: 35,
  sliceRayFade: 50,
};

export function resolveSliceRaySettings(settings: Partial<SliceRaySettings>): SliceRaySettings {
  const result = { ...SLICE_RAY_DEFAULTS, sliceRays: settings.sliceRays === true };
  for (const { id, min, max, value } of SLICE_RAY_CONTROLS) {
    const input = settings[id];
    result[id] = Number.isFinite(input) ? Math.max(min, Math.min(max, input!)) : value;
  }
  result.sliceRayAmount = Math.round(result.sliceRayAmount);
  return result;
}

export function sliceRaysSupported(settings: {
  axis: string;
  spiral?: boolean;
  sliceLfo?: boolean;
  divergence?: number;
  contourWeave?: boolean;
}): boolean {
  return (
    ['x', 'y', 'up', 'cam', 'custom', 'spherical', 'cylindrical', 'geodesic', 'curvature'].includes(
      settings.axis,
    ) &&
    !settings.spiral &&
    !settings.contourWeave
  );
}
