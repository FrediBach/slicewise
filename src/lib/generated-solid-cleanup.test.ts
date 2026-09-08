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
