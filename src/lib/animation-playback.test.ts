import { describe, expect, it } from 'vitest';
import {
  animationPlaybackPosition,
  animationPreviewIntervalMs,
  nextAnimationPreviewDeadline,
  stepAnimationPlayhead,
} from './animation-playback';

describe('animation playback timing', () => {
  it('keeps the playhead tied to monotonic elapsed time', () => {
    expect(animationPlaybackPosition(1200, 875, 5000, false)).toEqual({
      timeMs: 2075,
      completed: false,
    });
    expect(animationPlaybackPosition(1200, 9000, 5000, false)).toEqual({
      timeMs: 5000,
      completed: true,
    });
  });

  it('wraps loops without losing overshoot or accumulating clock drift', () => {
    expect(animationPlaybackPosition(4500, 1750, 5000, true)).toEqual({
      timeMs: 1250,
      completed: false,
    });
    expect(animationPlaybackPosition(4500, 11_750, 5000, true).timeMs).toBe(1250);
  });

  it('paces preview requests at the project FPS and drops missed deadlines', () => {
    expect(animationPreviewIntervalMs(25)).toBe(40);
    expect(nextAnimationPreviewDeadline(Number.NaN, 100, 25)).toBe(140);
    expect(nextAnimationPreviewDeadline(140, 139, 25)).toBe(140);
    expect(nextAnimationPreviewDeadline(140, 265, 25)).toBe(300);
  });

  it('steps by timeline frames and clamps to the project bounds', () => {
    expect(stepAnimationPlayhead(1000, 1, 25, 5000)).toBe(1040);
    expect(stepAnimationPlayhead(1000, -30, 25, 5000)).toBe(0);
    expect(stepAnimationPlayhead(4900, 10, 25, 5000)).toBe(5000);
  });
});
