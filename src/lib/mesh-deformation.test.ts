import { describe, expect, it } from 'vitest';
import { deformMesh } from './mesh-deformation';
import { OBJECT_DEFAULTS, resolveObjectSettings, type ObjectSettings } from './object-settings';
import { vertexNormals } from './mesh';
import { getMeshTopology } from './mesh-topology';
import { computeContours, type ContourMesh } from './contour-engine';
import { contourSettings } from '../test/fixtures/contours';
import { normalizeParameterSnapshot } from './parameter-migrations';

function box(): ContourMesh {
  const V = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5,
    0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ]);
  const T = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ]);
  return { V, T, N: vertexNormals(V, T), preserveSurface: true };
}
const enabled = { ...OBJECT_DEFAULTS, objectEnabled: true };

describe('object deformation', () => {
  it('preserves neutral output exactly, including the original mesh and its caches', () => {
    const mesh = box();
    expect(deformMesh(mesh, {})).toBe(mesh);
    expect(deformMesh(mesh, enabled)).toBe(mesh);
    expect(deformMesh(mesh, { objectTwistAngle: 90 })).toBe(mesh);
    expect(deformMesh(mesh, { ...enabled, objectTwist: false, objectTwistAngle: 90 })).toBe(mesh);
    const a = computeContours(mesh, contourSettings, false);
    const b = computeContours(mesh, { ...contourSettings, ...enabled }, false);
    expect(b.svg).toBe(a.svg);
    expect(b.toolpaths).toEqual(a.toolpaths);
  });

  it('stretches before rotating, transforms normals, and never edits the source', () => {
    const mesh = box(),
      original = structuredClone(mesh);
    const result = deformMesh(mesh, { ...enabled, objectScaleX: 200, objectRotationZ: 90 });
    expect(Array.from(result.V).slice(0, 3)).toEqual([0.5, -1, -0.5]);
    expect(result.T).toBe(mesh.T);
    expect(result.preserveSurface).toBe(true);
    expect(mesh).toEqual(original);
    const n = [mesh.N![0] / 2, mesh.N![1], mesh.N![2]],
      length = Math.hypot(...n);
    expect(result.N![0]).toBeCloseTo(-n[1] / length);
    expect(result.N![1]).toBeCloseTo(n[0] / length);
    expect(result.N![2]).toBeCloseTo(n[2] / length);
  });

  it('tapers about the axis and twists equally on either side of the centre', () => {
    const mesh = box();
    const tapered = deformMesh(mesh, { ...enabled, objectTaperAmount: 50 });
    expect(tapered.V[0]).toBeCloseTo(-0.75);
    expect(tapered.V[12]).toBeCloseTo(-0.25);
    expect(tapered.V[14]).toBe(0.5);
    const twisted = deformMesh(mesh, { ...enabled, objectTwistAngle: 180 });
    expect(twisted.V[0]).toBeCloseTo(-0.5);
    expect(twisted.V[1]).toBeCloseTo(0.5);
    expect(twisted.V[12]).toBeCloseTo(0.5);
    expect(twisted.V[13]).toBeCloseTo(-0.5);
  });

  it('bends along a circular centreline and approaches identity continuously', () => {
    const mesh = box();
    const bend = deformMesh(mesh, { ...enabled, objectBendAngle: 90 });
    const k = Math.PI / 2,
      theta = Math.PI / 4;
    expect(bend.V[12]).toBeCloseTo(-0.5 * Math.cos(theta) + (1 - Math.cos(theta)) / k);
    expect(bend.V[13]).toBeCloseTo(-0.5);
    expect(bend.V[14]).toBeCloseTo(Math.sin(theta) / k + 0.5 * Math.sin(theta));
    const tiny = deformMesh(mesh, { ...enabled, objectBendAngle: 1e-7 });
    for (let i = 0; i < mesh.V.length; i++) expect(tiny.V[i]).toBeCloseTo(mesh.V[i], 6);
  });

  it.each(['x', 'y', 'z'] as const)(
    'refines shared faces without opening a closed mesh on axis %s',
    (axis) => {
      const mesh = box();
      const result = deformMesh(mesh, {
        ...enabled,
        objectTaperAxis: axis,
        objectTwistAxis: axis,
        objectBendAxis: axis,
        objectTaperAmount: 25,
        objectTwistAngle: 60,
        objectBendAngle: 30,
        objectBendDirection: 35,
      });
      expect(result.T.length).toBeGreaterThan(mesh.T.length);
      expect(result.T.length / 3).toBeLessThanOrEqual(250000);
      expect(Array.from(result.V).every(Number.isFinite)).toBe(true);
      expect(Array.from(result.N!).every(Number.isFinite)).toBe(true);
      const topology = getMeshTopology(result);
      expect(topology.boundaryEdges.length).toBe(0);
      expect(topology.nonManifoldEdges.length).toBe(0);
      expect(topology.degenerateTriangleCount).toBe(0);
      expect(topology.invalidTriangleCount).toBe(0);
      expect(topology.componentCount).toBe(1);
      expect(topology.vertexCount - topology.edgeLengths.length + topology.triangleCount).toBe(2);
    },
  );

  it('caches camera-independent variants with bounded eviction and source isolation', () => {
    const mesh = box();
    const first = deformMesh(mesh, { ...enabled, objectScaleX: 120 });
    expect(deformMesh(mesh, { ...enabled, objectScaleX: 120 })).toBe(first);
    expect(
      deformMesh(mesh, {
        ...enabled,
        objectScaleX: 120,
        objectTwist: false,
        objectTwistAngle: 180,
        objectBendDirection: 45,
      }),
    ).toBe(first);
    for (const objectScaleX of [130, 140, 150]) deformMesh(mesh, { ...enabled, objectScaleX });
    expect(deformMesh(mesh, { ...enabled, objectScaleX: 120 })).not.toBe(first);
    expect(deformMesh(box(), { ...enabled, objectScaleX: 120 })).not.toBe(first);
  });

  it('reports excessive refinement instead of silently returning a cracked or partial surface', () => {
    const mesh = box();
    const faces = mesh.T;
    mesh.T = Uint32Array.from({ length: 190000 * 3 }, (_, i) => faces[i % faces.length]);
    const original = mesh.V;
    expect(() => deformMesh(mesh, { ...enabled, objectTwistAngle: 90 })).toThrow(
      'Object deformation needs too many triangles',
    );
    expect(mesh.V).toBe(original);
    expect(mesh.T.length / 3).toBe(190000);
    expect(deformMesh(mesh, enabled)).toBe(mesh);
  });

  it('retains line-art sources and removes terrain capabilities only for transformed geometry', () => {
    const mesh = box();
    mesh.terrain = true;
    expect(deformMesh(mesh, enabled).terrain).toBe(true);
    expect(deformMesh(mesh, { ...enabled, objectRotationX: 45 }).terrain).toBe(false);
    const lineArt = { ...mesh, lineArt: { offsets: new Uint32Array([0, 8]) } };
    expect(deformMesh(lineArt, { ...enabled, objectTwistAngle: 90 })).toBe(lineArt);
  });

  it('normalizes saved values and preserves explicit neutral values and toggles', () => {
    expect(resolveObjectSettings({})).toEqual(OBJECT_DEFAULTS);
    const malformed = {
      objectEnabled: true,
      objectScaleX: 0,
      objectScaleY: NaN,
      objectTwistAngle: Infinity,
      objectTaperAmount: -200,
      objectBendAxis: 'bad',
      objectBend: false,
    };
    const restored = normalizeParameterSnapshot({ ...contourSettings, ...malformed } as never);
    expect(restored.objectScaleX).toBe(20);
    expect(restored.objectScaleY).toBe(100);
    expect(restored.objectTwistAngle).toBe(0);
    expect(restored.objectTaperAmount).toBe(-80);
    expect(restored.objectBendAxis).toBe('z');
    expect(restored.objectBend).toBe(false);
  });

  it('keeps extreme settings finite, including flat and empty inputs', () => {
    const extreme: Partial<ObjectSettings> = {
      ...enabled,
      objectScaleX: 300,
      objectScaleZ: 20,
      objectTaperAmount: 80,
      objectTwistAngle: 360,
      objectBendAngle: -180,
    };
    const flat = box();
    for (let i = 2; i < flat.V.length; i += 3) (flat.V as Float32Array)[i] = 0;
    for (const mesh of [box(), flat]) {
      const result = deformMesh(mesh, extreme);
      expect(Array.from(result.V).every(Number.isFinite)).toBe(true);
      expect(Array.from(result.N!).every(Number.isFinite)).toBe(true);
    }
    expect(
      Array.from(deformMesh(box(), { ...enabled, objectBendAngle: Number.MIN_VALUE }).V).every(
        Number.isFinite,
      ),
    ).toBe(true);
    const empty = { V: new Float32Array(), T: new Uint32Array() };
    expect(deformMesh(empty, extreme)).toBe(empty);
  });
});
