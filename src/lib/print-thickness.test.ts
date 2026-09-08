import { describe, expect, it } from 'vitest';
import { samplePrintThickness, PRINT_THICKNESS_LIMITS } from './print-thickness';
import { solidBox } from '../test/fixtures/solid';
import type { TopologyMesh } from './mesh-topology';

const settings = { maxSamples: 12, minimumMm: 1 };
function combine(a: TopologyMesh, b: TopologyMesh): TopologyMesh {
  return {
    V: Float64Array.from([...Array.from(a.V), ...Array.from(b.V)]),
    T: Uint32Array.from([...Array.from(a.T), ...Array.from(b.T, (id) => id + a.V.length / 3)]),
  };
}
describe('bounded normal-chord thickness samples', () => {
  it('measures known box dimensions without claiming a global minimum', () => {
    const mesh = solidBox(),
      original = structuredClone(mesh);
    const report = samplePrintThickness(mesh, settings, 1e-10);
    expect(report.status).toBe('sampled');
    expect(report.resolvedCount).toBe(12);
    expect(report.minimumMeasuredMm).toBe(30);
    expect(report.belowMinimumCount).toBe(0);
    expect(report.resolvedTriangleAreaFraction).toBeCloseTo(1, 10);
    expect(report.samples.map((s) => s.distanceMm).sort((a, b) => a! - b!)).toEqual([
      30, 30, 30, 30, 40, 40, 40, 40, 50, 50, 50, 50,
    ]);
    expect(samplePrintThickness(mesh, settings, 1e-10)).toEqual(report);
    expect(mesh).toEqual(original);
  });

  it('detects thin plates and respects scale and translation', () => {
    const mesh = solidBox();
    const thin = { ...mesh, V: Float64Array.from(mesh.V, (v, i) => (i % 3 === 2 ? v * 0.002 : v)) };
    const report = samplePrintThickness(thin, settings, 1e-10);
    expect(report.minimumMeasuredMm).toBeCloseTo(0.1, 10);
    expect(report.belowMinimumCount).toBe(4);
    const translated = { ...thin, V: Float64Array.from(thin.V, (v) => v + 1e6) };
    expect(samplePrintThickness(translated, settings, 1e-8).minimumMeasuredMm).toBeCloseTo(0.1, 8);
  });

  it('stops at a cavity boundary and casts from inward shells into material', () => {
    const box = solidBox(),
      T = box.T.slice();
    for (let i = 0; i < T.length; i += 3) [T[i + 1], T[i + 2]] = [T[i + 2], T[i + 1]];
    const mesh = combine(box, { V: Float64Array.from(box.V, (v) => v / 2), T });
    const report = samplePrintThickness(mesh, { ...settings, maxSamples: 24, minimumMm: 8 }, 1e-10);
    expect(report.status).toBe('sampled');
    expect(report.minimumMeasuredMm).toBeCloseTo(7.5, 10);
    for (const sample of report.samples) {
      if (sample.triangle >= 12) {
        expect(sample.distanceMm).toBeLessThanOrEqual(12.5);
        expect(sample.oppositeTriangle).toBeLessThan(12);
      }
    }
  });

  it('does not measure across empty space to a different body', () => {
    const box = solidBox();
    const mesh = combine(box, {
      ...box,
      V: Float64Array.from(box.V, (v, i) => v + (i % 3 === 0 ? 100 : 0)),
    });
    const report = samplePrintThickness(mesh, { ...settings, maxSamples: 24 }, 1e-10);
    expect(report.resolvedCount).toBe(24);
    expect(report.minimumMeasuredMm).toBe(30);
    for (const sample of report.samples)
      expect(sample.oppositeTriangle! < 12).toBe(sample.triangle < 12);
  });

  it('reserves every requested priority face and reports finite sampling scope', () => {
    const priorityTriangles = [11, 1];
    const report = samplePrintThickness(
      solidBox(),
      { ...settings, maxSamples: 4, priorityTriangles },
      1e-10,
    );
    expect(report.samples.slice(0, 2).map((s) => [s.triangle, s.priority])).toEqual([
      [11, true],
      [1, true],
    ]);
    expect(report.samples).toHaveLength(4);
    expect(report.resolvedTriangleAreaFraction).toBeLessThan(1);
    priorityTriangles[0] = 0;
    expect(report.settings.priorityTriangles).toEqual([11, 1]);
  });

  it('reports budget-truncated rays as unresolved even if an early candidate was found', () => {
    const report = samplePrintThickness(solidBox(), settings, 1e-10, 13);
    expect(report.status).toBe('partial');
    expect(report.budgetExhausted).toBe(true);
    expect(report.work).toBe(13);
    expect(report.resolvedCount).toBe(1);
    expect(
      report.samples.slice(1).every((s) => s.distanceMm === null && s.unresolved === 'work-budget'),
    ).toBe(true);
    expect(samplePrintThickness(solidBox(), settings, 1e-10, 0).status).toBe('unavailable');
  });

  it('keeps ambiguous edge hits and near-origin intersections unresolved', () => {
    const box = solidBox();
    // Shift the top triangulation's diagonal through the first bottom sample.
    // Direct sampler fixture intentionally bypasses the caller's solid audit.
    const source = {
      V: [0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 1, 1, 2, 1, 0, 3, 1],
      T: [0, 2, 1, 3, 4, 5],
    };
    const edge = samplePrintThickness(
      source,
      { maxSamples: 1, minimumMm: 1, priorityTriangles: [0] },
      1e-10,
    );
    expect(edge.samples[0].unresolved).toBe('ambiguous-hit');
    const tiny = { ...box, V: Float64Array.from(box.V, (v, i) => (i % 3 === 2 ? v * 1e-12 : v)) };
    const near = samplePrintThickness(
      tiny,
      { ...settings, maxSamples: 1, priorityTriangles: [0] },
      1e-10,
    );
    expect(near.samples[0].unresolved).toBe('near-origin');
    expect(near.minimumMeasuredMm).toBeNull();
  });

  it('rejects invalid assumptions and priority selections without silently reducing them', () => {
    for (const maxSamples of [0, 1.5, PRINT_THICKNESS_LIMITS.samples + 1])
      expect(() => samplePrintThickness(solidBox(), { ...settings, maxSamples }, 1e-10)).toThrow(
        'samples',
      );
    for (const minimumMm of [0, -1, Infinity])
      expect(() => samplePrintThickness(solidBox(), { ...settings, minimumMm }, 1e-10)).toThrow(
        'Minimum',
      );
    for (const priorityTriangles of [[0, 0], [-1], [12], [0, 1, 2]])
      expect(() =>
        samplePrintThickness(solidBox(), { ...settings, maxSamples: 2, priorityTriangles }, 1e-10),
      ).toThrow('Priority');
    expect(() => samplePrintThickness(solidBox(), settings, -1)).toThrow('tolerance');
    expect(() => samplePrintThickness(solidBox(), settings, 1e-10, -1)).toThrow('budget');
  });
});
