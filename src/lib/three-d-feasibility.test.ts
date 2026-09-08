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

it('completes the scale source audit and records the rounded-tool budget blocker and releases handles across repetitions', () => {
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
      failedStage: 'recipe',
      liveHandles: 0,
      contourRuns: 24,
      contourVertices: 15_088,
      message: expect.stringContaining('Rounded tool budget exceeded'),
      sourceIntersectionWork: expect.any(Number),
    });
    expect(row).not.toHaveProperty('booleanMs');
    expect(row).not.toHaveProperty('manufacturing');
    // Diagnostics must survive the same JSON boundary as the CLI/worker report.
    const encoded = JSON.stringify(row);
    expect(encoded).toContain('"levels":[');
    expect(encoded).toContain('"sourceIntersectionWork":');
    if (!('sourceIntersectionWork' in row)) throw new Error('Missing source audit work');
    expect(row.sourceIntersectionWork).toBeLessThan(5_000_000);
    expect(row.sourceIntersectionWork).toBeGreaterThan(0);
  }
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
