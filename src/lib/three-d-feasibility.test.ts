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

it('records the current scale audit budget blocker and releases handles across repetitions', () => {
  const rows = runFeasibility(module, 2, 'scale');
  expect(rows).toHaveLength(2);
  for (const [repetition, row] of rows.entries()) {
    expect(row).toMatchObject({
      repetition,
      suite: 'scale',
      fixture: 'dense-sphere-24-slices',
      sourceTriangles: 100_352,
      requestedSlices: 24,
      radiusMm: 0.6,
      status: 'rejected',
      failedStage: 'source-audit',
      liveHandles: 0,
      topology: {
        intersections: {
          status: 'budget-exceeded',
          complete: false,
          pairCount: 0,
          work: 5_000_000,
        },
      },
    });
    expect(row).not.toHaveProperty('booleanMs');
    expect(row).not.toHaveProperty('manufacturing');
    // Diagnostics must survive the same JSON boundary as the CLI/worker report.
    const encoded = JSON.stringify(row);
    expect(encoded).toContain('"trianglePairs":[]');
    expect(encoded).toContain('"shellVolumesMm3":[');
  }
});
