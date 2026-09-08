export const OBJECT_CONTROLS = [
  {
    id: 'objectScaleX',
    label: 'Stretch X',
    group: 'objectStretch',
    min: 20,
    max: 300,
    value: 100,
    unit: '%',
  },
  {
    id: 'objectScaleY',
    label: 'Stretch Y',
    group: 'objectStretch',
    min: 20,
    max: 300,
    value: 100,
    unit: '%',
  },
  {
    id: 'objectScaleZ',
    label: 'Stretch Z',
    group: 'objectStretch',
    min: 20,
    max: 300,
    value: 100,
    unit: '%',
  },
  {
    id: 'objectTaperAmount',
    label: 'Taper amount',
    group: 'objectTaper',
    min: -80,
    max: 80,
    value: 0,
    unit: '%',
  },
  {
    id: 'objectBulgeAmount',
    label: 'Bulge / pinch amount',
    group: 'objectBulge',
    min: -80,
    max: 150,
    value: 0,
    unit: '%',
  },
  {
    id: 'objectBulgeCenter',
    label: 'Bulge centre',
    group: 'objectBulge',
    min: 0,
    max: 100,
    value: 50,
    unit: '%',
  },
  {
    id: 'objectBulgeWidth',
    label: 'Bulge width',
    group: 'objectBulge',
    min: 20,
    max: 200,
    value: 100,
    unit: '%',
  },
  {
    id: 'objectShearAmount',
    label: 'Shear amount',
    group: 'objectShear',
    min: -150,
    max: 150,
    value: 0,
    unit: '%',
  },
  {
    id: 'objectShearDirection',
    label: 'Shear direction',
    group: 'objectShear',
    min: -180,
    max: 180,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectTwistAngle',
    label: 'Twist angle',
    group: 'objectTwist',
    min: -360,
    max: 360,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectBendAngle',
    label: 'Bend angle',
    group: 'objectBend',
    min: -180,
    max: 180,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectBendDirection',
    label: 'Bend direction',
    group: 'objectBend',
    min: -180,
    max: 180,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectRotationX',
    label: 'Object rotation X',
    group: 'objectRotation',
    min: -180,
    max: 180,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectRotationY',
    label: 'Object rotation Y',
    group: 'objectRotation',
    min: -180,
    max: 180,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectRotationZ',
    label: 'Object rotation Z',
    group: 'objectRotation',
    min: -180,
    max: 180,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectRippleAmount',
    label: 'Ripple amount',
    group: 'objectRipple',
    min: -20,
    max: 20,
    value: 0,
    unit: '%',
  },
  {
    id: 'objectRippleWavelength',
    label: 'Ripple wavelength',
    group: 'objectRipple',
    min: 25,
    max: 200,
    value: 100,
    unit: '%',
  },
  {
    id: 'objectRippleDirection',
    label: 'Ripple direction',
    group: 'objectRipple',
    min: -180,
    max: 180,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectRipplePhase',
    label: 'Ripple phase',
    group: 'objectRipple',
    min: -180,
    max: 180,
    value: 0,
    unit: '°',
  },
  {
    id: 'objectNoiseAmount',
    label: 'Organic amount',
    group: 'objectNoise',
    min: 0,
    max: 20,
    value: 0,
    unit: '%',
  },
  {
    id: 'objectNoiseSize',
    label: 'Organic feature size',
    group: 'objectNoise',
    min: 25,
    max: 200,
    value: 100,
    unit: '%',
  },
  {
    id: 'objectNoiseSeed',
    label: 'Organic seed',
    group: 'objectNoise',
    min: 0,
    max: 9999,
    value: 1,
    unit: '',
  },
] as const;

export const OBJECT_GROUPS = [
  { id: 'objectRotation', label: 'Object rotation', axis: false },
  { id: 'objectStretch', label: 'Stretch / squash', axis: false },
  { id: 'objectTaper', label: 'Taper', axis: 'objectTaperAxis' },
  { id: 'objectBulge', label: 'Bulge / pinch', axis: 'objectBulgeAxis' },
  { id: 'objectShear', label: 'Shear', axis: 'objectShearAxis' },
  { id: 'objectTwist', label: 'Twist', axis: 'objectTwistAxis' },
  { id: 'objectBend', label: 'Bend', axis: 'objectBendAxis' },
  { id: 'objectRipple', label: 'Ripple', axis: 'objectRippleAxis' },
  { id: 'objectNoise', label: 'Organic displacement', axis: false },
] as const;
export const OBJECT_AXES = OBJECT_GROUPS.flatMap(({ axis }) => (axis ? [axis] : []));
export const OBJECT_DESCRIPTION =
  'Rotate → stretch → taper → bulge/pinch → shear → twist → bend → ripple → organic displacement. Rotate the source into the fixed X/Y/Z deformation axes before reshaping it.';
export type ObjectAxis = 'x' | 'y' | 'z';
type ObjectNumbers = { [K in (typeof OBJECT_CONTROLS)[number]['id']]: number };
type ObjectToggles = { [K in (typeof OBJECT_GROUPS)[number]['id']]: boolean };
type ObjectAxes = { [K in (typeof OBJECT_AXES)[number]]: ObjectAxis };
export interface ObjectSettings extends ObjectNumbers, ObjectToggles, ObjectAxes {
  objectEnabled: boolean;
}

export const OBJECT_DEFAULTS: ObjectSettings = {
  objectEnabled: false,
  objectRipple: true,
  objectNoise: true,
  objectRippleAxis: 'z',
  objectRippleAmount: 0,
  objectRippleWavelength: 100,
  objectRippleDirection: 0,
  objectRipplePhase: 0,
  objectNoiseAmount: 0,
  objectNoiseSize: 100,
  objectNoiseSeed: 1,
  objectStretch: true,
  objectTaper: true,
  objectBulge: true,
  objectShear: true,
  objectTwist: true,
  objectBend: true,
  objectRotation: true,
  objectScaleX: 100,
  objectScaleY: 100,
  objectScaleZ: 100,
  objectTaperAxis: 'z',
  objectTaperAmount: 0,
  objectBulgeAxis: 'z',
  objectBulgeAmount: 0,
  objectBulgeCenter: 50,
  objectBulgeWidth: 100,
  objectShearAxis: 'z',
  objectShearAmount: 0,
  objectShearDirection: 0,
  objectTwistAxis: 'z',
  objectTwistAngle: 0,
  objectBendAxis: 'z',
  objectBendAngle: 0,
  objectBendDirection: 0,
  objectRotationX: 0,
  objectRotationY: 0,
  objectRotationZ: 0,
};

export function resolveObjectSettings(settings: Partial<ObjectSettings>): ObjectSettings {
  const result = { ...OBJECT_DEFAULTS, objectEnabled: settings.objectEnabled === true };
  for (const { id } of OBJECT_GROUPS) result[id] = settings[id] !== false;
  for (const id of OBJECT_AXES)
    result[id] = settings[id] === 'x' || settings[id] === 'y' ? settings[id] : 'z';
  for (const { id, min, max, value } of OBJECT_CONTROLS)
    result[id] = Number.isFinite(settings[id])
      ? Math.max(min, Math.min(max, settings[id]!))
      : value;
  result.objectNoiseSeed = Math.round(result.objectNoiseSeed);
  return result;
}

export function objectHasTransform(settings: Partial<ObjectSettings>): boolean {
  const s = resolveObjectSettings(settings);
  return (
    s.objectEnabled &&
    ((s.objectStretch && [s.objectScaleX, s.objectScaleY, s.objectScaleZ].some((v) => v !== 100)) ||
      (s.objectRipple && s.objectRippleAmount !== 0) ||
      (s.objectNoise && s.objectNoiseAmount !== 0) ||
      (s.objectTaper && s.objectTaperAmount !== 0) ||
      (s.objectBulge && s.objectBulgeAmount !== 0) ||
      (s.objectShear && s.objectShearAmount !== 0) ||
      (s.objectTwist && s.objectTwistAngle !== 0) ||
      (s.objectBend && s.objectBendAngle !== 0) ||
      (s.objectRotation &&
        [s.objectRotationX, s.objectRotationY, s.objectRotationZ].some((v) => v !== 0)))
  );
}
