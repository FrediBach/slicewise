import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import {
  AnimationExportCancelledError,
  animationVideoBackground,
  animationVideoFilename,
  animationVideoFrame,
  animationVideoFrameCount,
  formatAnimationExportElapsed,
  throwIfAnimationExportCancelled,
} from './animation-video-export';

describe('animation video frame schedule', () => {
  it('uses deterministic frame counts and includes both timeline endpoints', () => {
    const count = animationVideoFrameCount(5000, 30);
    expect(count).toBe(150);
    expect(animationVideoFrame(0, count, 5000, 30)).toEqual({
      index: 0,
      timeMs: 0,
      timestampUs: 0,
      durationUs: 33333,
    });
    expect(animationVideoFrame(count - 1, count, 5000, 30)).toMatchObject({
      index: 149,
      timeMs: 5000,
      timestampUs: 4_966_667,
    });
  });

  it('handles a one-frame animation without dividing by zero', () => {
    expect(animationVideoFrameCount(100, 1)).toBe(1);
    expect(animationVideoFrame(0, 1, 100, 1).timeMs).toBe(0);
  });
});

describe('animation video export metadata', () => {
  it('creates safe WebM filenames', () => {
    expect(animationVideoFilename('My odd model.v2.obj')).toBe('My-odd-model-v2-animation.webm');
    expect(animationVideoFilename(' ... ')).toBe('contours-animation.webm');
  });

  it('resolves the same opaque document backgrounds as the preview', () => {
    expect(animationVideoBackground(contourSettings)).toBe(contourSettings.backgroundColor);
    expect(animationVideoBackground({ ...contourSettings, chroma: true })).toBe('#000000');
    expect(
      animationVideoBackground({ ...contourSettings, blueprint: true, blueprintStyle: 'blue' }),
    ).toBe('#0b3f7a');
    expect(
      animationVideoBackground({ ...contourSettings, blueprint: true, blueprintStyle: 'black' }),
    ).toBe('#101417');
  });

  it('formats elapsed time and exposes a distinct cancellation error', () => {
    expect(formatAnimationExportElapsed(65_900)).toBe('1:05');
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAnimationExportCancelled(controller.signal)).toThrow(
      AnimationExportCancelledError,
    );
  });
});
