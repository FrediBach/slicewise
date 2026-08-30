import { type ContourSettings } from './contour-engine';
import {
  applyAnimationEasing,
  clampAnimationValue,
  interpolateAnimationValue,
  isAnimationEasing,
  normalizeAnimationValue,
  type AnimationEasing,
  type AnimationParameterKind,
  type AnimationValue,
} from './animation-interpolation';

export type { AnimationEasing, AnimationParameterKind, AnimationValue };
export type AnimationValues = Record<string, AnimationValue>;

export interface AnimationParameterDescriptor {
  controlId: string;
  settingKey: keyof ContourSettings & string;
  kind: AnimationParameterKind;
  min?: number;
  max?: number;
  step?: number;
}

export interface AnimationKeyframe {
  id: string;
  timeMs: number;
  values: AnimationValues;
  easingToNext: AnimationEasing;
}

export interface AnimationExportSettings {
  width: number;
  height: number;
  bitrate: number;
}

export interface AnimationProject {
  version: 1;
  baseSettings: ContourSettings;
  durationMs: number;
  fps: number;
  loopPreview: boolean;
  export: AnimationExportSettings;
  keyframes: AnimationKeyframe[];
}

export interface CreateAnimationProjectOptions {
  durationMs?: number;
  fps?: number;
  loopPreview?: boolean;
  firstKeyframeId?: string;
}

export const MIN_ANIMATION_DURATION_MS = 100;
export const MAX_ANIMATION_DURATION_MS = 3_600_000;
export const MIN_ANIMATION_FPS = 1;
export const MAX_ANIMATION_FPS = 120;

const clone = <T>(value: T): T => globalThis.structuredClone(value);

function normalizeKeyframeTime(timeMs: number, min: number, max: number): number | null {
  if (!Number.isFinite(timeMs)) return null;
  return clampAnimationValue(Math.round(timeMs), min, max);
}

export function normalizeAnimationDuration(durationMs: number): number {
  return clampAnimationValue(
    Math.round(Number.isFinite(durationMs) ? durationMs : 5000),
    MIN_ANIMATION_DURATION_MS,
    MAX_ANIMATION_DURATION_MS,
  );
}

export function normalizeAnimationFps(fps: number): number {
  return clampAnimationValue(
    Math.round(Number.isFinite(fps) ? fps : 30),
    MIN_ANIMATION_FPS,
    MAX_ANIMATION_FPS,
  );
}

function descriptorValue(
  value: unknown,
  descriptor: AnimationParameterDescriptor,
): AnimationValue | undefined {
  return normalizeAnimationValue(value, descriptor.kind, descriptor.min, descriptor.max);
}

export function captureAnimationValues(
  settings: ContourSettings,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationValues {
  const source = settings as unknown as Record<string, unknown>;
  const values: AnimationValues = {};
  for (const descriptor of descriptors) {
    const value = descriptorValue(source[descriptor.settingKey], descriptor);
    if (value !== undefined) values[descriptor.settingKey] = value;
  }
  return values;
}

export function animationExportSize(settings: ContourSettings): AnimationExportSettings {
  const longEdge = Math.max(1, settings.pw, settings.ph);
  const width = Math.max(2, Math.round((1080 * settings.pw) / longEdge));
  const height = Math.max(2, Math.round((1080 * settings.ph) / longEdge));
  return {
    width: width + (width % 2),
    height: height + (height % 2),
    bitrate: 8_000_000,
  };
}

export function createAnimationProject(
  settings: ContourSettings,
  descriptors: readonly AnimationParameterDescriptor[],
  options: CreateAnimationProjectOptions = {},
): AnimationProject {
  const baseSettings = clone(settings);
  return {
    version: 1,
    baseSettings,
    durationMs: normalizeAnimationDuration(options.durationMs ?? 5000),
    fps: normalizeAnimationFps(options.fps ?? 30),
    loopPreview: options.loopPreview ?? true,
    export: animationExportSize(baseSettings),
    keyframes: [
      {
        id: options.firstKeyframeId?.trim() || 'keyframe-0',
        timeMs: 0,
        values: captureAnimationValues(baseSettings, descriptors),
        easingToNext: 'linear',
      },
    ],
  };
}

export function sortedAnimationKeyframes(project: AnimationProject): AnimationKeyframe[] {
  return [...project.keyframes].sort(
    (left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id),
  );
}

export function evaluateAnimationSettings(
  project: AnimationProject,
  timeMs: number,
  descriptors: readonly AnimationParameterDescriptor[],
): ContourSettings {
  const settings = clone(project.baseSettings);
  settings.morphEnabled = false;
  settings.morphSecondEnabled = false;
  settings.morphTargets = {};
  settings.morphTargets2 = {};
  const keyframes = sortedAnimationKeyframes(project);
  if (!keyframes.length) return settings;

  const time = clampAnimationValue(Number.isFinite(timeMs) ? timeMs : 0, 0, project.durationMs);
  const exact = keyframes.find((keyframe) => keyframe.timeMs === time);
  const rightIndex = exact
    ? keyframes.indexOf(exact)
    : keyframes.findIndex((keyframe) => keyframe.timeMs > time);
  const right = exact ?? (rightIndex < 0 ? keyframes.at(-1)! : keyframes[rightIndex]);
  const left = exact ?? (rightIndex <= 0 ? right : keyframes[rightIndex - 1]);
  const span = right.timeMs - left.timeMs;
  const amount =
    exact || span <= 0 ? 0 : applyAnimationEasing((time - left.timeMs) / span, left.easingToNext);
  const dynamicSettings = settings as unknown as Record<string, unknown>;

  for (const descriptor of descriptors) {
    const base = descriptorValue(dynamicSettings[descriptor.settingKey], descriptor);
    const start = descriptorValue(left.values[descriptor.settingKey] ?? base, descriptor);
    const end = descriptorValue(right.values[descriptor.settingKey] ?? start ?? base, descriptor);
    if (start === undefined || end === undefined) continue;
    dynamicSettings[descriptor.settingKey] = exact
      ? start
      : interpolateAnimationValue(
          start,
          end,
          amount,
          descriptor.kind,
          descriptor.min,
          descriptor.max,
        );
  }
  return settings;
}

export function addAnimationKeyframe(
  project: AnimationProject,
  timeMs: number,
  id: string,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationProject {
  const time = normalizeKeyframeTime(timeMs, 0, project.durationMs);
  if (time === null) return project;
  if (!id.trim() || project.keyframes.some((keyframe) => keyframe.id === id)) return project;
  if (project.keyframes.some((keyframe) => keyframe.timeMs === time)) return project;
  const values = captureAnimationValues(
    evaluateAnimationSettings(project, time, descriptors),
    descriptors,
  );
  const next = clone(project);
  next.keyframes.push({ id, timeMs: time, values, easingToNext: 'linear' });
  next.keyframes.sort(
    (left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id),
  );
  return next;
}

export function duplicateAnimationKeyframe(
  project: AnimationProject,
  sourceId: string,
  timeMs: number,
  id: string,
): AnimationProject {
  const source = project.keyframes.find((keyframe) => keyframe.id === sourceId);
  const time = normalizeKeyframeTime(timeMs, 0, project.durationMs);
  if (
    !source ||
    time === null ||
    !id.trim() ||
    project.keyframes.some((keyframe) => keyframe.id === id || keyframe.timeMs === time)
  )
    return project;
  const next = clone(project);
  next.keyframes.push({ ...clone(source), id, timeMs });
  next.keyframes.sort(
    (left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id),
  );
  return next;
}

export function updateAnimationKeyframeValue(
  project: AnimationProject,
  id: string,
  settingKey: string,
  value: AnimationValue,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationProject {
  const descriptor = descriptors.find((candidate) => candidate.settingKey === settingKey);
  const normalized = descriptor && descriptorValue(value, descriptor);
  if (!descriptor || normalized === undefined) return project;
  const index = project.keyframes.findIndex((keyframe) => keyframe.id === id);
  if (index < 0 || project.keyframes[index].values[settingKey] === normalized) return project;
  const next = clone(project);
  next.keyframes[index].values[settingKey] = normalized;
  return next;
}

export function setAnimationKeyframeEasing(
  project: AnimationProject,
  id: string,
  easing: AnimationEasing,
): AnimationProject {
  if (!isAnimationEasing(easing)) return project;
  const index = project.keyframes.findIndex((keyframe) => keyframe.id === id);
  if (index < 0 || project.keyframes[index].easingToNext === easing) return project;
  const next = clone(project);
  next.keyframes[index].easingToNext = easing;
  return next;
}

export function moveAnimationKeyframe(
  project: AnimationProject,
  id: string,
  timeMs: number,
): AnimationProject {
  const keyframe = project.keyframes.find((candidate) => candidate.id === id);
  if (!keyframe || keyframe.timeMs === 0) return project;
  const time = normalizeKeyframeTime(timeMs, 1, project.durationMs);
  if (time === null) return project;
  if (time === keyframe.timeMs) return project;
  if (project.keyframes.some((candidate) => candidate.id !== id && candidate.timeMs === time))
    return project;
  const next = clone(project);
  const moved = next.keyframes.find((candidate) => candidate.id === id)!;
  moved.timeMs = time;
  next.keyframes.sort(
    (left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id),
  );
  return next;
}

export function removeAnimationKeyframe(project: AnimationProject, id: string): AnimationProject {
  const keyframe = project.keyframes.find((candidate) => candidate.id === id);
  if (!keyframe || keyframe.timeMs === 0 || project.keyframes.length <= 1) return project;
  const next = clone(project);
  next.keyframes = next.keyframes.filter((candidate) => candidate.id !== id);
  return next;
}

export function updateAnimationTiming(
  project: AnimationProject,
  timing: { durationMs?: number; fps?: number },
): AnimationProject {
  const lastKeyframeTime = Math.max(0, ...project.keyframes.map((keyframe) => keyframe.timeMs));
  const durationMs = Math.max(
    lastKeyframeTime,
    normalizeAnimationDuration(timing.durationMs ?? project.durationMs),
  );
  const fps = normalizeAnimationFps(timing.fps ?? project.fps);
  if (durationMs === project.durationMs && fps === project.fps) return project;
  return { ...clone(project), durationMs, fps };
}

export function setAnimationLoopPreview(
  project: AnimationProject,
  loopPreview: boolean,
): AnimationProject {
  if (project.loopPreview === loopPreview) return project;
  return { ...clone(project), loopPreview };
}

export function updateAnimationExportSettings(
  project: AnimationProject,
  settings: Partial<AnimationExportSettings>,
): AnimationProject {
  const evenDimension = (value: number, fallback: number): number => {
    const normalized = Math.max(2, Math.round(Number.isFinite(value) ? value : fallback));
    return normalized + (normalized % 2);
  };
  const nextExport = {
    width: evenDimension(settings.width ?? project.export.width, project.export.width),
    height: evenDimension(settings.height ?? project.export.height, project.export.height),
    bitrate: Math.max(
      1,
      Math.round(Number.isFinite(settings.bitrate) ? settings.bitrate! : project.export.bitrate),
    ),
  };
  if (
    nextExport.width === project.export.width &&
    nextExport.height === project.export.height &&
    nextExport.bitrate === project.export.bitrate
  )
    return project;
  return { ...clone(project), export: nextExport };
}
