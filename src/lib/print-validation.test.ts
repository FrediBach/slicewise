import { describe, expect, it } from 'vitest';
import {
  auditPrintTopology,
  assertPrintTopology,
  PrintTopologyError,
  PRINT_TOPOLOGY_LIMITS,
} from './print-validation';
import { foldedOctahedron, solidBox } from '../test/fixtures/solid';
import { getMeshTopology, type TopologyMesh } from './mesh-topology';

function reversed(mesh: TopologyMesh) {
  const T = Uint32Array.from(Array.from(mesh.T));
  for (let i = 0; i < T.length; i += 3) [T[i + 1], T[i + 2]] = [T[i + 2], T[i + 1]];
  return { V: Float64Array.from(Array.from(mesh.V)), T };
}
function combine(a: TopologyMesh, b: TopologyMesh) {
  return {
    V: Float64Array.from([...Array.from(a.V), ...Array.from(b.V)]),
    T: Uint32Array.from([...Array.from(a.T), ...Array.from(b.T, (v) => v + a.V.length / 3)]),
  };
}
const codes = (mesh: TopologyMesh) => auditPrintTopology(mesh).issues.map((issue) => issue.code);

describe('independent print topology audit', () => {
  it('checks a closed asymmetric box without claiming unperformed solid checks', () => {
    const mesh = solidBox(),
      original = structuredClone(mesh);
    const report = auditPrintTopology(mesh);
    expect(report.status).toBe('topology-checked');
    expect(report.issues).toEqual([]);
    expect(report.signedVolumeMm3).toBe(60_000);
    expect([...report.shellVolumesMm3]).toEqual([60_000]);
    expect(report.checks).toEqual({
      buffers: 'passed',
      faces: 'passed',
      edges: 'passed',
      vertexLinks: 'passed',
      signedVolume: 'passed',
      nonAdjacentIntersections: 'passed',
      selfIntersections: 'passed',
      shellContainment: 'not-run',
      manufacturing: 'not-run',
    });
    expect(report).toEqual(structuredClone(report));
    expect(auditPrintTopology(mesh)).toEqual(report);
    expect(mesh).toEqual(original);
  });

  it('detects disconnected vertex fans even when every edge has two opposite faces', () => {
    const first = new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
    const second = reversed({ V: [], T: first }).T.map((id) => (id === 0 ? 0 : id + 3));
    const mesh = {
      V: new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, -2, 0, 0, 0, -2, 0, 0, 0, -2]),
      T: new Uint32Array([...first, ...second]),
    };
    expect(getMeshTopology(mesh).boundaryEdges).toHaveLength(0);
    expect(getMeshTopology(mesh).nonManifoldEdges).toHaveLength(0);
    const report = auditPrintTopology(mesh);
    expect(report.checks.edges).toBe('passed');
    expect(report.checks.vertexLinks).toBe('failed');
    expect(report.issues).toEqual([
      {
        code: 'non-manifold-vertex',
        severity: 'error',
        count: 1,
        vertices: new Uint32Array([0]),
        triangles: new Uint32Array(),
      },
    ]);
    expect(report.status).toBe('invalid');
  });

  it('rejects boundary edges and winding conflicts with sample locations', () => {
    const box = solidBox();
    const open = auditPrintTopology({ ...box, T: box.T.slice(3) });
    expect(open.status).toBe('invalid');
    expect(open.issues.find((issue) => issue.code === 'boundary-edge')!.count).toBe(3);
    expect(open.checks.signedVolume).toBe('not-run');
    [box.T[1], box.T[2]] = [box.T[2], box.T[1]];
    const winding = auditPrintTopology(box);
    expect(winding.issues.find((issue) => issue.code === 'inconsistent-winding')!.count).toBe(3);
    expect(winding.issues[0].vertices.length).toBeGreaterThan(0);
  });

  it('rejects three-face edges', () => {
    const box = solidBox();
    const mesh = {
      V: new Float32Array([...box.V, 0, -20, -30]),
      T: new Uint32Array([...box.T, 0, 1, 8]),
    };
    expect(codes(mesh)).toContain('non-manifold-edge');
  });

  it('rejects duplicate and zero-area faces before a kernel can remove them', () => {
    const box = solidBox();
    expect(
      codes({ ...box, T: new Uint32Array([...box.T, box.T[0], box.T[2], box.T[1]]) }),
    ).toContain('duplicate-face');
    expect(codes({ ...box, T: new Uint32Array([...box.T, 0, 0, 1]) })).toContain('degenerate-face');
    expect(
      codes({
        V: new Float32Array([...box.V, 0, 0, 0, 1, 0, 0, 2, 0, 0]),
        T: new Uint32Array([...box.T, 8, 9, 10]),
      }),
    ).toContain('degenerate-face');
  });

  it('keeps negative cavity shells without changing winding or counting them as bodies', () => {
    const box = solidBox();
    const cavity = reversed({ V: Float64Array.from(box.V, (v) => v / 2), T: box.T });
    const mesh = combine(box, cavity),
      original = structuredClone(mesh);
    const report = auditPrintTopology(mesh);
    expect(report.status).toBe('topology-checked');
    expect(report.signedVolumeMm3).toBe(52_500);
    expect([...report.shellVolumesMm3]).toEqual([60_000, -7_500]);
    expect(report.checks.shellContainment).toBe('not-run');
    expect(mesh).toEqual(original);
  });

  it('rejects reversed total winding and zero net volume', () => {
    const box = solidBox();
    expect(codes(reversed(box))).toContain('non-positive-volume');
    expect(codes(combine(box, reversed(box)))).toContain('non-positive-volume');
  });

  it('rejects crossing shells while leaving shell containment explicitly unchecked', () => {
    const box = solidBox();
    const overlapping = {
      V: Float64Array.from(box.V, (v, i) => v + (i % 3 === 0 ? 10 : 0)),
      T: box.T,
    };
    const report = auditPrintTopology(combine(box, overlapping));
    expect(report.status).toBe('invalid');
    expect(report.checks.nonAdjacentIntersections).toBe('failed');
    expect(report.issues.some((issue) => issue.code === 'surface-contact')).toBe(true);
    expect(report.signedVolumeMm3).toBe(120_000);
    expect(report.checks.selfIntersections).toBe('failed');
    const misplacedCavity = reversed({
      V: Float64Array.from(box.V, (v, i) => v / 2 + (i % 3 === 0 ? 100 : 0)),
      T: box.T,
    });
    const misplaced = auditPrintTopology(combine(box, misplacedCavity));
    expect(misplaced.checks.shellContainment).toBe('not-run');
    expect([...misplaced.shellVolumesMm3]).toEqual([60_000, -7_500]);
  });

  it('rejects folded adjacent faces despite closed manifold topology and positive volume', () => {
    const mesh = foldedOctahedron(),
      original = structuredClone(mesh);
    const report = auditPrintTopology(mesh);
    for (const check of ['buffers', 'faces', 'edges', 'vertexLinks', 'signedVolume'] as const)
      expect(report.checks[check]).toBe('passed');
    expect(report.signedVolumeMm3).toBeCloseTo(2 / 3, 10);
    expect(report.status).toBe('invalid');
    expect(report.checks.selfIntersections).toBe('failed');
    expect(report.intersections?.adjacentPairCount).toBeGreaterThan(0);
    expect(report.checks.shellContainment).toBe('not-run');
    expect(mesh).toEqual(original);
  });

  it('measures translated geometry stably and audits current buffers without stale cache reuse', () => {
    const box = solidBox();
    const translated = { V: Float64Array.from(box.V, (v) => v + 1e9), T: box.T };
    expect(auditPrintTopology(translated).signedVolumeMm3).toBe(60_000);
    getMeshTopology(box);
    box.T = box.T.slice(3);
    expect(auditPrintTopology(box).checks.edges).toBe('failed');
  });

  it('reports unused vertices with complete counts and bounded samples', () => {
    const box = solidBox();
    const mesh = { ...box, V: new Float32Array([...box.V, ...Array(300).fill(123)]) };
    const report = auditPrintTopology(mesh);
    expect(report.status).toBe('topology-checked');
    expect(report.signedVolumeMm3).toBe(60_000);
    expect(report.issues[0].severity).toBe('warning');
    expect(report.issues[0].count).toBe(100);
    expect(report.issues[0].vertices).toHaveLength(PRINT_TOPOLOGY_LIMITS.samples);
  });

  it('rejects malformed buffers, nonfinite coordinates, invalid indices and unsupported scales', () => {
    const box = solidBox();
    expect(codes({ V: [], T: [] })).toContain('invalid-buffer');
    expect(codes({ ...box, V: new Float32Array([0, 1]) })).toContain('invalid-buffer');
    const nonfinite = { ...box, V: box.V.slice() };
    nonfinite.V[0] = Infinity;
    expect(codes(nonfinite)).toContain('non-finite-vertex');
    for (const invalid of [-1, 1.5, 999])
      expect(codes({ ...box, T: [0, 1, invalid] })).toContain('invalid-index');
    expect(codes({ V: Float64Array.from(box.V, (v) => v * 1e-16), T: box.T })).toContain(
      'short-edge',
    );
    expect(codes({ V: Float64Array.from(box.V, (v) => v * 1e200), T: box.T })).toContain(
      'non-finite-face',
    );
    expect(codes({ ...box, V: { length: (PRINT_TOPOLOGY_LIMITS.vertices + 1) * 3 } })).toContain(
      'budget',
    );
  });

  it('throws structured topology errors without altering the input', () => {
    const box = solidBox();
    const bad = { ...box, T: box.T.slice(3) },
      original = structuredClone(bad);
    expect(() => assertPrintTopology(bad, 'Source')).toThrow(PrintTopologyError);
    try {
      assertPrintTopology(bad, 'Source');
    } catch (error) {
      const failure = error as PrintTopologyError;
      expect(failure.message).toContain('Source failed topology checks');
      expect(failure.report.status).toBe('invalid');
    }
    expect(bad).toEqual(original);
    expect(assertPrintTopology(box, 'Source').status).toBe('topology-checked');
  });
});
