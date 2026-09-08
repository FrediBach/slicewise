// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { Mesh } from 'three';
import { solidBox } from '../test/fixtures/solid';
import { serializeThreeMf } from './three-mf';

it('packages millimeter units, safe object names, resource and build relationships deterministically', () => {
  const mesh = solidBox();
  const name = 'Cube <&> "雪"';
  const bytes = serializeThreeMf(mesh, name);
  expect(serializeThreeMf(mesh, name)).toEqual(bytes);
  const files = unzipSync(new Uint8Array(bytes));
  expect(Object.keys(files).sort()).toEqual([
    '3D/3dmodel.model',
    '[Content_Types].xml',
    '_rels/.rels',
  ]);
  const parse = (part: string) =>
    new DOMParser().parseFromString(strFromU8(files[part]), 'application/xml');
  for (const part of Object.keys(files))
    expect(parse(part).querySelector('parsererror')).toBeNull();
  const model = parse('3D/3dmodel.model');
  expect(model.documentElement.namespaceURI).toBe(
    'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
  );
  expect(model.documentElement.getAttribute('unit')).toBe('millimeter');
  expect(model.querySelector('object')?.getAttribute('name')).toBe(name);
  expect(model.querySelector('item')?.getAttribute('objectid')).toBe(
    model.querySelector('object')?.getAttribute('id'),
  );
  expect(model.querySelector('item')?.hasAttribute('transform')).toBe(false);
  expect(parse('_rels/.rels').querySelector('Relationship')?.getAttribute('Target')).toBe(
    '/3D/3dmodel.model',
  );
  expect(
    parse('[Content_Types].xml').querySelector('[Extension="model"]')?.getAttribute('ContentType'),
  ).toBe('application/vnd.ms-package.3dmanufacturing-3dmodel+xml');
  const cleaned = unzipSync(new Uint8Array(serializeThreeMf(mesh, 'bad\u0000\ud800name')));
  expect(strFromU8(cleaned['3D/3dmodel.model'])).toContain('name="badname"');
});
it('round-trips exact indexed geometry, winding and placement through ThreeMFLoader', () => {
  const mesh = solidBox();
  mesh.V = mesh.V.map((v, i) => v + [123.25, -67.5, 25][i % 3]);
  const original = structuredClone(mesh);
  const group = new ThreeMFLoader().parse(serializeThreeMf(mesh, 'Placed box'));
  const meshes: Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  expect(meshes).toHaveLength(1);
  const result = meshes[0];
  expect(result.name).toBe('Placed box');
  expect(Array.from(result.geometry.getAttribute('position').array)).toEqual(Array.from(mesh.V));
  expect(Array.from(result.geometry.index!.array)).toEqual(Array.from(mesh.T));
  expect(result.matrix.elements).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  expect(Array.from(mesh.V)).toEqual(Array.from(original.V));
  expect(Array.from(mesh.T)).toEqual(Array.from(original.T));
  result.geometry.dispose();
});
it('rejects malformed mesh buffers before packaging', () => {
  const mesh = solidBox();
  expect(() => serializeThreeMf({ ...mesh, T: new Uint32Array([0, 1, 2]) }, 'bad')).toThrow(
    /budget/,
  );
  mesh.V[0] = NaN;
  expect(() => serializeThreeMf(mesh, 'bad')).toThrow(/Invalid/);
});
