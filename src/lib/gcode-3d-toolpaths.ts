export type MachinePoint = {
  x: number;
  y: number;
  z: number;
  pressure: number;
};

export type MachineStroke = {
  points: MachinePoint[];
  sourceRun: number;
  reversed: boolean;
};

export type MachineOperation =
  | { kind: 'travel'; point: MachinePoint }
  | { kind: 'stroke'; stroke: MachineStroke }
  | { kind: 'pen-change'; color: string };

export type PreparedMachineGroup = {
  color: string;
  runs: number[][][];
};

export type UunaExpressiveMotion = {
  enabled: boolean;
  penAngle: number;
  tiltDirection: number;
  tipCompensation: boolean;
  contactZ: number;
  maximumPressDepth: number;
  mode: 'constant';
  leadIn: number;
  leadOut: number;
  modulationDepth: number;
  modulationPeriod: number;
  curvatureRelief: number;
  preserveStrokeDirection: boolean;
  surfaceCompensation: { mode: 'off' };
};

export function defaultUunaExpressiveMotion(contactZ = -3): UunaExpressiveMotion {
  return {
    enabled: false,
    penAngle: 90,
    tiltDirection: 0,
    tipCompensation: true,
    contactZ,
    maximumPressDepth: 0,
    mode: 'constant',
    leadIn: 2,
    leadOut: 2,
    modulationDepth: 0,
    modulationPeriod: 20,
    curvatureRelief: 0,
    preserveStrokeDirection: true,
    surfaceCompensation: { mode: 'off' },
  };
}

/** Build the Phase 1 constant-contact operation stream from already ordered machine-space runs. */
export function createConstantContactOperations(
  groups: PreparedMachineGroup[],
  penUp: number,
  contactZ: number,
): MachineOperation[] {
  const operations: MachineOperation[] = [];
  let sourceRun = 0;
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) operations.push({ kind: 'pen-change', color: group.color });
    for (const run of group.runs) {
      const [start] = run;
      if (!start) continue;
      operations.push({
        kind: 'travel',
        point: { x: start[0], y: start[1], z: penUp, pressure: 0 },
      });
      operations.push({
        kind: 'stroke',
        stroke: {
          sourceRun,
          reversed: false,
          points: run.map(([x, y]) => ({ x, y, z: contactZ, pressure: 1 })),
        },
      });
      sourceRun += 1;
    }
  });
  return operations;
}
