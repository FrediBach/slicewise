import { describe, expect, it } from 'vitest';
import { AnimationFrameCache, planAnimationPreview } from './animation-frame-cache';

function cacheForLoop(bytes = 100, frames = 10) {
  const cache = new AnimationFrameCache<string>(bytes, frames);
  cache.configure({}, 1, 1000, 10);
  return cache;
}

describe('animation frame scheduling', () => {
  it('lets slow frames finish instead of superseding them on every playback tick', () => {
    const cache = cacheForLoop();
    expect(planAnimationPreview(cache, 0, false, true).renderFrame).toBe(0);
    for (const time of [100, 200, 300, 400])
      expect(planAnimationPreview(cache, time, true, true).renderFrame).toBeUndefined();
    cache.put(0, 'completed slow frame', 10);
    expect(planAnimationPreview(cache, 400, false, true).renderFrame).toBe(4);
    expect(planAnimationPreview(cache, 0, true, true).cached).toBe('completed slow frame');
  });

  it('reuses stable FPS slots and fills missing upcoming frames only when idle', () => {
    const cache = cacheForLoop();
    cache.put(2, 'frame 2', 10);
    cache.put(3, 'frame 3', 10);
    expect(planAnimationPreview(cache, 249, false, true)).toEqual({
      cached: 'frame 2',
      renderFrame: 4,
      prefetch: true,
    });
    expect(planAnimationPreview(cache, 249, true, true).renderFrame).toBeUndefined();
    expect(cache.nextMissing(9, false)).toBeUndefined();
    expect(cache.nextMissing(9, true)).toBe(0);
  });

  it('stops prefetching a fully cached loop', () => {
    const cache = cacheForLoop();
    for (let frame = 0; frame < 10; frame++) cache.put(frame, String(frame), 10);
    expect(planAnimationPreview(cache, 500, false, true).renderFrame).toBeUndefined();
  });
});

describe('bounded animation frame cache', () => {
  it('halves sampling density under memory pressure while retaining loop coverage', () => {
    const cache = cacheForLoop(30);
    for (let frame = 0; frame < 6; frame++) cache.put(frame, String(frame), 10);
    expect(cache.stride).toBe(2);
    expect(cache.bytes).toBe(30);
    expect(cache.size).toBe(3);
    expect([0, 2, 4].map((frame) => cache.get(frame))).toEqual(['0', '2', '4']);
    expect(cache.frameAt(399)).toBe(2);
    expect(cache.timeAt(2)).toBe(200);
  });

  it('bounds both frame count and variable-size data over repeated loops', () => {
    const cache = cacheForLoop(25, 2);
    for (let loop = 0; loop < 4; loop++) {
      for (let time = 0; time < 1000; time += 100) {
        const frame = cache.frameAt(time);
        cache.put(frame, String(frame), frame === 0 ? 15 : 10);
        expect(cache.bytes).toBeLessThanOrEqual(25);
        expect(cache.size).toBeLessThanOrEqual(2);
      }
    }
    expect(cache.get(0)).toBe('0');
    expect(cache.stride).toBeGreaterThan(1);
  });

  it('rejects oversized frames without evicting useful entries', () => {
    const cache = cacheForLoop(20);
    cache.put(0, 'small', 10);
    cache.put(1, 'huge', 21);
    cache.put(2, 'invalid', Number.NaN);
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(10);
  });

  it('invalidates edits, timing changes, and mesh replacement; rejects late responses', () => {
    const cache = cacheForLoop();
    const project = {};
    cache.configure(project, 1, 1000, 10);
    cache.put(0, 'original', 10);
    const generation = cache.generation;
    cache.configure(project, 1, 1000, 10);
    expect(cache.get(0)).toBe('original');
    cache.configure({}, 1, 1000, 10);
    cache.put(0, 'stale', 10, generation);
    expect(cache.size).toBe(0);
    cache.configure(project, 2, 1000, 10);
    cache.put(0, 'new mesh', 10);
    cache.configure(project, 2, 1000, 20);
    expect(cache.size).toBe(0);
    cache.put(0, 'new timing', 10);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
    expect(cache.stride).toBe(1);
  });
});
