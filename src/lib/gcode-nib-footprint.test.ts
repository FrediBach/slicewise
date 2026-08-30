import { describe, expect, it } from 'vitest';
import { analyzeBroadNibSpacing } from './gcode-nib-footprint';

describe('broad-nib spacing analysis', () => {
  it('reports distinct final runs that may merge at the configured width', () => {
    const analysis = analyzeBroadNibSpacing(
      [
        {
          color: 'black',
          label: 'lines',
          runs: [
            [0, 0, 10, 0],
            [0, 0.7, 10, 0.7],
          ],
        },
      ],
      1,
    );

    expect(analysis.nearbyRunPairs).toBe(1);
    expect(analysis.minimumSampledSpacing).toBeCloseTo(0.7);
  });

  it('stays disabled at zero width and ignores spacing within one run', () => {
    const groups = [{ color: 'black', label: 'line', runs: [[0, 0, 1, 0, 1, 0.1]] }];
    expect(analyzeBroadNibSpacing(groups, 0).nearbyRunPairs).toBe(0);
    expect(analyzeBroadNibSpacing(groups, 1).nearbyRunPairs).toBe(0);
  });
});
