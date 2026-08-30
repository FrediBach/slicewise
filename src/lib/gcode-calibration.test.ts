import { describe, expect, it } from 'vitest';
import { defaultUunaExpressiveMotion } from './gcode-3d-toolpaths';
import { createUunaCalibrationOperations, UUNA_CALIBRATION_SHEET } from './gcode-calibration';

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
});
