import { auditPrintTopology } from './print-validation';
import { beforeAll, describe, expect, it } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { createThreeDProject, type ThreeDRequest } from './three-d-project';
import { previewThreeD, prepareThreeD } from './three-d-preparation';
import { threeDSliceField } from './three-d-slices';
import { sphereDemo } from './demo-meshes';
import { weld } from './mesh';
import { ThreeDGeometryCache } from './three-d-cache';
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
  it.each(['up', 'x', 'y', 'custom', 'cam'] as const)(
    'keeps divergent %s contours on their planes and refreshes cached overlays',
    (axis) => {
      const r = request();
      const cache = new ThreeDGeometryCache();
      r.settings = { axis, lines: 8, cutAz: 31, cutEl: 47, gapEase: 'sine-in' };
      const parallel = previewThreeD(r, cache);
      for (const divergence of [1, 40, 160]) {
        r.settings.divergence = divergence;
        const preview = previewThreeD(r, cache);
        expect(preview.base).toBe(parallel.base);
        expect(preview.reply.slices?.error).toBeUndefined();
        expect(preview.reply.slices).toMatchObject({ count: 8, runs: 8 });
        expect(preview.reply.slices!.fieldKey).not.toBe(parallel.reply.slices!.fieldKey);
        expect(preview.reply.slices!.positions).not.toEqual(parallel.reply.slices!.positions);
        const geometry = preview.geometry!;
        for (const slice of geometry.slices) {
          const normal = geometry.field.planeNormals![slice.index];
          expect([...slice.closed]).toEqual([1]);
          for (let i = 0; i < slice.points.length; i += 3) {
            const projection = normal.reduce((sum, n, axis) => sum + n * slice.points[i + axis], 0);
            expect(projection).toBeCloseTo(slice.level, 8);
          }
        }
        r.settings.az = 160;
        r.project.rotation = [20, 30, 40];
        expect(previewThreeD(r, cache).geometry).toBe(geometry);
      }
    },
  );
  it.each(['inset', 'emboss'] as const)('prepares and audits divergent %s slices', (operation) => {
    const r = request();
    r.settings.divergence = 40;
    r.project.treatment = operation;
    r.project.pathToleranceMm = 0.05;
    const reply = prepareThreeD(r, module);
    expect(reply.preparation?.message).not.toContain('failed');
    expect(reply.preparation?.status).toBe('accepted');
    expect(reply.preparation?.checks?.selfIntersections).toBe('passed');
    if (operation === 'inset') expect(reply.preparation!.volumeMm3).toBeLessThan(40 * 60 * 80);
    else expect(reply.preparation!.volumeMm3).toBeGreaterThan(40 * 60 * 80);
  });
  it.each(['inset', 'emboss'] as const)(
    'uses selected profile precision for %s geometry',
    (treatment) => {
      const r = request();
      r.project.treatment = treatment;
      r.project.pathToleranceMm = 0.05;
      r.project.profileToleranceMm = 0.1;
      const draft = prepareThreeD(r, module);
      r.project.profileToleranceMm = 0.02;
      const fine = prepareThreeD(r, module);
      expect(draft.preparation?.status).toBe('accepted');
      expect(fine.preparation?.status).toBe('accepted');
      expect(fine.artifact!.T.length).toBeGreaterThan(draft.artifact!.T.length);
      expect(fine.preparation!.volumeMm3).not.toBe(draft.preparation!.volumeMm3);
    },
  );
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
    r.settings.sliceLfo = true;
    expect(previewThreeD(r).reply.slices?.error).toContain('slice-plane LFO');
  });
});

describe('worker geometry cache', () => {
  it('reuses exact geometry for placement and selection and survives reply transfer', () => {
    const r = request();
    const cache = new ThreeDGeometryCache();
    const first = previewThreeD(r, cache);
    const buffers = [
      first.reply.artifact!.V.buffer,
      first.reply.artifact!.T.buffer,
      first.reply.slices!.positions.buffer,
      first.reply.slices!.selected.buffer,
    ];
    structuredClone(first.reply, { transfer: buffers });
    r.id++;
    r.project.rotation = [0, 90, 0];
    r.project.selection = { mode: 'every', step: 2, offset: 0 };
    const next = previewThreeD(structuredClone(r), cache);
    expect(next.base).toBe(first.base);
    expect(next.geometry).toBe(first.geometry);
    expect(next.reply.artifact!.dimensions).toEqual([80, 60, 40]);
    expect(next.reply.slices!.selectedCount).toBe(2);
    expect(next.reply.artifact!.T.length).toBe(36);
    expect(cache.retainedBytes).toBeGreaterThan(0);
    expect(next.reply).toEqual(previewThreeD(r).reply);
    r.project.pathToleranceMm = 0.05;
    const prepared = prepareThreeD(r, module, undefined, cache);
    expect(prepared.preparation?.status).toBe('accepted');
    expect(prepared).toEqual(prepareThreeD(r, module));
    expect(previewThreeD(r, cache).geometry).toBe(first.geometry);
  });

  it('invalidates slices separately, and invalidates the base for size, shape and source edits', () => {
    const r = request();
    const cache = new ThreeDGeometryCache();
    let previous = previewThreeD(r, cache);
    r.settings.lines = 4;
    let next = previewThreeD(r, cache);
    expect(next.base).toBe(previous.base);
    expect(next.geometry).not.toBe(previous.geometry);
    previous = next;
    r.settings.axis = 'spherical';
    expect(previewThreeD(r, cache).reply.slices?.error).toContain('supports');
    r.settings.axis = 'up';
    for (const change of [
      () => {
        r.project.longestMm = 100;
      },
      () => {
        r.settings.objectScaleX = 120;
      },
      () => {
        r.source.version++;
      },
      () => {
        r.source.mesh = {
          ...r.source.mesh,
          V: Float32Array.from(r.source.mesh.V, (v, i) => (i === 0 ? v + 0.5 : v)),
        };
      },
    ]) {
      change();
      next = previewThreeD(r, cache);
      expect(next.base).not.toBe(previous.base);
      expect(next.reply).toEqual(previewThreeD(r).reply);
      previous = next;
    }
    r.source.mesh.T = new Uint32Array();
    expect(() => previewThreeD(r, cache)).toThrow('mesh surface');
    expect(cache.retainedBytes).toBe(0);
  });

  it('bounds retained buffers and computes uncached results when the budget is too small', () => {
    const r = request();
    const cache = new ThreeDGeometryCache(1);
    const first = previewThreeD(r, cache);
    const second = previewThreeD(r, cache);
    expect(second.base).not.toBe(first.base);
    expect(second.geometry).not.toBe(first.geometry);
    expect(second.reply).toEqual(first.reply);
    expect(cache.retainedBytes).toBe(0);
    const baseBytes = (r.source.mesh.V.length + r.source.mesh.T.length) * 12;
    const baseOnly = new ThreeDGeometryCache(baseBytes);
    const a = previewThreeD(r, baseOnly),
      b = previewThreeD(r, baseOnly);
    expect(b.base).toBe(a.base);
    expect(b.geometry).not.toBe(a.geometry);
    expect(baseOnly.retainedBytes).toBe(baseBytes);
  });
});

it.each(
  [80, 100].flatMap((longestMm) =>
    (['inset', 'emboss'] as const).map((treatment) => ({ longestMm, treatment })),
  ),
)(
  'prepares eight exact cube slices at $longestMm mm with verified $treatment geometry',
  ({ longestMm, treatment }) => {
    const r = request();
    r.project.treatment = treatment;
    r.project.longestMm = longestMm;
    r.source.mesh = weld(sphereDemo('cube'));
    r.project.pathToleranceMm = 0;
    r.settings.lines = 8;
    const progress: string[] = [];
    const reply = prepareThreeD(r, module, (message) => progress.push(message));
    expect(progress).toContain('Constructing circular tools…');
    expect(reply.preparation?.status, reply.preparation?.message).toBe('accepted');
    expect(progress).toContain('Applying treatment and checking the result…');
    expect(reply.preparation?.checks).toMatchObject({
      faces: 'passed',
      selfIntersections: 'passed',
    });
    expect(reply.preparation?.cleanup).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: 'Result', toleranceMm: 0.00001 })]),
    );
    for (const report of reply.preparation!.cleanup!) {
      expect(report.maximumDisplacementMm).toBeLessThanOrEqual(report.toleranceMm);
    }
    const sourceVolume = auditPrintTopology(reply.sourceArtifact!).signedVolumeMm3!;
    expect(reply.preparation!.volumeMm3).toBeGreaterThan(0);
    if (treatment === 'inset') expect(reply.preparation!.volumeMm3).toBeLessThan(sourceVolume);
    else expect(reply.preparation!.volumeMm3).toBeGreaterThan(sourceVolume);
    expect(reply.artifact).not.toEqual(reply.sourceArtifact);
  },
  15000,
);

it('preserves exact-only cleanup and rejection for the 100 mm Emboss rounding regression', () => {
  const r = request();
  r.source.mesh = weld(sphereDemo('cube'));
  r.settings.lines = 8;
  Object.assign(r.project, {
    longestMm: 100,
    treatment: 'emboss',
    resultWeldToleranceMm: 0,
    pathToleranceMm: 0,
  });
  const reply = prepareThreeD(r, module);
  expect(reply.preparation?.status).toBe('rejected');
  expect(reply.preparation?.issues).toContainEqual({ code: 'surface-contact', count: 16 });
  expect(reply.preparation?.cleanup).toContainEqual(
    expect.objectContaining({ toleranceMm: 0, maximumDisplacementMm: 0 }),
  );
  expect(reply.artifact).toBe(reply.sourceArtifact);
}, 15000);

it('distinguishes field modes with identical planes, while preserving overlay identity through placement', () => {
  const r = request();
  r.settings = { axis: 'x', lines: 3, cutAz: 0, cutEl: 0 };
  const width = previewThreeD(r).reply.slices!;
  r.settings.axis = 'custom';
  const custom = previewThreeD(r).reply.slices!;
  expect(custom.positions).toEqual(width.positions);
  expect(custom.fieldKey).not.toBe(width.fieldKey);
  r.project.rotation = [0, 45, 0];
  expect(previewThreeD(r).reply.slices!.fieldKey).toBe(custom.fieldKey);
});
