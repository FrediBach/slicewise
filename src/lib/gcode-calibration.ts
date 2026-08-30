import {
  machinePointForPressure,
  type MachineOperation,
  type MachinePoint,
  type UunaExpressiveMotion,
} from './gcode-3d-toolpaths';

export const UUNA_CALIBRATION_SHEET = { width: 120, height: 90 } as const;

function appendStroke(
  operations: MachineOperation[],
  points: Array<readonly [number, number, number]>,
  penUp: number,
  settings: UunaExpressiveMotion,
  sourceRun: number,
): void {
  const machinePoints: MachinePoint[] = points.map(([x, y, pressure]) =>
    machinePointForPressure(x, y, pressure, settings),
  );
  const start = machinePoints[0];
  if (!start) return;
  operations.push({
    kind: 'travel',
    point: { x: points[0][0], y: points[0][1], z: penUp, pressure: 0 },
  });
  operations.push({
    kind: 'stroke',
    stroke: { points: machinePoints, sourceRun, reversed: false },
  });
}

/** Create a compact contact ladder, angle-offset crosses, and taper fan. */
export function createUunaCalibrationOperations(
  penUp: number,
  settings: UunaExpressiveMotion,
): MachineOperation[] {
  const operations: MachineOperation[] = [];
  let sourceRun = 0;

  for (let step = 0; step <= 5; step += 1) {
    const pressure = step / 5;
    const y = 12 + step * 6;
    appendStroke(
      operations,
      [
        [10, y, 0],
        [10, y, pressure],
        [42, y, pressure],
        [42, y, 0],
      ],
      penUp,
      settings,
      sourceRun++,
    );
  }

  for (let step = 0; step < 3; step += 1) {
    const pressure = step / 2;
    const centerX = 62 + step * 18;
    const centerY = 26;
    appendStroke(
      operations,
      [
        [centerX - 6, centerY, 0],
        [centerX - 6, centerY, pressure],
        [centerX + 6, centerY, pressure],
        [centerX + 6, centerY, 0],
      ],
      penUp,
      settings,
      sourceRun++,
    );
    appendStroke(
      operations,
      [
        [centerX, centerY - 6, 0],
        [centerX, centerY - 6, pressure],
        [centerX, centerY + 6, pressure],
        [centerX, centerY + 6, 0],
      ],
      penUp,
      settings,
      sourceRun++,
    );
  }

  const centerX = 78;
  const centerY = 66;
  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = (spoke * Math.PI) / 4;
    const innerX = centerX + Math.cos(angle) * 5;
    const innerY = centerY + Math.sin(angle) * 5;
    const middleX = centerX + Math.cos(angle) * 13;
    const middleY = centerY + Math.sin(angle) * 13;
    const outerX = centerX + Math.cos(angle) * 22;
    const outerY = centerY + Math.sin(angle) * 22;
    appendStroke(
      operations,
      [
        [innerX, innerY, 0],
        [middleX, middleY, 1],
        [outerX, outerY, 0],
      ],
      penUp,
      settings,
      sourceRun++,
    );
  }

  return operations;
}

/** Draw contact-only crosses near the machine origin, +X edge, and +Y edge. */
export function createSurfacePlaneCalibrationOperations(
  penUp: number,
  settings: UunaExpressiveMotion,
  sheet: { width: number; height: number },
): MachineOperation[] {
  const operations: MachineOperation[] = [];
  const uncompensated = {
    ...settings,
    maximumPressDepth: 0,
    surfaceCompensation: { mode: 'off' as const },
  };
  const inset = Math.min(10, sheet.width / 4, sheet.height / 4);
  const radius = Math.min(4, inset / 2);
  const points: Array<readonly [number, number]> = [
    [inset, inset],
    [sheet.width - inset, inset],
    [inset, sheet.height - inset],
  ];
  let sourceRun = 0;
  for (const [x, y] of points) {
    appendStroke(
      operations,
      [
        [x - radius, y, 0],
        [x + radius, y, 0],
      ],
      penUp,
      uncompensated,
      sourceRun++,
    );
    appendStroke(
      operations,
      [
        [x, y - radius, 0],
        [x, y + radius, 0],
      ],
      penUp,
      uncompensated,
      sourceRun++,
    );
  }
  return operations;
}
