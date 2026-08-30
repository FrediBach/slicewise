import { describe, expect, it } from 'vitest';
import {
  compensateAngledTip,
  createConstantContactOperations,
  createExpressiveOperations,
  defaultUunaExpressiveMotion,
} from './gcode-3d-toolpaths';

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
            { x: 1, y: 2, z: -3, pressure: 0 },
            { x: 3, y: 4, z: -3, pressure: 0 },
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
            { x: 5, y: 6, z: -3, pressure: 0 },
            { x: 7, y: 8, z: -3, pressure: 0 },
          ],
        },
      },
    ]);
  });

  it('resamples tapered strokes and eases from contact to pressure and back', () => {
    const settings = {
      ...defaultUunaExpressiveMotion(),
      enabled: true,
      mode: 'tapered' as const,
      maximumPressDepth: 2,
      leadIn: 2,
      leadOut: 2,
    };
    const operations = createExpressiveOperations(
      [
        {
          color: 'black',
          runs: [
            [
              [0, 0],
              [10, 0],
            ],
          ],
        },
      ],
      0,
      settings,
    );
    const stroke = operations.find((operation) => operation.kind === 'stroke');
    expect(stroke?.kind).toBe('stroke');
    if (!stroke || stroke.kind !== 'stroke') return;

    expect(stroke.stroke.points).toHaveLength(11);
    expect(stroke.stroke.points[0]).toMatchObject({ x: 0, y: 0, z: -3, pressure: 0 });
    expect(stroke.stroke.points[2]).toMatchObject({ x: 2, y: 0, z: -5, pressure: 1 });
    expect(stroke.stroke.points.at(-1)).toMatchObject({ x: 10, y: 0, z: -3, pressure: 0 });
    for (let index = 1; index < stroke.stroke.points.length; index += 1)
      expect(
        Math.hypot(
          stroke.stroke.points[index].x - stroke.stroke.points[index - 1].x,
          stroke.stroke.points[index].y - stroke.stroke.points[index - 1].y,
        ),
      ).toBeLessThanOrEqual(1.000001);
  });

  it('compensates pressure displacement along the fixed physical tilt direction', () => {
    expect(compensateAngledTip(10, 20, -5, -3, 45, 0, true)).toEqual([8, 20]);
    expect(compensateAngledTip(10, 20, -5, -3, 45, 90, true)[1]).toBeCloseTo(18);
    expect(compensateAngledTip(10, 20, -5, -3, 90, 0, true)).toEqual([10, 20]);
    expect(compensateAngledTip(10, 20, -5, -3, 30, 0, false)).toEqual([10, 20]);
  });
});
