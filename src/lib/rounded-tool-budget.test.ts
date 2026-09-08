import { describe, expect, it } from 'vitest';
import { sphereDemo } from './demo-meshes';
import { weld } from './mesh';
import { previewThreeD } from './three-d-preparation';
import { createThreeDProject } from './three-d-project';
import {
  createRoundedTreatmentRecipe,
  RoundedToolBudgetError,
  checkRoundedToolBudget,
  roundedToolWorkload,
} from './slice-treatment';

function cubeSlices(lines: number) {
  return previewThreeD({
    id: 1,
    source: {
      id: 'cube',
      version: 1,
      name: 'cube',
      imported: false,
      upY: false,
      mesh: weld(sphereDemo('cube')),
    },
    project: createThreeDProject('cube'),
    settings: { axis: 'up', lines },
  }).geometry!;
}

describe('rounded tool construction allowance', () => {
  it('admits all eight exact cube paths without silently approximating them', () => {
    const geometry = cubeSlices(8);
    const recipe = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6);
    expect(recipe.runs).toHaveLength(8);
    expect(recipe.runs.reduce((n, run) => n + run.length / 3, 0)).toBe(2048);
    expect(recipe.approximation).toBeNull();
    for (const [index, run] of recipe.runs.entries()) {
      const slice = geometry.slices[index];
      for (let i = 0; i < run.length / 3; i++)
        expect(run.slice(i * 3, i * 3 + 3)).toEqual(
          slice.points.slice(slice.runPoints[i] * 3, slice.runPoints[i] * 3 + 3),
        );
    }
    const approximate = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6, 0.05, 0.05);
    expect(approximate.approximation!.maximumDeviationMm).toBeLessThanOrEqual(0.05);
    expect(approximate.approximation!.outputVertices).toBeLessThan(1000);
  });

  it('reports the complete construction estimate when 16 exact cube paths exceed it', () => {
    let error: unknown;
    try {
      createRoundedTreatmentRecipe(cubeSlices(16), { mode: 'all' }, 0.6);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RoundedToolBudgetError);
    expect((error as RoundedToolBudgetError).workload).toEqual({
      runs: 16,
      vertices: 4096,
      primitiveTriangles: 1064960,
    });
    expect((error as Error).message).toContain(
      '1,064,960 estimated construction triangles (limit 1,000,000)',
    );
    expect((error as Error).message).toContain('enable 0.05 mm contour approximation');
  });

  it('retains independent loop, vertex and construction limits', () => {
    expect(() => checkRoundedToolBudget(roundedToolWorkload(65, 260, 8), null)).toThrow(
      '65 tool loops (limit 64)',
    );
    expect(() => checkRoundedToolBudget(roundedToolWorkload(1, 8001, 8), null)).toThrow(
      '8,001 path vertices (limit 8,000)',
    );
    expect(() => checkRoundedToolBudget(roundedToolWorkload(8, 2048, 32), null)).toThrow(
      'estimated construction triangles',
    );
  });
});
