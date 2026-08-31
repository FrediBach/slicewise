import { describe, expect, it } from 'vitest';
import {
  averageContourSequenceSources,
  contourTrackPoint,
  measureContourSlice,
} from './contour-features';

describe('measureContourSlice', () => {
  it('measures closed projected paths deterministically', () => {
    const feature = measureContourSlice(3, 0.75, [[0, 0, 4, 0, 4, 3, 0, 3, 0, 0]]);

    expect(feature).toMatchObject({
      index: 3,
      level: 0.75,
      pathCount: 1,
      length: 14,
      area: 12,
      centroidX: 2,
      centroidY: 1.5,
      closedness: 1,
      roughness: 0.5,
    });
    expect(feature.trackPoints).toHaveLength(66);
    expect(contourTrackPoint(feature, 0)).toEqual([0, 0]);
    expect(contourTrackPoint(feature, 50)).toEqual([4, 3]);
    expect(contourTrackPoint(feature, 100)).toEqual([0, 0]);
  });

  it('uses visible path length for centroid and closedness', () => {
    const feature = measureContourSlice(0, 2, [
      [0, 0, 2, 0],
      [10, 0, 10.5, 0, 10.5, 0.5, 10, 0.5, 10, 0],
      [Number.NaN, 0],
    ]);

    expect(feature.pathCount).toBe(2);
    expect(feature.length).toBe(4);
    expect(feature.centroidX).toBe(5.625);
    expect(feature.closedness).toBe(0.5);
    expect(feature.level).toBe(1);
  });

  it('selects different stable positions along a contour route', () => {
    const feature = measureContourSlice(0, 0.5, [[0, 0, 10, 0, 10, 10]]);

    expect(contourTrackPoint(feature, 25)).toEqual([5, 0]);
    expect(contourTrackPoint(feature, 75)).toEqual([10, 5]);
  });
});

describe('averageContourSequenceSources', () => {
  it('averages corresponding morph slices and preserves sparse indexes', () => {
    const first = {
      version: 1 as const,
      slices: [measureContourSlice(0, 0.2, [[0, 0, 2, 0]])],
    };
    const second = {
      version: 1 as const,
      slices: [
        measureContourSlice(0, 0.4, [[0, 0, 4, 0]]),
        measureContourSlice(2, 1, [[0, 0, 1, 0]]),
      ],
    };

    const result = averageContourSequenceSources([first, second]);

    expect(result?.slices.map(({ index, level, length }) => ({ index, level, length }))).toEqual([
      { index: 0, level: 0.30000000000000004, length: 3 },
      { index: 2, level: 1, length: 1 },
    ]);
    expect(contourTrackPoint(result!.slices[0], 100)).toEqual([3, 0]);
  });
});
