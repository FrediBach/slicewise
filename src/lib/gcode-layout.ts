import { type ContourToolpathGroup } from './contour-engine';

export type GCodeLayoutRotation = 'none' | 'clockwise-90';

export type GCodeMachineLayout = {
  groups: ContourToolpathGroup[];
  rotation: GCodeLayoutRotation;
  sheet: { width: number; height: number };
  sourceSheet: { width: number; height: number };
};

function fits(width: number, height: number, area: { width: number; height: number }): boolean {
  return width <= area.width + 0.0005 && height <= area.height + 0.0005;
}

function rotateRunClockwise(run: number[], sourceHeight: number): number[] {
  const rotated: number[] = [];
  for (let index = 0; index + 1 < run.length; index += 2)
    rotated.push(sourceHeight - run[index + 1], run[index]);
  return rotated;
}

/** Rotate only when the original sheet does not fit and its 90° layout does. */
export function resolveGCodeMachineLayout(
  groups: ContourToolpathGroup[],
  sourceSheet: { width: number; height: number },
  machineArea: { width: number; height: number } | null,
  autoRotate: boolean,
): GCodeMachineLayout {
  const shouldRotate =
    autoRotate &&
    machineArea !== null &&
    !fits(sourceSheet.width, sourceSheet.height, machineArea) &&
    fits(sourceSheet.height, sourceSheet.width, machineArea);
  if (!shouldRotate)
    return {
      groups,
      rotation: 'none',
      sheet: { ...sourceSheet },
      sourceSheet: { ...sourceSheet },
    };
  return {
    groups: groups.map((group) => ({
      ...group,
      runs: group.runs.map((run) => rotateRunClockwise(run, sourceSheet.height)),
    })),
    rotation: 'clockwise-90',
    sheet: { width: sourceSheet.height, height: sourceSheet.width },
    sourceSheet: { ...sourceSheet },
  };
}
