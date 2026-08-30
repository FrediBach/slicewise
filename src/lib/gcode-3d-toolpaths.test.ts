import { describe, expect, it } from 'vitest';
import { createConstantContactOperations, defaultUunaExpressiveMotion } from './gcode-3d-toolpaths';

describe('3D G-code toolpaths', () => {
  it('defines a safe disabled UUNA default', () => {
    expect(defaultUunaExpressiveMotion()).toMatchObject({
      enabled: false,
      mode: 'constant',
      contactZ: -3,
      maximumPressDepth: 0,
      penAngle: 90,
      tipCompensation: true,
      surfaceCompensation: { mode: 'off' },
    });
  });

  it('creates deterministic travel, constant-contact stroke, and pen-change operations', () => {
    const operations = createConstantContactOperations(
      [
        {
          color: 'black',
          runs: [
            [
              [1, 2],
              [3, 4],
            ],
          ],
        },
        {
          color: 'red',
          runs: [
            [
              [5, 6],
              [7, 8],
            ],
          ],
        },
      ],
      0,
      -3,
    );

    expect(operations).toEqual([
      { kind: 'travel', point: { x: 1, y: 2, z: 0, pressure: 0 } },
      {
        kind: 'stroke',
        stroke: {
          sourceRun: 0,
          reversed: false,
          points: [
            { x: 1, y: 2, z: -3, pressure: 1 },
            { x: 3, y: 4, z: -3, pressure: 1 },
          ],
        },
      },
      { kind: 'pen-change', color: 'red' },
      { kind: 'travel', point: { x: 5, y: 6, z: 0, pressure: 0 } },
      {
        kind: 'stroke',
        stroke: {
          sourceRun: 1,
          reversed: false,
          points: [
            { x: 5, y: 6, z: -3, pressure: 1 },
            { x: 7, y: 8, z: -3, pressure: 1 },
          ],
        },
      },
    ]);
  });
});
