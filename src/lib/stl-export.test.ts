import { expect, it } from 'vitest';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { solidBox } from '../test/fixtures/solid';
import { serializeBinaryStl } from './stl-export';
import { prepareStlExport } from './three-d-export';
import { auditPrintTopology } from './print-validation';
import type { ThreeDReply } from './three-d-project';

it('round-trips exact ordered vertices, winding and mm bounds through an independent STL reader', () => {
  const mesh = solidBox();
  mesh.V = mesh.V.map((v, i) => v + [123, -67, 25][i % 3]);
  const before = structuredClone(mesh);
  const bytes = serializeBinaryStl(mesh);
  expect(bytes.byteLength).toBe(84 + (mesh.T.length / 3) * 50);
  const geometry = new STLLoader().parse(bytes);
  const positions = geometry.getAttribute('position').array;
  expect(Array.from(positions)).toEqual(
    Array.from(mesh.T).flatMap((index) => Array.from(mesh.V.subarray(index * 3, index * 3 + 3))),
  );
  geometry.computeBoundingBox();
  expect(geometry.boundingBox!.min.toArray()).toEqual([103, -82, 0]);
  expect(geometry.boundingBox!.max.toArray()).toEqual([143, -52, 50]);
  expect(mesh).toEqual(before);
  expect(serializeBinaryStl(mesh)).toEqual(bytes);
  geometry.dispose();
});
it('rejects invalid serializer inputs and incomplete or multi-body export gates', () => {
  const mesh = solidBox();
  expect(() => serializeBinaryStl({ ...mesh, T: new Uint32Array([0, 0, 0]) })).toThrow(
    /Degenerate/,
  );
  expect(() => serializeBinaryStl({ ...mesh, T: new Uint32Array([0, 1, 999]) })).toThrow(/Invalid/);
  const report = auditPrintTopology(mesh);
  const reply: ThreeDReply = {
    id: 1,
    sourceVersion: 1,
    artifact: { ...mesh, min: [-20, -15, -25], max: [20, 15, 25], dimensions: [40, 30, 50] },
    preparation: { status: 'accepted', message: '', bodyCount: 1, checks: report.checks },
  };
  expect(prepareStlExport(reply)).toBeInstanceOf(ArrayBuffer);
  for (const check of Object.keys(report.checks).filter((key) => key !== 'manufacturing')) {
    expect(
      prepareStlExport({
        ...reply,
        preparation: { ...reply.preparation!, checks: { ...report.checks, [check]: 'not-run' } },
      }),
    ).toBeUndefined();
  }
  expect(
    prepareStlExport({ ...reply, preparation: { ...reply.preparation!, bodyCount: 2 } }),
  ).toBeUndefined();
  expect(
    prepareStlExport({ ...reply, preparation: { ...reply.preparation!, status: 'rejected' } }),
  ).toBeUndefined();
});
