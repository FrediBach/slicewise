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
] as const;

export const OBJECT_GROUPS = [
  { id: 'objectStretch', label: 'Stretch / squash' },
  { id: 'objectTaper', label: 'Taper' },
  { id: 'objectTwist', label: 'Twist' },
  { id: 'objectBend', label: 'Bend' },
  { id: 'objectRotation', label: 'Object rotation' },
] as const;
export const OBJECT_AXES = ['objectTaperAxis', 'objectTwistAxis', 'objectBendAxis'] as const;
export type ObjectAxis = 'x' | 'y' | 'z';
type ObjectNumbers = { [K in (typeof OBJECT_CONTROLS)[number]['id']]: number };
type ObjectToggles = { [K in (typeof OBJECT_GROUPS)[number]['id']]: boolean };
type ObjectAxes = { [K in (typeof OBJECT_AXES)[number]]: ObjectAxis };
export interface ObjectSettings extends ObjectNumbers, ObjectToggles, ObjectAxes {
  objectEnabled: boolean;
}

export const OBJECT_DEFAULTS: ObjectSettings = {
  objectEnabled: false,
  objectStretch: true,
  objectTaper: true,
  objectTwist: true,
  objectBend: true,
  objectRotation: true,
  objectScaleX: 100,
  objectScaleY: 100,
  objectScaleZ: 100,
  objectTaperAxis: 'z',
  objectTaperAmount: 0,
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
  return result;
}

export function objectHasTransform(settings: Partial<ObjectSettings>): boolean {
  const s = resolveObjectSettings(settings);
  return (
    s.objectEnabled &&
    OBJECT_CONTROLS.some(
      ({ id, group, value }) => id !== 'objectBendDirection' && s[group] && s[id] !== value,
    )
  );
}
