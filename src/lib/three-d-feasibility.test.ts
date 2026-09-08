import { createRoundedTreatmentRecipe } from './slice-treatment';
import { extractPlanarSlices } from './slice-geometry';
import { createSolidKernel } from './solid-kernel';
import { beforeAll, expect, it } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { createScaleFeasibilityFixtures, runFeasibility } from './three-d-feasibility';

let module: ManifoldToplevel;
beforeAll(async () => {
  module = await Module();
  module.setup();
});

it('creates a deterministic target-scale source with 24 declared millimeter cuts', () => {
  const [fixture] = createScaleFeasibilityFixtures(module);
  expect(fixture.base.T.length / 3).toBe(100_352);
  expect(fixture.field.levels).toHaveLength(24);
  expect(fixture.field.normal).toEqual([0, 0, 1]);
  expect(fixture.field.levels[0]).toBe(-46.7);
  expect(fixture.field.levels[23]).toBe(45.3);
  const z = Array.from(fixture.base.V).filter((_, i) => i % 3 === 2);
  expect(Math.min(...z)).toBe(-50);
  expect(Math.max(...z)).toBe(50);
  const [again] = createScaleFeasibilityFixtures(module);
  expect(again.base.V).toEqual(fixture.base.V);
  expect(again.base.T).toEqual(fixture.base.T);
});

it('audits the scale source and admits all 24 exact paths under the expanded construction allowance', () => {
  const [fixture] = createScaleFeasibilityFixtures(module);
  const kernel = createSolidKernel(module);
  expect(kernel.run(fixture.base, [], 'off').topology.status).toBe('topology-checked');
  const geometry = extractPlanarSlices(fixture.base, fixture.field, 0);
  const recipe = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6);
  expect(recipe.runs).toHaveLength(24);
  expect(recipe.runs.reduce((n, run) => n + run.length / 3, 0)).toBe(15088);
  expect(recipe.approximation).toBeNull();
  expect(kernel.liveHandles).toBe(0);
});

it('admits the approximated scale tools but keeps the Boolean/output audit rejection', () => {
  const [row] = runFeasibility(module, 1, 'scale-approximate');
  expect(row).toMatchObject({
    status: 'rejected',
    failedStage: 'boolean-and-output-audit',
    liveHandles: 0,
    approximation: { toleranceMm: 0.05, inputVertices: 15088, outputVertices: 2373 },
  });
  if (!('approximation' in row) || !row.approximation)
    throw new Error('Missing approximation report');
  expect(row.approximation.maximumDeviationMm).toBeLessThanOrEqual(0.05);
  expect(row.approximation.work).toBeLessThanOrEqual(2_000_000);
}, 30000);
