import { isAnimationEasing, normalizeAnimationValue } from './animation-interpolation';
import {
  animationExportSize,
  captureAnimationValues,
  createAnimationProject,
  MAX_ANIMATION_DURATION_MS,
  normalizeAnimationDuration,
  normalizeAnimationFps,
  setAnimationLoopPreview,
  updateAnimationExportSettings,
  type AnimationKeyframe,
  type AnimationParameterDescriptor,
  type AnimationProject,
  type AnimationValues,
} from './animation-project';
import { type ContourSettings } from './contour-engine';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueId(preferred: unknown, usedIds: Set<string>, index: number): string {
  const base =
    typeof preferred === 'string' && preferred.trim() ? preferred.trim() : `keyframe-${index}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
}

/**
 * Migrates incomplete version-one data into a valid, detached current project.
 * Unsupported future versions deliberately fall back to a fresh project.
 */
export function migrateAnimationProject(
  value: unknown,
  fallbackBaseSettings: ContourSettings,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationProject {
  if (!isRecord(value) || (value.version !== undefined && value.version !== 1))
    return createAnimationProject(fallbackBaseSettings, descriptors);

  const baseSettings = structuredClone({
    ...fallbackBaseSettings,
    ...(isRecord(value.baseSettings) ? value.baseSettings : {}),
  }) as ContourSettings;
  const rawKeyframes = Array.isArray(value.keyframes) ? value.keyframes : [];
  let finalRawKeyframeTime = 0;
  for (const candidate of rawKeyframes) {
    if (!isRecord(candidate)) continue;
    const time = Number(candidate.timeMs);
    if (Number.isFinite(time))
      finalRawKeyframeTime = Math.max(
        finalRawKeyframeTime,
        Math.min(MAX_ANIMATION_DURATION_MS, Math.max(0, Math.round(time))),
      );
  }
  const durationMs = Math.max(
    normalizeAnimationDuration(Number(value.durationMs)),
    finalRawKeyframeTime,
  );
  const usedIds = new Set<string>();
  const usedTimes = new Set<number>();
  const baseValues = captureAnimationValues(baseSettings, descriptors);
  const keyframes: AnimationKeyframe[] = [];

  for (const [index, candidate] of rawKeyframes.entries()) {
    if (!isRecord(candidate)) continue;
    const timeMs = Math.max(0, Math.min(durationMs, Math.round(Number(candidate.timeMs))));
    if (!Number.isFinite(timeMs) || usedTimes.has(timeMs)) continue;
    usedTimes.add(timeMs);
    const sourceValues = isRecord(candidate.values) ? candidate.values : {};
    const values: AnimationValues = {};
    for (const descriptor of descriptors) {
      const normalized = normalizeAnimationValue(
        sourceValues[descriptor.settingKey] ?? baseValues[descriptor.settingKey],
        descriptor.kind,
        descriptor.min,
        descriptor.max,
      );
      if (normalized !== undefined) values[descriptor.settingKey] = normalized;
    }
    keyframes.push({
      id: uniqueId(candidate.id, usedIds, index),
      timeMs,
      values,
      easingToNext: isAnimationEasing(candidate.easingToNext) ? candidate.easingToNext : 'linear',
    });
  }

  if (!usedTimes.has(0))
    keyframes.push({
      id: uniqueId('keyframe-0', usedIds, 0),
      timeMs: 0,
      values: baseValues,
      easingToNext: 'linear',
    });
  keyframes.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));

  const defaults = animationExportSize(baseSettings);
  const rawExport = isRecord(value.export) ? value.export : {};
  const project: AnimationProject = {
    version: 1,
    baseSettings,
    durationMs,
    fps: normalizeAnimationFps(Number(value.fps)),
    loopPreview: true,
    export: defaults,
    keyframes,
  };
  const loopProject = setAnimationLoopPreview(project, value.loopPreview === true);
  return updateAnimationExportSettings(loopProject, {
    width: Number(rawExport.width),
    height: Number(rawExport.height),
    bitrate: Number(rawExport.bitrate),
  });
}
