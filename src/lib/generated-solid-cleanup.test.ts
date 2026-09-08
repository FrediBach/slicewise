import { expect, it } from 'vitest';
import { cleanGeneratedSolid } from './generated-solid-cleanup';
import { solidBox } from '../test/fixtures/solid';
import { auditPrintTopology } from './print-validation';
it('welds only exact duplicates and removes collapsed faces without moving the surface', () => {
  const box = solidBox();
  const duplicate = box.V.length / 3;
  const V = Float32Array.from([...box.V, ...box.V.slice(0, 3), 123, 456, 789]);
  const T = Uint32Array.from([...box.T, 0, duplicate, 1]);
  T[0] = duplicate;
  const input = { V, T },
    before = structuredClone(input);
  const result = cleanGeneratedSolid(input, 'Result');
  expect(result.mesh).toEqual(box);
  expect(result.report).toEqual({
    stage: 'Result',
    toleranceMm: 0,
    maximumDisplacementMm: 0,
    mergedVertices: 1,
    removedFaces: 1,
    removedUnusedVertices: 1,
  });
  expect(input).toEqual(before);
  expect(auditPrintTopology(result.mesh).status).toBe('topology-checked');
  expect(cleanGeneratedSolid(result.mesh, 'Result').mesh).toBe(result.mesh);
});
it('retains near-coincident coordinates and nonzero slivers, and never fills holes', () => {
  const mesh = {
    V: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1e-20, 0]),
    T: Uint32Array.from([0, 1, 2]),
  };
  expect(cleanGeneratedSolid(mesh, 'Result').mesh).toBe(mesh);
  expect(auditPrintTopology(mesh).status).toBe('invalid');
});

it('bounds welding across spatial cells without chaining vertex movement', () => {
  const tolerance = 0.00001;
  // B lies across a bucket boundary from A; C is close to B but outside A's tolerance.
  const mesh = {
    V: Float32Array.from([0.000009, 0, 0, 0.000017, 0, 0, 0.000025, 0, 0, 0, 1, 0, 0, 0, 1]),
    T: Uint32Array.from([0, 3, 4, 1, 3, 4, 2, 3, 4]),
  };
  const before = structuredClone(mesh);
  const exact = cleanGeneratedSolid(mesh, 'Result');
  expect(exact.report.mergedVertices).toBe(0);
  const result = cleanGeneratedSolid(mesh, 'Result', tolerance);
  expect(result.report.mergedVertices).toBe(1);
  expect(result.report.maximumDisplacementMm).toBeGreaterThan(0);
  expect(result.report.maximumDisplacementMm).toBeLessThanOrEqual(tolerance);
  expect(result.mesh.V).toContain(mesh.V[6]);
  expect(mesh).toEqual(before);
  expect(cleanGeneratedSolid(mesh, 'Result', tolerance)).toEqual(result);
  // Cleanup is not itself acceptance: these duplicate/open faces must still fail.
  expect(auditPrintTopology(result.mesh).status).toBe('invalid');
  expect(() => cleanGeneratedSolid(mesh, 'Result', 0.1)).toThrow('tolerance');
});
