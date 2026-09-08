import { beforeAll, describe, expect, it, vi } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { createSolidKernel, type SolidMesh } from './solid-kernel';
import { createRoundedTreatmentRecipe, selectSliceIndices } from './slice-treatment';
import { extractPlanarSlices } from './slice-geometry';
import { solidBox } from '../test/fixtures/solid';
import { getMeshTopology } from './mesh-topology';
import { PrintTopologyError } from './print-validation';
import { createFeasibilityFixtures, createContourFeasibilityFixtures } from './three-d-feasibility';

let module: ManifoldToplevel;
beforeAll(async () => {
  module = await Module();
  module.setup();
});
const field = {
  kind: 'planar' as const,
  normal: [0, 0, 1] as [number, number, number],
  levels: [-10, 0, 10],
};

// Independent line/triangle intersections measure the actual returned surface,
// even when Boolean triangulation omits vertices at the sampling location.
function positiveSurfaceX(mesh: SolidMesh, y: number, z: number) {
  const intersections: number[] = [];
  for (let i = 0; i < mesh.T.length; i += 3) {
    const [a, b, c] = Array.from(mesh.T.subarray(i, i + 3), (index) =>
      Array.from(mesh.V.subarray(index * 3, index * 3 + 3)),
    );
    const by = b[1] - a[1],
      bz = b[2] - a[2],
      cy = c[1] - a[1],
      cz = c[2] - a[2];
    const determinant = by * cz - cy * bz;
    if (Math.abs(determinant) < 1e-12) continue;
    const u = ((y - a[1]) * cz - cy * (z - a[2])) / determinant;
    const v = (by * (z - a[2]) - (y - a[1]) * bz) / determinant;
    if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
    const x = a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]);
    if (x > 0) intersections.push(x);
  }
  expect(intersections.length).toBeGreaterThan(0);
  return Math.max(...intersections);
}

describe('slice selection and rounded capsule recipes', () => {
  it('accepts contour torus Inset but rejects four adjacent overlaps in its Float32 Emboss result', () => {
    const fixture = createContourFeasibilityFixtures(module).find((f) => f.name === 'torus')!;
    const original = structuredClone(fixture.base);
    const kernel = createSolidKernel(module);
    const tools = kernel.createRoundedTools(
      createRoundedTreatmentRecipe(
        extractPlanarSlices(fixture.base, fixture.field, 0),
        { mode: 'all' },
        0.6,
      ),
    );
    expect(kernel.run(fixture.base, tools, 'inset').topology.checks.selfIntersections).toBe(
      'passed',
    );
    let failure: unknown;
    try {
      kernel.run(fixture.base, tools, 'emboss');
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PrintTopologyError);
    const report = (failure as PrintTopologyError).report;
    expect(report.checks.nonAdjacentIntersections).toBe('passed');
    expect(report.checks.selfIntersections).toBe('failed');
    expect(report.intersections?.adjacentPairCount).toBe(4);
    expect(report.intersections?.complete).toBe(true);
    expect(kernel.liveHandles).toBe(0);
    expect(fixture.base).toEqual(original);
  });

  it('selects ordered levels with clamped/empty ranges and wrapped pattern offsets', () => {
    expect(selectSliceIndices(4, { mode: 'all' })).toEqual([0, 1, 2, 3]);
    expect(selectSliceIndices(4, { mode: 'range', first: -10, last: 2 })).toEqual([0, 1, 2]);
    expect(selectSliceIndices(4, { mode: 'range', first: 8, last: 10 })).toEqual([]);
    expect(selectSliceIndices(4, { mode: 'range', first: 3, last: 1 })).toEqual([]);
    expect(selectSliceIndices(7, { mode: 'every', step: 3, offset: -1 })).toEqual([2, 5]);
    expect(selectSliceIndices(7, { mode: 'every', step: 3, offset: 5 })).toEqual([2, 5]);
    expect(selectSliceIndices(2, { mode: 'every', step: 3, offset: 5 })).toEqual([]);
    expect(() => selectSliceIndices(7, { mode: 'every', step: 0, offset: 0 })).toThrow();
    expect(() => selectSliceIndices(7, { mode: 'range', first: NaN, last: 1 })).toThrow();
  });

  it('preserves selected levels and produces serializable detached recipes', () => {
    const geometry = extractPlanarSlices(solidBox(), field, 3);
    const recipe = createRoundedTreatmentRecipe(
      geometry,
      { mode: 'every', step: 2, offset: 0 },
      0.6,
    );
    expect(recipe.sourceRevision).toBe(3);
    expect(recipe.selectedSlices).toEqual([0, 2]);
    expect(recipe.runs).toHaveLength(2);
    expect(recipe).toEqual(structuredClone(recipe));
    expect(recipe.runs[0][2]).toBe(-10);
    expect(recipe.runs[1][2]).toBe(10);
    recipe.runs[0].fill(999);
    expect(geometry.slices[0].points[2]).toBe(-10);
    expect(createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0).runs).toEqual([]);
  });

  it('rejects open paths and impossible profile/complexity requests', () => {
    const box = solidBox();
    const geometry = extractPlanarSlices({ ...box, T: box.T.slice(0, -6) }, field, 0);
    expect(() => createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6)).toThrow(
      /open contour/,
    );
    expect(() => createRoundedTreatmentRecipe(geometry, { mode: 'all' }, NaN)).toThrow(/radius/);
    expect(() => createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 1, 1e-10)).toThrow(
      /budget/,
    );
    expect(createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0).runs).toEqual([]);
    const dense = extractPlanarSlices(
      box,
      { ...field, levels: Array.from({ length: 65 }, (_, i) => i / 10) },
      0,
    );
    expect(() => createRoundedTreatmentRecipe(dense, { mode: 'all' }, 0.6)).toThrow(/budget/);
  });

  it('builds closed fused tools from actual planar paths and preserves measured dimensions', () => {
    const box = solidBox();
    const original = structuredClone(box);
    const geometry = extractPlanarSlices(box, { ...field, levels: [0] }, 0);
    const recipe = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6);
    const kernel = createSolidKernel(module);
    const tools = kernel.createRoundedTools(recipe);
    expect(tools).toHaveLength(1);
    expect(kernel.liveHandles).toBe(0);
    expect(getMeshTopology(tools[0]).boundaryEdges).toHaveLength(0);
    expect(getMeshTopology(tools[0]).nonManifoldEdges).toHaveLength(0);
    expect(kernel.createRoundedTools(recipe)).toEqual(tools);
    for (const operation of ['inset', 'emboss'] as const) {
      const result = kernel.run(box, tools, operation);
      expect(result.measurements.boundaryComponents).toBe(1);
      expect(getMeshTopology(result.mesh).boundaryEdges).toHaveLength(0);
      if (operation === 'inset') expect(result.measurements.volumeMm3).toBeLessThan(60_000);
      else expect(result.measurements.volumeMm3).toBeGreaterThan(60_000);
      expect(positiveSurfaceX(result.mesh, 0, 0)).toBeCloseTo(
        operation === 'inset' ? 19.4 : 20.6,
        4,
      );
      // The footprint spans 1.2 mm across this planar face and is neutral outside it.
      expect(positiveSurfaceX(result.mesh, 0, 0.7)).toBeCloseTo(20, 4);
      expect(Math.abs(positiveSurfaceX(result.mesh, 0, 0.5) - 20)).toBeGreaterThan(0.25);
    }
    expect(box).toEqual(original);
    expect(kernel.liveHandles).toBe(0);
  });

  it('sweeps tilted paths in their actual 3D plane', () => {
    const box = solidBox();
    const slice = extractPlanarSlices(box, { kind: 'planar', normal: [1, 2, 3], levels: [2.7] }, 0);
    const recipe = createRoundedTreatmentRecipe(slice, { mode: 'all' }, 0.6);
    const kernel = createSolidKernel(module);
    const tools = kernel.createRoundedTools(recipe);
    for (const tool of tools) {
      const unit = slice.field.normal;
      let error = 0;
      for (let i = 0; i < tool.V.length; i += 3)
        error = Math.max(
          error,
          Math.abs(tool.V[i] * unit[0] + tool.V[i + 1] * unit[1] + tool.V[i + 2] * unit[2] - 2.7),
        );
      expect(error).toBeLessThanOrEqual(0.60001);
      expect(error).toBeGreaterThan(0.6 - recipe.profileToleranceMm);
    }
    expect(kernel.run(box, tools, 'emboss').measurements.boundaryComponents).toBe(1);
    expect(kernel.liveHandles).toBe(0);
  });

  it('selects both torus contours at the chosen level and retains its central hole', () => {
    const torus = createFeasibilityFixtures(module)[2].base;
    const geometry = extractPlanarSlices(torus, { ...field, levels: [0, 3] }, 0);
    const recipe = createRoundedTreatmentRecipe(
      geometry,
      { mode: 'range', first: 0, last: 0 },
      0.6,
    );
    expect(recipe.selectedSlices).toEqual([0]);
    expect(recipe.runs).toHaveLength(2);
    const kernel = createSolidKernel(module);
    const tools = kernel.createRoundedTools(recipe);
    const result = kernel.run(torus, tools, 'emboss');
    expect(result.measurements.boundaryComponents).toBe(1);
    let minimumRadius = Infinity;
    for (let i = 0; i < result.mesh.V.length; i += 3)
      minimumRadius = Math.min(minimumRadius, Math.hypot(result.mesh.V[i], result.mesh.V[i + 1]));
    expect(minimumRadius).toBeGreaterThan(9.3);
    expect(minimumRadius).toBeLessThan(9.5);
    expect(kernel.liveHandles).toBe(0);
  });

  it('bypasses zero amounts and rejects malformed recipes without leaving native handles', () => {
    const geometry = extractPlanarSlices(solidBox(), { ...field, levels: [0] }, 0);
    const kernel = createSolidKernel(module);
    const neutral = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0);
    expect(kernel.createRoundedTools(neutral)).toEqual([]);
    const recipe = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6);
    const duplicate = recipe.runs[0].slice();
    duplicate.set(duplicate.subarray(0, 3), 3);
    expect(() => kernel.createRoundedTools({ ...recipe, runs: [duplicate] })).toThrow(
      /zero-length/,
    );
    expect(() => kernel.createRoundedTools({ ...recipe, circularSegments: 129 })).toThrow(
      /profile/,
    );
    expect(kernel.liveHandles).toBe(0);
    expect(kernel.createRoundedTools(recipe)).toHaveLength(1);
    expect(kernel.liveHandles).toBe(0);
  });

  it.each(['twisted-box', 'bent-box'])(
    'uses the actual %s triangles and keeps its rib fused',
    (name) => {
      const fixture = createContourFeasibilityFixtures(module).find(
        (fixture) => fixture.name === name,
      )!;
      const geometry = extractPlanarSlices(fixture.base, fixture.field, 11);
      const kernel = createSolidKernel(module);
      const recipe = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6);
      const original = structuredClone(fixture.base);
      const tools = kernel.createRoundedTools(recipe);
      const base = kernel.run(fixture.base, [], 'off');
      for (const operation of ['inset', 'emboss'] as const) {
        const result = kernel.run(fixture.base, tools, operation);
        expect(result.measurements.boundaryComponents).toBe(1);
        expect(getMeshTopology(result.mesh).boundaryEdges).toHaveLength(0);
        if (operation === 'inset')
          expect(result.measurements.volumeMm3).toBeLessThan(base.measurements.volumeMm3);
        else expect(result.measurements.volumeMm3).toBeGreaterThan(base.measurements.volumeMm3);
      }
      expect(fixture.base).toEqual(original);
      expect(kernel.liveHandles).toBe(0);
    },
  );

  it('releases pending capsules and endpoint spheres if native construction fails', () => {
    const geometry = extractPlanarSlices(solidBox(), { ...field, levels: [0] }, 0);
    const recipe = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6);
    const kernel = createSolidKernel(module);
    const originalHull = module.Manifold.hull;
    const spy = vi
      .spyOn(module.Manifold, 'hull')
      .mockImplementationOnce((points) => originalHull(points))
      .mockImplementationOnce(() => {
        throw new Error('Injected native hull failure');
      });
    try {
      expect(() => kernel.createRoundedTools(recipe)).toThrow(/native hull failure/);
      expect(kernel.liveHandles).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(kernel.createRoundedTools(recipe)).toHaveLength(1);
    expect(kernel.liveHandles).toBe(0);
  });
});
