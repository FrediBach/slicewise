import { describe, expect, it } from 'vitest';
import { clipRunToRect, clipToolpathGroups, optimizeRuns } from './toolpaths';

describe('toolpath clipping', () => {
  it('splits and clips a polyline at the artboard edges', () => {
    expect(clipRunToRect([-5, 5, 5, 5, 15, 5, 5, 5, 5, 15], 10, 10)).toEqual([
      [0, 5, 5, 5, 10, 5, 5, 5, 5, 10],
    ]);
  });

  it('removes groups that are wholly outside', () => {
    expect(clipToolpathGroups([{ color: 'black', runs: [[-5, -5, -1, -1]] }], 10, 10)).toEqual([]);
  });
});

describe('toolpath optimization', () => {
  it('merges nearby endpoints and preserves every drawn span', () => {
    const result = optimizeRuns(
      [
        [0, 0, 5, 0],
        [5.05, 0, 10, 0],
      ],
      [0, 0],
      0.1,
    );

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toEqual([0, 0, 5, 0, 5.05, 0, 10, 0]);
  });

  it('uses reversible 2-opt improvements after greedy ordering', () => {
    const runs = [
      [6, 7, 6, 8],
      [7, 3, 7, 4],
      [1, 8, 2, 8],
      [9, 9, 9, 8],
    ];
    const result = optimizeRuns(runs, [0, 0], 0);
    expect(result.runs).toHaveLength(4);
    expect(result.penUpDistance).toBeLessThan(21);
  });

  it('orders runs without reversing them when stroke direction is preserved', () => {
    const first = [10, 0, 1, 0];
    const second = [20, 0, 21, 0];
    const result = optimizeRuns([first, second], [0, 0], 0, true);

    expect(result.runs).toEqual([first, second]);
  });
});
