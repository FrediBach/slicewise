import { describe, expect, it } from 'vitest';
import { defaultUunaExpressiveMotion } from './gcode-3d-toolpaths';
import {
  createSurfacePlaneCalibrationOperations,
  createUunaCalibrationOperations,
  UUNA_CALIBRATION_SHEET,
} from './gcode-calibration';

describe('UUNA 3-axis calibration', () => {
  it('creates the documented compact ladder, crosses, and taper fan deterministically', () => {
    const settings = {
      ...defaultUunaExpressiveMotion(),
      enabled: true,
      mode: 'tapered' as const,
      maximumPressDepth: 1,
    };
    const operations = createUunaCalibrationOperations(0, settings);
    const strokes = operations.filter((operation) => operation.kind === 'stroke');

    expect(UUNA_CALIBRATION_SHEET).toEqual({ width: 120, height: 90 });
    expect(strokes).toHaveLength(20);
    expect(operations.filter((operation) => operation.kind === 'travel')).toHaveLength(20);
    expect(
      strokes.some(
        (operation) =>
          operation.kind === 'stroke' &&
          operation.stroke.points.some(({ pressure }) => pressure === 1),
      ),
    ).toBe(true);
    expect(operations).toEqual(createUunaCalibrationOperations(0, settings));
  });

  it('creates three uncompensated full-bed contact crosses', () => {
    const settings = {
      ...defaultUunaExpressiveMotion(),
      surfaceCompensation: {
        mode: 'plane' as const,
        originOffset: 0.1,
        xOffset: 0.2,
        yOffset: -0.1,
        width: 420,
        height: 297,
      },
    };
    const operations = createSurfacePlaneCalibrationOperations(0, settings, {
      width: 420,
      height: 297,
    });
    const strokes = operations.filter(({ kind }) => kind === 'stroke');

    expect(strokes).toHaveLength(6);
    expect(strokes[0]?.kind === 'stroke' ? strokes[0].stroke.points[0] : null).toEqual({
      x: 6,
      y: 10,
      z: -3,
      pressure: 0,
    });
    const last = strokes.at(-1);
    expect(last?.kind === 'stroke' ? last.stroke.points[0] : null).toEqual({
      x: 10,
      y: 283,
      z: -3,
      pressure: 0,
    });
  });
});
