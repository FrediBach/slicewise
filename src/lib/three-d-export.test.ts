import { expect, it } from 'vitest';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { solidBox } from '../test/fixtures/solid';
import { createThreeDProject, type ThreeDRequest } from './three-d-project';
import { previewThreeD } from './three-d-preparation';
import { packageThreeDExports, prepareStlExport } from './three-d-export';

function request(): ThreeDRequest {
  return {
    id: 1,
    source: { id: 'box', version: 1, name: 'Box', mesh: solidBox(), imported: false, upY: false },
    project: {
      ...createThreeDProject('box'),
      sizeConfirmed: true,
      longestMm: 80,
      rotation: [90, 0, 30],
      position: [7, -11, 3],
    },
    settings: { axis: 'up', lines: 3, objectStretch: true, objectScaleX: 125 },
  };
}

it('exports the exact placed untreated source without treatment preparation or supported slices', () => {
  const input = request();
  // Drawing-only fields must not prevent exporting the source surface.
  input.settings.axis = 'geodesic';
  const before = structuredClone(input.source.mesh);
  const { reply } = previewThreeD(input);
  expect(reply.slices?.error).toBeTruthy();
  packageThreeDExports(input, reply);
  expect(reply.preparation).toBeUndefined();
  expect(reply.stlError).toBeUndefined();
  expect(reply.threeMfError).toBeUndefined();
  expect(reply.threeMf).toBeInstanceOf(ArrayBuffer);
  const geometry = new STLLoader().parse(reply.stl!);
  const { V, T } = reply.artifact!;
  expect(Array.from(geometry.getAttribute('position').array)).toEqual(
    Array.from(T).flatMap((i) => Array.from(V.subarray(i * 3, i * 3 + 3))),
  );
  expect(input.source.mesh).toEqual(before);
  geometry.dispose();
});

it('requires confirmed sizing and never bypasses failed treatment audits', () => {
  const input = request();
  const { reply } = previewThreeD(input);
  packageThreeDExports({ ...input, project: { ...input.project, sizeConfirmed: false } }, reply);
  expect(reply.stl).toBeUndefined();
  expect(reply.threeMf).toBeUndefined();
  packageThreeDExports(input, reply);
  expect(reply.stl).toBeInstanceOf(ArrayBuffer);
  expect(
    prepareStlExport({ ...reply, preparation: { status: 'rejected', message: 'Invalid' } }),
  ).toBeUndefined();
  const prepared = {
    ...reply,
    preparation: { status: 'accepted' as const, message: 'Incomplete' },
  };
  packageThreeDExports({ ...input, purpose: 'prepare' }, prepared);
  expect(prepared.stl).toBeUndefined();
  expect(prepared.threeMf).toBeUndefined();
});

it('retains source inspection and reports serializer errors for invalid geometry', () => {
  const input = request();
  const { reply } = previewThreeD(input);
  reply.artifact!.T = new Uint32Array([0, 0, 0]);
  const artifact = reply.artifact;
  packageThreeDExports(input, reply);
  expect(reply.stl).toBeUndefined();
  expect(reply.stlError).toMatch(/Degenerate/);
  expect(reply.artifact).toBe(artifact);
  expect(reply.error).toBeUndefined();
});
