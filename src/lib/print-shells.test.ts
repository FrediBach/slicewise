import { describe, expect, it } from 'vitest';
import { auditShellContainment, PRINT_SHELL_LIMITS } from './print-shells';
import { auditPrintTopology } from './print-validation';
import { getMeshTopology, type TopologyMesh } from './mesh-topology';
import { solidBox } from '../test/fixtures/solid';

function box(scale = 1, x = 0, inward = false): TopologyMesh {
  const mesh = solidBox();
  const T = mesh.T.slice();
  if (inward) for (let i = 0; i < T.length; i += 3) [T[i + 1], T[i + 2]] = [T[i + 2], T[i + 1]];
  return { V: Float64Array.from(mesh.V, (v, i) => v * scale + (i % 3 === 0 ? x : 0)), T };
}
function combine(...meshes: TopologyMesh[]): TopologyMesh {
  const V: number[] = [],
    T: number[] = [];
  for (const mesh of meshes) {
    T.push(...Array.from(mesh.T, (v) => v + V.length / 3));
    V.push(...Array.from(mesh.V));
  }
  return { V: Float64Array.from(V), T: Uint32Array.from(T) };
}
const audit = (...meshes: TopologyMesh[]) => auditPrintTopology(combine(...meshes));

describe('shell containment and orientation', () => {
  it('separates boundary shells from physical bodies, preserving enclosed cavities', () => {
    const report = audit(box(), box(0.5, 0, true));
    expect(report.status).toBe('topology-checked');
    expect(report.checks.shellContainment).toBe('passed');
    expect(report.checks.manufacturing).toBe('not-run');
    expect(report.shellContainment?.bodyCount).toBe(1);
    expect(
      report.shellContainment?.shells.map((s) => [s.parent, s.depth, s.orientationMatchesDepth]),
    ).toEqual([
      [-1, 0, true],
      [0, 1, true],
    ]);
    expect([...report.shellVolumesMm3]).toEqual([60000, -7500]);
  });

  it('counts an island inside a cavity as a separate body with alternating nesting', () => {
    const report = audit(box(), box(0.6, 0, true), box(0.3), box(0.1, 0, true));
    expect(report.shellContainment?.status).toBe('passed');
    expect(report.shellContainment?.bodyCount).toBe(2);
    expect(report.shellContainment?.shells.map((s) => [s.parent, s.depth])).toEqual([
      [-1, 0],
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('rejects nested outward shells and misplaced inward shells despite positive total volume', () => {
    for (const mesh of [box(0.5), box(0.5, 100, true)]) {
      const report = audit(box(), mesh);
      expect(report.checks.selfIntersections).toBe('passed');
      expect(report.checks.signedVolume).toBe('passed');
      expect(report.status).toBe('invalid');
      expect(report.shellContainment?.status).toBe('failed');
      expect(report.shellContainment?.bodyCount).toBeNull();
      expect(report.shellContainment?.shells[1].orientationMatchesDepth).toBe(false);
      expect(report.issues.find((i) => i.code === 'shell-orientation')?.triangles.length).toBe(1);
    }
  });

  it('handles multiple cavities, separate bodies and reordered shells without repair', () => {
    const mesh = combine(box(0.15, 8, true), box(0.5, 100), box(), box(0.15, -8, true));
    const original = structuredClone(mesh);
    const report = auditPrintTopology(mesh);
    expect(report.shellContainment?.status).toBe('passed');
    expect(report.shellContainment?.bodyCount).toBe(2);
    expect(report.shellContainment?.shells.map((s) => [s.parent, s.depth])).toEqual([
      [2, 1],
      [-1, 0],
      [-1, 0],
      [2, 1],
    ]);
    expect(auditPrintTopology(mesh)).toEqual(report);
    expect(mesh).toEqual(original);
  });

  it('does not use bounding boxes or shell centroids as a containment proof', () => {
    // A tetrahedron's bounds contain the small box, but its sloped face places
    // that box outside the tetrahedron. Both shells are closed and disjoint.
    const tetra = {
      V: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10],
      T: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
    };
    const small = box(0.01);
    const shifted = { ...small, V: Float64Array.from(small.V, (v) => v + 6) };
    const report = audit(tetra, shifted);
    expect(report.checks.selfIntersections).toBe('passed');
    expect(report.shellContainment?.status).toBe('passed');
    expect(report.shellContainment?.shells.map((s) => s.parent)).toEqual([-1, -1]);
    expect(report.shellContainment?.bodyCount).toBe(2);
  });

  it('is stable after translation and ignores unused vertices in shell enumeration', () => {
    const mesh = combine(box(), box(0.5, 0, true));
    const translated = {
      ...mesh,
      V: Float64Array.from([...Array.from(mesh.V, (v) => v + 1e9), 1e30, 0, 0]),
    };
    const report = auditPrintTopology(translated);
    expect(report.shellContainment?.bodyCount).toBe(1);
    expect(report.shellContainment?.shells).toHaveLength(2);
    expect(report.issues[0].code).toBe('unused-vertex');
    expect(report.shellContainment?.shells.map((s) => s.depth)).toEqual([0, 1]);
  });

  it('does not classify intersecting shells or invalid topology', () => {
    const crossing = audit(box(), box(1, 10));
    expect(crossing.checks.selfIntersections).toBe('failed');
    expect(crossing.checks.shellContainment).toBe('not-run');
    expect(crossing.shellContainment).toBeNull();
    const mesh = box();
    expect(
      auditPrintTopology({ ...mesh, T: Array.from(mesh.T).slice(3) }).shellContainment,
    ).toBeNull();
  });

  it('keeps numerical uncertainty explicit instead of inventing nesting or a body count', () => {
    const mesh = combine(box(), box(0.5, 0, true));
    const topology = getMeshTopology(mesh);
    const report = auditShellContainment(mesh, topology.componentLabels, [60000, -7500], 100);
    expect(report.status).toBe('indeterminate');
    expect(report.complete).toBe(false);
    expect(report.bodyCount).toBeNull();
    expect(report.unresolvedPair).toEqual([0, 1]);
    expect(report.shells.every((s) => s.orientationMatchesDepth === null)).toBe(true);
    for (const tolerance of [-1, NaN, Infinity])
      expect(() =>
        auditShellContainment(mesh, topology.componentLabels, [60000, -7500], tolerance),
      ).toThrow('tolerance');
    const overBudget = auditShellContainment(
      { V: [], T: { length: (PRINT_SHELL_LIMITS.triangles + 1) * 3 } },
      [],
      [],
      1e-10,
    );
    expect(overBudget.status).toBe('budget-exceeded');
    expect(overBudget.work).toBe(0);
  });

  it('rejects exhausted work and excessive shells without reporting a body count', () => {
    const mesh = combine(box(), box(0.5, 0, true));
    const topology = getMeshTopology(mesh);
    const report = auditShellContainment(mesh, topology.componentLabels, [60000, -7500], 1e-10, 3);
    expect(report.status).toBe('budget-exceeded');
    expect(report.complete).toBe(false);
    expect(report.work).toBe(3);
    expect(report.bodyCount).toBeNull();
    expect(report.shells.every((s) => s.depth === null && s.parent === null)).toBe(true);
    for (const limit of [-1, 1.5, Infinity, PRINT_SHELL_LIMITS.work + 1])
      expect(() =>
        auditShellContainment(mesh, topology.componentLabels, [60000, -7500], 1e-10, limit),
      ).toThrow('work limit');
    const many = combine(
      ...Array.from({ length: PRINT_SHELL_LIMITS.shells + 1 }, (_, i) => box(0.01, i * 100)),
    );
    const result = auditPrintTopology(many);
    expect(result.checks.selfIntersections).toBe('passed');
    expect(result.issues.some((i) => i.code === 'shell-budget')).toBe(true);
    expect(result.shellContainment?.bodyCount).toBeNull();
    expect(result.shellContainment?.shells).toHaveLength(PRINT_SHELL_LIMITS.shells);
  });
});
