import { expect, it } from 'vitest';
import {
  buildVolumeBounds,
  buildVolumeGrid,
  fitsBuildVolume,
  validBuildVolume,
} from './three-d-build-volume';
it('centers rectangular beds with strict bounds shared by the scene and manufacturing', () => {
  const bounds = buildVolumeBounds([180, 120, 160]);
  expect(bounds).toEqual({ min: [-90, -60, 0], max: [90, 60, 160] });
  expect(fitsBuildVolume(bounds, [180, 120, 160])).toBe(true);
  expect(fitsBuildVolume({ ...bounds, max: [90.001, 60, 160] }, [180, 120, 160])).toBe(false);
  expect(fitsBuildVolume({ ...bounds, min: [-90, -60, -0.001] }, [180, 120, 160])).toBe(false);
  const grid = buildVolumeGrid([183, 125, 160]);
  for (let i = 0; i < grid.length; i += 3) {
    expect(Math.abs(grid[i])).toBeLessThanOrEqual(91.5);
    expect(Math.abs(grid[i + 1])).toBeLessThanOrEqual(62.5);
    expect(grid[i + 2]).toBeCloseTo(-0.05);
  }
  expect(buildVolumeGrid([2000, 2000, 2000]).length).toBeLessThanOrEqual(406 * 6);
});
it('rejects malformed dimensions and retains the default for earlier session projects', () => {
  expect(buildVolumeBounds()).toEqual({ min: [-110, -110, 0], max: [110, 110, 250] });
  for (const size of [
    [0, 100, 100],
    [100, Infinity, 100],
    [100, 2001, 100],
    [100, 100],
    ['100', 100, 100],
  ])
    expect(validBuildVolume(size)).toBe(false);
  expect(() => buildVolumeGrid([0, 100, 100])).toThrow(/build dimensions/);
});
