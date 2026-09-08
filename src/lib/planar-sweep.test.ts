import { beforeAll, expect, it } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { createPlanarSweep } from './planar-sweep';
import { createSolidKernel } from './solid-kernel';
import { solidBox } from '../test/fixtures/solid';

let module: ManifoldToplevel;
beforeAll(async () => {
  module = await Module();
  module.setup();
});
const rectangle = new Float64Array([-20, -15, 0, 20, -15, 0, 20, 15, 0, -20, 15, 0]);

it('builds a closed audited miter tube with linear face count and reported corner extension', () => {
  const original = rectangle.slice();
  const result = createPlanarSweep(rectangle, [0, 0, 1], 0.6);
  expect(result.mesh.T.length / 3).toBe(128);
  expect(result.topology.status).toBe('topology-checked');
  expect(result.maximumMiterMultiplier).toBeCloseTo(Math.sqrt(2), 12);
  expect(result.straightProfileDeviationMm).toBeCloseTo(0.6 * (1 - Math.cos(Math.PI / 16)), 12);
  expect(rectangle).toEqual(original);
  expect(createPlanarSweep(rectangle, [0, 0, 1], 0.6)).toEqual(result);
  const kernel = createSolidKernel(module);
  for (const operation of ['inset', 'emboss'] as const) {
    const output = kernel.run(solidBox(), [result.mesh], operation);
    expect(output.topology.status).toBe('topology-checked');
    expect(output.measurements.boundaryComponents).toBe(1);
    if (operation === 'inset') expect(output.measurements.volumeMm3).toBeLessThan(60000);
    else expect(output.measurements.volumeMm3).toBeGreaterThan(60000);
  }
  expect(kernel.liveHandles).toBe(0);
});

it('supports reversed paths and tilted planes without changing radius or volume', () => {
  const baseline = createPlanarSweep(rectangle, [0, 0, 1], 0.6);
  const moved = new Float64Array(rectangle.length);
  for (let i = 0; i < rectangle.length; i += 3)
    moved.set([rectangle[i + 2] + 5, rectangle[i] - 10, rectangle[i + 1] + 20], i);
  const tilted = createPlanarSweep(moved, [1, 0, 0], 0.6);
  expect(tilted.topology.signedVolumeMm3).toBeCloseTo(baseline.topology.signedVolumeMm3!, 2);
  const reverse = new Float64Array(
    Array.from({ length: 4 }, (_, i) =>
      Array.from(rectangle.slice((3 - i) * 3, (4 - i) * 3)),
    ).flat(),
  );
  expect(createPlanarSweep(reverse, [0, 0, 1], 0.6).topology.signedVolumeMm3).toBeCloseTo(
    baseline.topology.signedVolumeMm3!,
    5,
  );
});

it('rejects nonplanar paths, acute miters, crossing tubes and unsupported budgets', () => {
  const nonplanar = rectangle.slice();
  nonplanar[2] = 0.1;
  expect(() => createPlanarSweep(nonplanar, [0, 0, 1], 0.6)).toThrow('declared plane');
  expect(() =>
    createPlanarSweep(new Float64Array([0, 0, 0, 10, 0, 0, 0, 0.01, 0]), [0, 0, 1], 0.6),
  ).toThrow('miter limit');
  const narrow = new Float64Array([0, 0, 0, 10, 0, 0, 10, 0.5, 0, 0, 0.5, 0]);
  expect(() => createPlanarSweep(narrow, [0, 0, 1], 0.6)).toThrow();
  expect(() => createPlanarSweep(rectangle, [0, 0, 0], 0.6)).toThrow('direction');
  expect(() => createPlanarSweep(rectangle, [0, 0, 1], NaN)).toThrow('radius');
  expect(() => createPlanarSweep(rectangle, [0, 0, 1], 0.6, 9)).toThrow('tessellation');
  expect(() => createPlanarSweep(new Float64Array(24000), [0, 0, 1], 0.6)).toThrow('budget');
});

it('builds a finely sampled circular path with bounded miter extension and profile radius', () => {
  const points = new Float64Array(
    Array.from({ length: 128 }, (_, i) => {
      const angle = (i * 2 * Math.PI) / 128;
      return [20 * Math.cos(angle), 20 * Math.sin(angle), 0];
    }).flat(),
  );
  const sweep = createPlanarSweep(points, [0, 0, 1], 0.6);
  expect(sweep.mesh.T.length / 3).toBe(4096);
  expect(sweep.maximumMiterMultiplier).toBeCloseTo(1 / Math.cos(Math.PI / 128), 12);
  expect(sweep.topology.signedVolumeMm3).toBeCloseTo(
    128 * 40 * Math.sin(Math.PI / 128) * 8 * 0.6 ** 2 * Math.sin(Math.PI / 8),
    2,
  );
  let minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 2; i < sweep.mesh.V.length; i += 3) {
    minZ = Math.min(minZ, sweep.mesh.V[i]);
    maxZ = Math.max(maxZ, sweep.mesh.V[i]);
  }
  expect(minZ).toBeCloseTo(-0.6, 6);
  expect(maxZ).toBeCloseTo(0.6, 6);
});
