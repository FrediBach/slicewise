import { isAnimationEasing, normalizeAnimationValue } from './animation-interpolation';
import {
  MAX_ANIMATION_DURATION_MS,
  MAX_ANIMATION_FPS,
  MIN_ANIMATION_DURATION_MS,
  MIN_ANIMATION_FPS,
  type AnimationParameterDescriptor,
  type AnimationProject,
} from './animation-project';

export interface AnimationValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

/** Validates the persisted project envelope and every registered keyframe value. */
export function validateAnimationProject(
  value: unknown,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['Project must be an object.'] };

  if (value.version !== 1) errors.push('Project version must be 1.');
  if (!isRecord(value.baseSettings)) errors.push('Base settings must be an object.');
  if (!isIntegerInRange(value.durationMs, MIN_ANIMATION_DURATION_MS, MAX_ANIMATION_DURATION_MS))
    errors.push('Duration is outside the supported range.');
  if (!isIntegerInRange(value.fps, MIN_ANIMATION_FPS, MAX_ANIMATION_FPS))
    errors.push('FPS is outside the supported range.');
  if (typeof value.loopPreview !== 'boolean') errors.push('Loop preview must be boolean.');

  if (!isRecord(value.export)) errors.push('Export settings must be an object.');
  else {
    for (const dimension of ['width', 'height'] as const)
      if (
        !Number.isInteger(value.export[dimension]) ||
        Number(value.export[dimension]) < 2 ||
        Number(value.export[dimension]) % 2 !== 0
      )
        errors.push(`Export ${dimension} must be a positive even integer.`);
    if (!Number.isInteger(value.export.bitrate) || Number(value.export.bitrate) < 1)
      errors.push('Export bitrate must be a positive integer.');
  }

  if (!Array.isArray(value.keyframes) || value.keyframes.length === 0) {
    errors.push('At least one keyframe is required.');
    return { valid: false, errors };
  }

  const ids = new Set<string>();
  const times = new Set<number>();
  let hasTimeZero = false;
  let previousTime = -1;
  for (const [index, candidate] of value.keyframes.entries()) {
    const prefix = `Keyframe ${index}`;
    if (!isRecord(candidate)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    if (typeof candidate.id !== 'string' || !candidate.id.trim())
      errors.push(`${prefix} must have an id.`);
    else if (ids.has(candidate.id)) errors.push(`${prefix} has a duplicate id.`);
    else ids.add(candidate.id);

    const timeMs = candidate.timeMs;
    if (
      !Number.isInteger(timeMs) ||
      Number(timeMs) < 0 ||
      Number(timeMs) > Number(value.durationMs)
    )
      errors.push(`${prefix} time is outside the project duration.`);
    else {
      if (times.has(Number(timeMs))) errors.push(`${prefix} has a duplicate time.`);
      times.add(Number(timeMs));
      if (timeMs === 0) hasTimeZero = true;
      if (Number(timeMs) < previousTime) errors.push('Keyframes must be sorted by time.');
      previousTime = Number(timeMs);
    }

    if (!isAnimationEasing(candidate.easingToNext))
      errors.push(`${prefix} has an unsupported easing.`);
    if (!isRecord(candidate.values)) {
      errors.push(`${prefix} values must be an object.`);
      continue;
    }
    for (const descriptor of descriptors) {
      const settingValue = candidate.values[descriptor.settingKey];
      const normalized = normalizeAnimationValue(
        settingValue,
        descriptor.kind,
        descriptor.min,
        descriptor.max,
      );
      if (normalized === undefined || normalized !== settingValue)
        errors.push(`${prefix} has an invalid ${descriptor.settingKey} value.`);
    }
  }
  if (!hasTimeZero) errors.push('A protected time-zero keyframe is required.');
  return { valid: errors.length === 0, errors };
}

export function isAnimationProject(
  value: unknown,
  descriptors: readonly AnimationParameterDescriptor[],
): value is AnimationProject {
  return validateAnimationProject(value, descriptors).valid;
}
