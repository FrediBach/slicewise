import { type ContourSettings } from './contour-engine';
import { normalizeAnimationFps } from './animation-project';

export const ANIMATION_VIDEO_MIME_TYPE = 'video/webm';

export type AnimationVideoFrame = {
  index: number;
  timeMs: number;
  timestampUs: number;
  durationUs: number;
};

export function animationVideoFrameCount(durationMs: number, fps: number): number {
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  return Math.max(1, Math.round((duration / 1000) * normalizeAnimationFps(fps)));
}

export function animationVideoFrame(
  index: number,
  frameCount: number,
  durationMs: number,
  fps: number,
): AnimationVideoFrame {
  const count = Math.max(1, Math.round(frameCount));
  const boundedIndex = Math.max(0, Math.min(count - 1, Math.round(index)));
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  const normalizedFps = normalizeAnimationFps(fps);
  return {
    index: boundedIndex,
    timeMs: count === 1 ? 0 : (boundedIndex / (count - 1)) * duration,
    timestampUs: Math.round((boundedIndex / normalizedFps) * 1_000_000),
    durationUs: Math.round((1 / normalizedFps) * 1_000_000),
  };
}

export function animationVideoFilename(name: string): string {
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-|-$/g, '') || 'contours';
  return `${base}-animation.webm`;
}

export function animationVideoBackground(
  settings: Pick<ContourSettings, 'blueprint' | 'blueprintStyle' | 'chroma' | 'backgroundColor'>,
): string {
  return settings.blueprint
    ? settings.blueprintStyle === 'black'
      ? '#101417'
      : '#0b3f7a'
    : settings.chroma
      ? '#000000'
      : settings.backgroundColor;
}

export function formatAnimationExportElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export class AnimationExportCancelledError extends Error {
  constructor() {
    super('Video export cancelled');
    this.name = 'AnimationExportCancelledError';
  }
}

export function throwIfAnimationExportCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new AnimationExportCancelledError();
}
