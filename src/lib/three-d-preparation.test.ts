import { beforeAll, describe, expect, it } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { createThreeDProject, type ThreeDRequest } from './three-d-project';
import { previewThreeD, prepareThreeD } from './three-d-preparation';
import { threeDSliceField } from './three-d-slices';
import { easeLineGap } from './slice-spacing';
let module: ManifoldToplevel;
beforeAll(async () => {
  module = await Module();
  module.setup();
});
function request(): ThreeDRequest {
  const solid = module.Manifold.cube([40, 60, 80], true);
  const mesh = solid.getMesh();
  solid.delete();
  return {
    id: 1,
    source: {
      id: 'box',
      version: 1,
      name: 'Box',
      imported: false,
      upY: false,
      mesh: { V: mesh.vertProperties.slice(), T: mesh.triVerts.slice() },
    },
    settings: { axis: 'up', lines: 3 },
    project: {
      ...createThreeDProject('box'),
      longestMm: 80,
      sizeConfirmed: true,
      treatment: 'inset',
    },
  };
}
describe('integrated 3D slice and treatment preparation', () => {
  it('shares gap easing and freezes view depth independently of camera and print rotation', () => {
    const r = request();
    r.settings = { axis: 'cam', lines: 4, gapEase: 'sine-in', az: 23, el: 41 };
    r.project.viewDirection = [0, 0, 1];
    const a = previewThreeD(r);
    const field = threeDSliceField(a.base, r.settings, r.project);
    field.levels.forEach((v, i) =>
      expect(v).toBeCloseTo(-40 + 80 * easeLineGap((i + 0.5) / 4, 'sine-in')),
    );
    r.settings.az = 160;
    r.settings.el = -70;
    r.project.rotation = [90, 0, 0];
    const b = previewThreeD(r);
    expect(b.geometry).toEqual(a.geometry);
    expect(b.reply.slices!.positions).not.toEqual(a.reply.slices!.positions);
    expect(b.reply.artifact!.dimensions).toEqual([40, 80, 60]);
  });
  it('highlights ordered levels and retains every loop, with empty ranges explicit', () => {
    const r = request();
    r.project.selection = { mode: 'every', step: 2, offset: 1 };
    const preview = previewThreeD(r);
    expect(preview.reply.slices).toMatchObject({ count: 3, selectedCount: 1, runs: 3 });
    expect(preview.reply.slices!.selected.length).toBe(preview.reply.slices!.positions.length / 3);
    r.project.selection = { mode: 'range', first: 20, last: 30 };
    expect(prepareThreeD(r, module).preparation).toMatchObject({
      status: 'rejected',
      message: 'The selected slice range is empty.',
    });
  });
  it.each(['inset', 'emboss'] as const)(
    'prepares %s and audits the exact placed artifact with separate manufacturing advisories',
    (operation) => {
      const r = request();
      r.project.treatment = operation;
      r.project.rotation = [10, 20, 30];
      r.project.pathToleranceMm = 0.05;
      const before = structuredClone(r);
      const reply = prepareThreeD(r, module);
      expect(reply.preparation?.message).not.toContain('failed');
      expect(reply.preparation?.status).toBe('accepted');
      expect(reply.preparation?.checks).toMatchObject({
        selfIntersections: 'passed',
        shellContainment: 'passed',
        manufacturing: 'not-run',
      });
      expect(reply.preparation?.bodyCount).toBe(1);
      if (operation === 'inset') expect(reply.preparation!.volumeMm3).toBeLessThan(40 * 60 * 80);
      else expect(reply.preparation!.volumeMm3).toBeGreaterThan(40 * 60 * 80);
      expect(reply.artifact!.min[2]).toBe(0);
      expect(r).toEqual(before);
      expect(reply.sourceArtifact!.T).toEqual(r.source.mesh.T);
    },
  );
  it('keeps the source inspectable for unsupported fields, invalid solids and neutral treatments', () => {
    const r = request();
    r.settings.axis = 'spherical';
    expect(previewThreeD(r).reply.slices?.error).toContain('supports');
    expect(prepareThreeD(r, module).preparation?.status).toBe('rejected');
    r.settings.axis = 'up';
    r.source.mesh.T = Uint32Array.from(Array.from(r.source.mesh.T).slice(3));
    const reply = prepareThreeD(r, module);
    expect(reply.preparation?.status).toBe('rejected');
    expect(reply.artifact).toEqual(reply.sourceArtifact);
    expect(reply.preparation?.issues?.length).toBeGreaterThan(0);
    r.project.radiusMm = 0;
    const neutral = prepareThreeD(r, module);
    expect(neutral.artifact).toEqual(neutral.sourceArtifact);
    expect(neutral.preparation?.status).toBe('rejected');
  });
  it('rejects incomplete slice budgets without truncating the selection', () => {
    const r = request();
    r.settings.lines = 201;
    expect(previewThreeD(r).reply.slices?.error).toContain('1–200');
    r.settings.lines = 3;
    r.settings.divergence = 10;
    expect(previewThreeD(r).reply.slices?.error).toContain('Divergence');
  });
});
