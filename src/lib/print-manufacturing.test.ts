import { describe, expect, it } from 'vitest';
import {
  auditPrintManufacturing,
  PRINT_MANUFACTURING_SAMPLES,
  type PrintManufacturingSettings,
} from './print-manufacturing';
import { solidBox, foldedOctahedron } from '../test/fixtures/solid';
import type { TopologyMesh } from './mesh-topology';

const settings: PrintManufacturingSettings = {
  buildVolume: { min: [-100, -100, 0], max: [100, 100, 200] },
  bedToleranceMm: 0.05,
  overhangFromVerticalDeg: 45,
};
function placedBox(bottom = 0, x = 0): TopologyMesh {
  const box = solidBox();
  return {
    ...box,
    V: Float64Array.from(box.V, (v, i) => v + (i % 3 === 2 ? 25 + bottom : i % 3 === 0 ? x : 0)),
  };
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

describe('initial manufacturing screen', () => {
  it('measures a placed box while keeping thickness and stability explicitly unperformed', () => {
    const mesh = placedBox(),
      original = structuredClone(mesh);
    const report = auditPrintManufacturing(mesh, settings);
    expect(report.status).toBe('screened');
    expect(report.advisories).toEqual([]);
    expect(report.thickness).toBe('not-run');
    expect(report.stability).toBe('not-run');
    expect(report.geometry.checks.manufacturing).toBe('not-run');
    expect(report.measurements).toEqual({
      bounds: { min: [-20, -15, 0], max: [20, 15, 50], sizeMm: [40, 30, 50] },
      bodyCount: 1,
      fitsBuildVolume: true,
      belowBedMm: 0,
      lowestPointAboveBedMm: 0,
      nearBedProjectedAreaMm2: 1200,
      overhangAreaMm2: 0,
      overhangTriangleCount: 0,
      overhangTriangles: new Uint32Array(),
    });
    expect(auditPrintManufacturing(mesh, settings)).toEqual(report);
    expect(mesh).toEqual(original);
  });

  it('reports floating undersides as overhangs, preserving original face IDs', () => {
    const report = auditPrintManufacturing(placedBox(10), settings);
    expect(report.advisories).toEqual(['no-near-bed-area', 'overhangs']);
    expect(report.measurements?.lowestPointAboveBedMm).toBe(10);
    expect(report.measurements?.nearBedProjectedAreaMm2).toBe(0);
    expect(report.measurements?.overhangAreaMm2).toBe(1200);
    expect([...report.measurements!.overhangTriangles]).toEqual([0, 1]);
    expect(
      auditPrintManufacturing(placedBox(10), { ...settings, overhangFromVerticalDeg: 90 })
        .measurements?.overhangTriangleCount,
    ).toBe(0);
  });

  it('reports actual placement and fixed build bounds without silently dropping to bed', () => {
    const below = auditPrintManufacturing(placedBox(-5), settings);
    expect(below.advisories).toContain('below-bed');
    expect(below.advisories).toContain('outside-build-volume');
    expect(below.measurements?.belowBedMm).toBe(5);
    expect(below.measurements?.overhangTriangleCount).toBe(0);
    expect(auditPrintManufacturing(placedBox(0, 90), settings).measurements?.fitsBuildVolume).toBe(
      false,
    );
    expect(auditPrintManufacturing(placedBox(150), settings).measurements?.fitsBuildVolume).toBe(
      true,
    );
    expect(auditPrintManufacturing(placedBox(151), settings).measurements?.fitsBuildVolume).toBe(
      false,
    );
    const near = auditPrintManufacturing(placedBox(-0.01), settings);
    expect(near.measurements?.fitsBuildVolume).toBe(false);
    expect(near.advisories).not.toContain('below-bed');
    expect(near.measurements?.nearBedProjectedAreaMm2).toBe(1200);
  });

  it('clips sloping faces into the bed band and applies the declared vertical angle convention', () => {
    const box = solidBox();
    const V = Float64Array.from(box.V);
    for (let i = 0; i < V.length; i += 3) V[i + 2] += V[i] + 45;
    const mesh = { V, T: box.T };
    const report = auditPrintManufacturing(mesh, settings);
    expect(report.measurements?.nearBedProjectedAreaMm2).toBeCloseTo(30 * 0.05, 8);
    expect(report.measurements?.overhangTriangleCount).toBe(0);
    const lowerThreshold = auditPrintManufacturing(mesh, {
      ...settings,
      overhangFromVerticalDeg: 44,
    });
    expect(lowerThreshold.measurements?.overhangTriangleCount).toBe(2);
    expect(lowerThreshold.measurements?.overhangAreaMm2).toBeCloseTo(
      (40 - 0.05) * 30 * Math.sqrt(2),
      8,
    );
    expect(
      auditPrintManufacturing(mesh, { ...settings, bedToleranceMm: 0 }).measurements
        ?.nearBedProjectedAreaMm2,
    ).toBe(0);
  });

  it('distinguishes multiple bodies from cavities without claiming each body has support', () => {
    const multiple = auditPrintManufacturing(combine(placedBox(), placedBox(10, 60)), settings);
    expect(multiple.measurements?.bodyCount).toBe(2);
    expect(multiple.measurements?.nearBedProjectedAreaMm2).toBe(1200);
    expect(multiple.advisories).toContain('multiple-bodies');
    expect(multiple.advisories).toContain('overhangs');
    const cavity = placedBox();
    const inward = Uint32Array.from(cavity.T);
    for (let i = 0; i < inward.length; i += 3)
      [inward[i + 1], inward[i + 2]] = [inward[i + 2], inward[i + 1]];
    const hollow = auditPrintManufacturing(
      combine(placedBox(), {
        V: Float64Array.from(cavity.V, (v, i) => v / 2 + (i % 3 === 2 ? 12.5 : 0)),
        T: inward,
      }),
      settings,
    );
    expect(hollow.measurements?.bodyCount).toBe(1);
    expect(hollow.measurements?.overhangAreaMm2).toBe(300);
    expect(hollow.advisories).not.toContain('multiple-bodies');
  });

  it('keeps counts complete when highlighted face IDs exceed the sample cap', () => {
    const mesh = combine(...Array.from({ length: 20 }, (_, i) => placedBox(10, i * 50)));
    const report = auditPrintManufacturing(mesh, settings);
    expect(report.measurements?.overhangTriangleCount).toBe(40);
    expect(report.measurements?.overhangTriangles).toHaveLength(PRINT_MANUFACTURING_SAMPLES);
    expect(report.measurements?.overhangAreaMm2).toBe(24_000);
  });

  it('ignores unused coordinates and detaches settings from caller mutations', () => {
    const box = placedBox();
    const localSettings = structuredClone(settings);
    const report = auditPrintManufacturing(
      { ...box, V: Float64Array.from([...Array.from(box.V), 1e20, 1e20, 1e20]) },
      localSettings,
    );
    expect(report.measurements).toEqual(auditPrintManufacturing(box, settings).measurements);
    expect(report.geometry.issues[0].code).toBe('unused-vertex');
    localSettings.buildVolume.min[0] = 0;
    expect(report.settings.buildVolume.min[0]).toBe(-100);
  });

  it('returns geometry diagnostics instead of screening invalid or newly changed buffers', () => {
    const mesh = placedBox();
    expect(auditPrintManufacturing(mesh, settings).status).toBe('screened');
    const report = auditPrintManufacturing({ ...mesh, T: Array.from(mesh.T).slice(3) }, settings);
    expect(report.status).toBe('unavailable');
    expect(report.measurements).toBeNull();
    expect(report.geometry.issues.some((i) => i.code === 'boundary-edge')).toBe(true);
    expect(auditPrintManufacturing(foldedOctahedron(), settings).status).toBe('unavailable');
    const indices = Uint32Array.from(mesh.T);
    mesh.T = indices;
    expect(auditPrintManufacturing(mesh, settings).status).toBe('screened');
    indices[0] = indices[1];
    expect(auditPrintManufacturing(mesh, settings).unavailableReason).toBe('geometry-rejected');
  });

  it('runs optional thickness estimates with advisories while retaining incomplete manufacturing status', () => {
    const box = placedBox();
    const mesh = { ...box, V: Float64Array.from(box.V, (v, i) => (i % 3 === 2 ? v * 0.002 : v)) };
    const options = {
      ...settings,
      thickness: { maxSamples: 12, minimumMm: 1, priorityTriangles: [0, 1] },
    };
    const report = auditPrintManufacturing(mesh, options);
    expect(report.status).toBe('screened');
    expect(report.thickness).not.toBe('not-run');
    if (report.thickness === 'not-run') throw new Error('Expected sampling report');
    expect(report.thickness.minimumMeasuredMm).toBeCloseTo(0.1, 10);
    expect(report.advisories).toContain('thin-samples');
    expect(report.geometry.checks.manufacturing).toBe('not-run');
    expect(report.stability).toBe('not-run');
    options.thickness.priorityTriangles[0] = 2;
    expect(report.settings.thickness?.priorityTriangles).toEqual([0, 1]);
    expect(auditPrintManufacturing(foldedOctahedron(), options).thickness).toBe('not-run');
    expect(() =>
      auditPrintManufacturing(mesh, {
        ...options,
        thickness: { maxSamples: 1, minimumMm: 1, priorityTriangles: [0, 1] },
      }),
    ).toThrow('Priority');
  });

  it('rejects malformed build bounds and invalid diagnostic assumptions', () => {
    for (const bedToleranceMm of [-1, NaN, Infinity, 2])
      expect(() => auditPrintManufacturing(placedBox(), { ...settings, bedToleranceMm })).toThrow(
        'Bed tolerance',
      );
    for (const overhangFromVerticalDeg of [-1, NaN, Infinity, 91])
      expect(() =>
        auditPrintManufacturing(placedBox(), { ...settings, overhangFromVerticalDeg }),
      ).toThrow('Overhang threshold');
    for (const min of [
      [100, -100, 0],
      [NaN, 0, 0],
      [0, 0],
    ] as [number, number, number][])
      expect(() =>
        auditPrintManufacturing(placedBox(), {
          ...settings,
          buildVolume: { ...settings.buildVolume, min },
        }),
      ).toThrow('Build volume');
  });
});
