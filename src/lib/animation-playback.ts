import { clampAnimationValue } from './animation-interpolation';
import { normalizeAnimationFps } from './animation-project';

export type AnimationPlaybackPosition = {
  timeMs: number;
  completed: boolean;
};

/** Resolves a playhead from monotonic elapsed time without depending on rendered frames. */
export function animationPlaybackPosition(
  originMs: number,
  elapsedMs: number,
  durationMs: number,
  loop: boolean,
): AnimationPlaybackPosition {
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  if (duration === 0) return { timeMs: 0, completed: true };

  const origin = clampAnimationValue(Number.isFinite(originMs) ? originMs : 0, 0, duration);
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const rawTime = origin + elapsed;
  if (rawTime < duration) return { timeMs: rawTime, completed: false };
  if (loop) return { timeMs: rawTime % duration, completed: false };
  return { timeMs: duration, completed: true };
}

export function animationPreviewIntervalMs(fps: number): number {
  return 1000 / normalizeAnimationFps(fps);
}

/**
 * Advances a preview deadline past `now` without accumulating callback drift.
 * Skipped deadlines are intentionally dropped rather than replayed.
 */
export function nextAnimationPreviewDeadline(
  previousDeadlineMs: number,
  nowMs: number,
  fps: number,
): number {
  const interval = animationPreviewIntervalMs(fps);
  if (!Number.isFinite(previousDeadlineMs)) return nowMs + interval;
  if (nowMs < previousDeadlineMs) return previousDeadlineMs;
  return previousDeadlineMs + (Math.floor((nowMs - previousDeadlineMs) / interval) + 1) * interval;
}

export function stepAnimationPlayhead(
  playheadMs: number,
  frames: number,
  fps: number,
  durationMs: number,
): number {
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  const current = clampAnimationValue(Number.isFinite(playheadMs) ? playheadMs : 0, 0, duration);
  const count = Number.isFinite(frames) ? frames : 0;
  return clampAnimationValue(current + count * animationPreviewIntervalMs(fps), 0, duration);
}
