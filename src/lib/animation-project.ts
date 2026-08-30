import { type ContourSettings } from './contour-engine';

export type AnimationValue = number | string;
export type AnimationValues = Record<string, AnimationValue>;
export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';
export type AnimationParameterKind = 'number' | 'seed' | 'color';

export interface AnimationParameterDescriptor {
  controlId: string;
  settingKey: keyof ContourSettings & string;
  kind: AnimationParameterKind;
  min?: number;
  max?: number;
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
  firstKeyframeId?: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const clone = <T>(value: T): T => globalThis.structuredClone(value);
const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

function normalizeDuration(durationMs: number): number {
  return clamp(Math.round(Number.isFinite(durationMs) ? durationMs : 5000), 100, 3_600_000);
}

function normalizeFps(fps: number): number {
  return clamp(Math.round(Number.isFinite(fps) ? fps : 30), 1, 120);
}

function normalizeValue(
  value: unknown,
  descriptor: AnimationParameterDescriptor,
): AnimationValue | undefined {
  if (descriptor.kind === 'color')
    return HEX_COLOR.test(String(value)) ? String(value).toLowerCase() : undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return clamp(numeric, descriptor.min ?? -Infinity, descriptor.max ?? Infinity);
}

export function captureAnimationValues(
  settings: ContourSettings,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationValues {
  const source = settings as unknown as Record<string, unknown>;
  const values: AnimationValues = {};
  for (const descriptor of descriptors) {
    const value = normalizeValue(source[descriptor.settingKey], descriptor);
    if (value !== undefined) values[descriptor.settingKey] = value;
  }
  return values;
}

export function createAnimationProject(
  settings: ContourSettings,
  descriptors: readonly AnimationParameterDescriptor[],
  options: CreateAnimationProjectOptions = {},
): AnimationProject {
  const baseSettings = clone(settings);
  const width = Math.max(
    2,
    Math.round((1080 * baseSettings.pw) / Math.max(baseSettings.pw, baseSettings.ph)),
  );
  const height = Math.max(
    2,
    Math.round((1080 * baseSettings.ph) / Math.max(baseSettings.pw, baseSettings.ph)),
  );
  return {
    version: 1,
    baseSettings,
    durationMs: normalizeDuration(options.durationMs ?? 5000),
    fps: normalizeFps(options.fps ?? 30),
    loopPreview: true,
    export: {
      width: width + (width % 2),
      height: height + (height % 2),
      bitrate: 8_000_000,
    },
    keyframes: [
      {
        id: options.firstKeyframeId ?? 'keyframe-0',
        timeMs: 0,
        values: captureAnimationValues(baseSettings, descriptors),
        easingToNext: 'linear',
      },
    ],
  };
}

function easedAmount(amount: number, easing: AnimationEasing): number {
  const t = clamp(amount, 0, 1);
  if (easing === 'hold') return 0;
  if (easing === 'ease-in') return t * t;
  if (easing === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
  return t;
}

function interpolateColor(from: string, to: string, amount: number): string {
  if (!HEX_COLOR.test(from) || !HEX_COLOR.test(to)) return from;
  const channels = (color: string): number[] =>
    [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const start = channels(from);
  const end = channels(to);
  return `#${start
    .map((channel, index) =>
      Math.round(channel + (end[index] - channel) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function sortedKeyframes(project: AnimationProject): AnimationKeyframe[] {
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
  const keyframes = sortedKeyframes(project);
  if (!keyframes.length) return settings;

  const time = clamp(Number.isFinite(timeMs) ? timeMs : 0, 0, project.durationMs);
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.timeMs >= time);
  const right = rightIndex < 0 ? keyframes.at(-1)! : keyframes[rightIndex];
  const left = rightIndex <= 0 ? right : keyframes[rightIndex - 1];
  const span = right.timeMs - left.timeMs;
  const amount = span <= 0 ? 0 : easedAmount((time - left.timeMs) / span, left.easingToNext);
  const dynamicSettings = settings as unknown as Record<string, unknown>;

  for (const descriptor of descriptors) {
    const base = normalizeValue(dynamicSettings[descriptor.settingKey], descriptor);
    const start = normalizeValue(left.values[descriptor.settingKey] ?? base, descriptor);
    const end = normalizeValue(right.values[descriptor.settingKey] ?? start ?? base, descriptor);
    if (start === undefined || end === undefined) continue;
    if (descriptor.kind === 'color') {
      dynamicSettings[descriptor.settingKey] = interpolateColor(String(start), String(end), amount);
      continue;
    }
    if (descriptor.kind === 'seed') {
      dynamicSettings[descriptor.settingKey] = amount < 1 ? Number(start) : Number(end);
      continue;
    }
    dynamicSettings[descriptor.settingKey] = Number(start) + (Number(end) - Number(start)) * amount;
  }
  return settings;
}

export function addAnimationKeyframe(
  project: AnimationProject,
  timeMs: number,
  id: string,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationProject {
  const time = clamp(Math.round(timeMs), 0, project.durationMs);
  if (!id || project.keyframes.some((keyframe) => keyframe.id === id)) return project;
  if (project.keyframes.some((keyframe) => keyframe.timeMs === time)) return project;
  const values = captureAnimationValues(
    evaluateAnimationSettings(project, time, descriptors),
    descriptors,
  );
  return {
    ...clone(project),
    keyframes: [
      ...clone(project.keyframes),
      { id, timeMs: time, values, easingToNext: 'linear' as const },
    ].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)),
  };
}

export function updateAnimationKeyframeValue(
  project: AnimationProject,
  id: string,
  settingKey: string,
  value: AnimationValue,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationProject {
  const descriptor = descriptors.find((candidate) => candidate.settingKey === settingKey);
  const normalized = descriptor && normalizeValue(value, descriptor);
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
  const ordered = sortedKeyframes(project);
  const keyframe = ordered.find((candidate) => candidate.id === id);
  if (!keyframe || keyframe === ordered[0]) return project;
  const time = clamp(Math.round(timeMs), 1, project.durationMs);
  if (ordered.some((candidate) => candidate.id !== id && candidate.timeMs === time)) return project;
  const next = clone(project);
  const moved = next.keyframes.find((candidate) => candidate.id === id);
  if (!moved) return project;
  moved.timeMs = time;
  next.keyframes.sort(
    (left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id),
  );
  return next;
}

export function removeAnimationKeyframe(project: AnimationProject, id: string): AnimationProject {
  const ordered = sortedKeyframes(project);
  if (ordered.length <= 1 || ordered[0].id === id) return project;
  if (!ordered.some((keyframe) => keyframe.id === id)) return project;
  return {
    ...clone(project),
    keyframes: clone(project.keyframes.filter((keyframe) => keyframe.id !== id)),
  };
}

export function updateAnimationTiming(
  project: AnimationProject,
  timing: { durationMs?: number; fps?: number },
): AnimationProject {
  const lastKeyframeTime = Math.max(0, ...project.keyframes.map((keyframe) => keyframe.timeMs));
  const durationMs = Math.max(
    lastKeyframeTime,
    normalizeDuration(timing.durationMs ?? project.durationMs),
  );
  const fps = normalizeFps(timing.fps ?? project.fps);
  if (durationMs === project.durationMs && fps === project.fps) return project;
  return { ...clone(project), durationMs, fps };
}
