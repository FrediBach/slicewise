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
    expect(
      deformMesh(mesh, {
        ...enabled,
        objectBulgeCenter: 80,
        objectBulgeWidth: 20,
        objectShearDirection: 90,
      }),
    ).toBe(mesh);
    expect(
      deformMesh(mesh, {
        ...enabled,
        objectBulge: false,
        objectBulgeAmount: 100,
        objectShear: false,
        objectShearAmount: 100,
      }),
    ).toBe(mesh);
    const a = computeContours(mesh, contourSettings, false);
    const b = computeContours(mesh, { ...contourSettings, ...enabled }, false);
    expect(b.svg).toBe(a.svg);
    expect(b.toolpaths).toEqual(a.toolpaths);
  });

  it('rotates before stretching, transforms normals, and never edits the source', () => {
    const mesh = box(),
      original = structuredClone(mesh);
    const result = deformMesh(mesh, { ...enabled, objectScaleX: 200, objectRotationZ: 90 });
    expect(Array.from(result.V).slice(0, 3)).toEqual([1, -0.5, -0.5]);
    expect(result.T).toBe(mesh.T);
    expect(result.preserveSurface).toBe(true);
    expect(mesh).toEqual(original);
    const n = [-mesh.N![1] / 2, mesh.N![0], mesh.N![2]],
      length = Math.hypot(...n);
    expect(result.N![0]).toBeCloseTo(n[0] / length);
    expect(result.N![1]).toBeCloseTo(n[1] / length);
    expect(result.N![2]).toBeCloseTo(n[2] / length);
  });

  it('orients the source before applying taper in fixed coordinates', () => {
    const mesh = box();
    mesh.V = Float32Array.from(mesh.V, (value, i) => (i % 3 === 0 ? value * 2 : value));
    const result = deformMesh(mesh, { ...enabled, objectRotationY: 90, objectTaperAmount: 50 });
    // Rotation maps source -X to +Z: it is now the narrow end of the Z taper.
    expect(result.V[0]).toBeCloseTo(-0.25);
    expect(result.V[1]).toBeCloseTo(-0.25);
    expect(result.V[2]).toBeCloseTo(1);
    expect(result.V[3]).toBeCloseTo(-0.75);
    expect(result.V[4]).toBeCloseTo(-0.75);
    expect(result.V[5]).toBeCloseTo(-1);
  });

  it.each(['x', 'y', 'z'] as const)(
    'ripples along %s with analytic amplitude, direction and phase',
    (axis) => {
      const mesh = box();
      const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2,
        u = (k + 1) % 3,
        v = (k + 2) % 3;
      const result = deformMesh(mesh, {
        ...enabled,
        objectRippleAxis: axis,
        objectRippleAmount: 10,
        objectRippleWavelength: 200,
        objectRipplePhase: 90,
        objectRippleDirection: 90,
      });
      for (let i = 0; i < mesh.V.length; i += 3) {
        expect(result.V[i + k]).toBeCloseTo(mesh.V[i + k]);
        expect(result.V[i + u]).toBeCloseTo(mesh.V[i + u]);
        expect(result.V[i + v]).toBeCloseTo(
          mesh.V[i + v] + 0.1 * Math.sin(Math.PI * (mesh.V[i + k] + 0.5) + Math.PI / 2),
        );
      }
      expect(result.T.length).toBeGreaterThan(mesh.T.length);
      const opposite = deformMesh(mesh, {
        ...enabled,
        objectRippleAxis: axis,
        objectRippleAmount: -10,
        objectRippleWavelength: 200,
        objectRipplePhase: 90,
        objectRippleDirection: 90,
      });
      expect(opposite.T).toBe(result.T);
      for (let i = 0; i < mesh.V.length; i++)
        expect((result.V[i] + opposite.V[i]) / 2).toBeCloseTo(mesh.V[i]);
    },
  );

  it('adds repeatable smooth organic displacement, preserving coincident seams and source data', () => {
    const mesh = box();
    // Duplicate a triangle's vertices to model an imported surface seam.
    const V = Array.from(mesh.V),
      T = Array.from(mesh.T);
    for (let i = 0; i < 3; i++) {
      const old = T[i] * 3;
      T[i] = V.length / 3;
      V.push(...Array.from(mesh.V).slice(old, old + 3));
    }
    mesh.V = Float32Array.from(V);
    mesh.T = Uint32Array.from(T);
    const original = structuredClone(mesh);
    const settings = {
      ...enabled,
      objectNoiseAmount: 10,
      objectNoiseSize: 100,
      objectNoiseSeed: 42,
    };
    const result = deformMesh(mesh, settings);
    expect(deformMesh(structuredClone(mesh), settings).V).toEqual(result.V);
    expect(deformMesh(mesh, { ...settings, objectNoiseSeed: 43 }).V).not.toEqual(result.V);
    expect(deformMesh(mesh, { ...settings, objectNoiseSeed: 42.2 })).toBe(result);
    for (let i = 0; i < mesh.V.length; i++)
      expect(Math.abs(result.V[i] - mesh.V[i])).toBeLessThanOrEqual(0.100001);
    for (let i = 0; i < 3; i++) {
      const originalIndex = [0, 2, 1][i];
      expect(Array.from(result.V).slice((8 + i) * 3, (9 + i) * 3)).toEqual(
        Array.from(result.V).slice(originalIndex * 3, (originalIndex + 1) * 3),
      );
    }
    expect(mesh).toEqual(original);
    expect(Array.from(result.N!).every(Number.isFinite)).toBe(true);
  });

  it('keeps inactive ripple/noise neutral and refines smaller active features', () => {
    const mesh = box();
    expect(
      deformMesh(mesh, {
        ...enabled,
        objectRippleWavelength: 25,
        objectRipplePhase: 90,
        objectNoiseSize: 25,
        objectNoiseSeed: 99,
      }),
    ).toBe(mesh);
    expect(
      deformMesh(mesh, {
        ...enabled,
        objectRipple: false,
        objectRippleAmount: 20,
        objectNoise: false,
        objectNoiseAmount: 20,
      }),
    ).toBe(mesh);
    const broad = deformMesh(mesh, { ...enabled, objectRippleAmount: 5 });
    const fine = deformMesh(mesh, {
      ...enabled,
      objectRippleAmount: 5,
      objectRippleWavelength: 25,
    });
    const noise = deformMesh(mesh, { ...enabled, objectNoiseAmount: 5, objectNoiseSize: 25 });
    expect(fine.T.length).toBeGreaterThan(broad.T.length);
    expect(noise.T).toBe(fine.T);
    expect(fine.T.length / 3).toBeLessThanOrEqual(250000);
    expect(
      resolveObjectSettings({
        objectNoiseSeed: Infinity,
        objectNoiseSize: 0,
        objectRippleWavelength: -5,
      }),
    ).toMatchObject({ objectNoiseSeed: 1, objectNoiseSize: 25, objectRippleWavelength: 25 });
    expect(normalizeParameterSnapshot(contourSettings)).toMatchObject({
      objectRippleAmount: 0,
      objectNoiseAmount: 0,
    });
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

  it('bulges and pinches a smooth localized band without moving its ends', () => {
    const mesh = box(),
      original = structuredClone(mesh);
    const sectionWidth = (surface: ContourMesh, z: number) => {
      let width = 0;
      for (let i = 0; i < surface.V.length; i += 3)
        if (Math.abs(surface.V[i + 2] - z) < 1e-6) width = Math.max(width, surface.V[i]);
      return width;
    };
    const bulged = deformMesh(mesh, { ...enabled, objectBulgeAmount: 50 });
    expect(sectionWidth(bulged, 0)).toBeCloseTo(0.75);
    expect(sectionWidth(bulged, 0.25)).toBeCloseTo(0.5 * (1 + 0.5 * 0.75 ** 2));
    expect(sectionWidth(bulged, -0.5)).toBeCloseTo(0.5);
    expect(sectionWidth(bulged, 0.5)).toBeCloseTo(0.5);
    const pinched = deformMesh(mesh, { ...enabled, objectBulgeAmount: -80 });
    expect(sectionWidth(pinched, 0)).toBeCloseTo(0.1);
    const shifted = deformMesh(mesh, {
      ...enabled,
      objectBulgeAmount: 50,
      objectBulgeCenter: 25,
      objectBulgeWidth: 50,
    });
    expect(sectionWidth(shifted, -0.25)).toBeCloseTo(0.75);
    expect(sectionWidth(shifted, 0)).toBeCloseTo(0.5);
    expect(sectionWidth(shifted, 0.5)).toBeCloseTo(0.5);
    expect(mesh).toEqual(original);
  });

  it('resolves a narrow bulge on coarse faces and shares refinement when moving its peak', () => {
    const mesh = box();
    const wide = deformMesh(mesh, { ...enabled, objectBulgeAmount: 100 });
    const narrow = deformMesh(mesh, { ...enabled, objectBulgeAmount: 100, objectBulgeWidth: 20 });
    expect(narrow.T.length).toBeGreaterThan(wide.T.length);
    expect(narrow.T.length / 3).toBeLessThanOrEqual(250000);
    const peak = deformMesh(mesh, {
      ...enabled,
      objectBulgeAmount: 100,
      objectBulgeWidth: 20,
      objectBulgeCenter: 25,
    });
    expect(peak.T).toBe(narrow.T);
    expect(peak.V).not.toEqual(narrow.V);
    const levels = new Set<number>();
    for (let i = 2; i < narrow.V.length; i += 3)
      if (Math.abs(narrow.V[i]) < 0.1) levels.add(narrow.V[i]);
    expect(levels.size).toBeGreaterThanOrEqual(8);
  });

  it('shears in either direction while preserving volume and triangle connectivity', () => {
    const mesh = box();
    const sheared = deformMesh(mesh, { ...enabled, objectShearAmount: 100 });
    expect(sheared.T).toBe(mesh.T);
    expect(sheared.V.length).toBe(mesh.V.length);
    expect(Array.from(sheared.V).slice(0, 3)).toEqual([-1, -0.5, -0.5]);
    expect(Array.from(sheared.V).slice(12, 15)).toEqual([0, -0.5, 0.5]);
    const sideways = deformMesh(mesh, {
      ...enabled,
      objectShearAmount: 100,
      objectShearDirection: 90,
    });
    expect(sideways.V[12]).toBeCloseTo(-0.5);
    expect(sideways.V[13]).toBeCloseTo(0);
    const negative = deformMesh(mesh, { ...enabled, objectShearAmount: -100 });
    expect(negative.V[12]).toBeCloseTo(-1);
    let volume = 0;
    for (let i = 0; i < sheared.T.length; i += 3) {
      const a = sheared.T[i] * 3,
        b = sheared.T[i + 1] * 3,
        c = sheared.T[i + 2] * 3,
        v = sheared.V;
      volume +=
        (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) +
          v[a + 1] * (v[b + 2] * v[c] - v[b] * v[c + 2]) +
          v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) /
        6;
    }
    expect(volume).toBeCloseTo(1);
  });

  it.each(['x', 'y', 'z'] as const)(
    'keeps sheared normals perpendicular to faces on axis %s',
    (axis) => {
      const V = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1]),
        T = new Uint32Array([0, 1, 2]);
      const surface = { V, T, N: vertexNormals(V, T) };
      const sheared = deformMesh(surface, {
        ...enabled,
        objectShearAxis: axis,
        objectShearAmount: 125,
        objectShearDirection: 35,
        objectScaleZ: 150,
        objectRotationY: 25,
      });
      const normals = vertexNormals(Float32Array.from(sheared.V), T);
      for (let i = 0; i < normals.length; i++) expect(sheared.N![i]).toBeCloseTo(normals[i], 5);
      expect(sheared.T).toBe(T);
    },
  );

  it('applies bulge before shear and both before twist', () => {
    const mesh = box();
    const result = deformMesh(mesh, {
      ...enabled,
      objectBulgeAmount: 100,
      objectBulgeCenter: 100,
      objectShearAmount: 100,
      objectTwistAngle: 180,
    });
    // The positive end (-.5,-.5,.5) expands to (-1,-1,.5), shears to (-.5,-1,.5), then rotates 90°.
    expect(result.V[12]).toBeCloseTo(1);
    expect(result.V[13]).toBeCloseTo(-0.5);
    expect(result.V[14]).toBeCloseTo(0.5);
  });

  it.each(['x', 'y', 'z'] as const)(
    'refines shared faces without opening a closed mesh on axis %s',
    (axis) => {
      const mesh = box();
      const result = deformMesh(mesh, {
        ...enabled,
        objectTaperAxis: axis,
        objectBulgeAxis: axis,
        objectShearAxis: axis,
        objectTwistAxis: axis,
        objectBendAxis: axis,
        objectTaperAmount: 25,
        objectBulgeAmount: -30,
        objectShearAmount: 25,
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
        objectBulgeCenter: 80,
        objectBulgeWidth: 20,
        objectShearDirection: 75,
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
      objectBulgeAmount: -150,
      objectBulgeWidth: 0,
      objectBulgeCenter: 150,
      objectShearAmount: Infinity,
      objectShearAxis: 'bad',
    };
    const restored = normalizeParameterSnapshot({ ...contourSettings, ...malformed } as never);
    expect(restored.objectScaleX).toBe(20);
    expect(restored.objectScaleY).toBe(100);
    expect(restored.objectTwistAngle).toBe(0);
    expect(restored.objectTaperAmount).toBe(-80);
    expect(restored.objectBendAxis).toBe('z');
    expect(restored.objectBend).toBe(false);
    expect(restored.objectBulgeAmount).toBe(-80);
    expect(restored.objectBulgeWidth).toBe(20);
    expect(restored.objectBulgeCenter).toBe(100);
    expect(restored.objectShearAmount).toBe(0);
    expect(restored.objectShearAxis).toBe('z');
    const legacy = normalizeParameterSnapshot({
      ...contourSettings,
      objectEnabled: true,
      objectTwistAngle: 30,
    });
    expect(legacy.objectBulgeAmount).toBe(0);
    expect(legacy.objectShearAmount).toBe(0);
  });

  it('keeps extreme settings finite, including flat and empty inputs', () => {
    const extreme: Partial<ObjectSettings> = {
      ...enabled,
      objectScaleX: 300,
      objectScaleZ: 20,
      objectTaperAmount: 80,
      objectBulgeAmount: 150,
      objectShearAmount: -150,
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
