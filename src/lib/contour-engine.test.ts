import { describe, expect, it } from 'vitest';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { computeContours } from './contour-engine';
import { cameraBasis, projectMesh } from './projection';

describe('computeContours', () => {
  it('turns a normalized mesh into finite SVG and grouped toolpaths', () => {
    const result = computeContours(makeContourMesh(), contourSettings, false);

    expect(result.svg).toMatch(/^<svg[^>]+width="120mm" height="100mm"/);
    expect(result.svg).toContain('<path');
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    expect(result.paths).toBeGreaterThan(0);
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.toolpaths.length).toBeGreaterThan(0);
    expect(result.bytes).toBe(new TextEncoder().encode(result.svg).byteLength);
  });

  it('keeps quick previews lightweight and out of export toolpaths', () => {
    const result = computeContours(
      makeContourMesh(),
      { ...contourSettings, lines: 30, quality: 9 },
      true,
    );

    expect(result.svg).toContain('<path');
    expect(result.paths).toBeGreaterThan(0);
    expect(result.toolpaths).toEqual([]);
  });

  it('allows quick previews to reach full contour and curve detail', () => {
    const settings = {
      ...contourSettings,
      hide: false,
      sil: false,
      lines: 30,
      quality: 8,
    };
    const preview = computeContours(makeContourMesh(), { ...settings, previewDetail: 1 }, true);
    const exact = computeContours(makeContourMesh(), settings, false);

    expect(preview.svg).toBe(exact.svg);
    expect(preview.paths).toBe(exact.paths);
    expect(preview.nodes).toBe(exact.nodes);
    expect(preview.toolpaths).toEqual([]);
    expect(exact.toolpaths.length).toBeGreaterThan(0);
  });

  it('renders every requested morph step into labeled SVG groups', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        morphEnabled: true,
        morphTargets: { az: 90, color: '#ff0000' },
      },
      true,
    );

    expect(result.svg).toContain('data-morph-x-step="1"');
    expect(result.svg).toContain('data-morph-x-step="3"');
    expect(result.svg.match(/data-morph-x-step=/g)).toHaveLength(3);
    expect(result.paths).toBeGreaterThan(0);
  });

  it('caps large morph grids in reduced-detail quick previews', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        morphEnabled: true,
        morphSteps: 12,
        morphTargets: { az: 90 },
        morphSecondEnabled: true,
        morphStepsY: 12,
        morphTargets2: { zoom: 1.5 },
        previewDetail: 0.5,
      },
      true,
    );

    expect(result.svg.match(/data-morph-x-step=/g)).toHaveLength(9);
    expect(result.svg).toContain('data-morph-x-step="3"');
    expect(result.svg).toContain('data-morph-y-step="3"');
    expect(result.svg).not.toContain('data-morph-x-step="4"');
  });

  it('renders normalized SVG centerlines directly as plotter paths', () => {
    const mesh = {
      V: new Float32Array([-1, 0, 0, 0, 0, 0, 1, 0, 0]),
      T: new Uint32Array(),
      N: new Float32Array(9),
      lineArt: { offsets: new Uint32Array([0, 3]) },
    };
    const result = computeContours(
      mesh,
      { ...contourSettings, az: -90, el: 90, hide: false, sil: false },
      false,
    );

    expect(result.toolpaths).toHaveLength(1);
    expect(result.toolpaths[0].label).toBe('SVG centreline');
    expect(result.toolpaths[0].runs[0]).toHaveLength(4);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
  });

  it.each([
    ['orthographic', { lensPerspective: 0, lensWarpExponent: 0, lensDistortion: 0 }],
    ['perspective', { lensPerspective: 100, lensWarpExponent: 0, lensDistortion: 0 }],
    ['Klein to Poincare', { lensPerspective: 0, lensWarpExponent: 100, lensDistortion: 0 }],
    ['barrel distortion', { lensPerspective: 0, lensWarpExponent: 0, lensDistortion: -60 }],
    ['pincushion distortion', { lensPerspective: 0, lensWarpExponent: 0, lensDistortion: 60 }],
  ])('uses the shared %s projection for SVG centreline runs', (_name, lens) => {
    const mesh = {
      V: new Float32Array([0.2, -0.5, -0.25, -0.4, 0.75, 0.5]),
      T: new Uint32Array(),
      N: new Float32Array(6),
      lineArt: { offsets: new Uint32Array([0, 2]) },
    };
    const settings = {
      ...contourSettings,
      ...lens,
      az: 0,
      el: 0,
      roll: 0,
      hide: false,
      sil: false,
    };
    const result = computeContours(mesh, settings, false);
    const expected = projectMesh(
      mesh,
      cameraBasis(settings.az, settings.el, settings.roll),
      settings.pw,
      settings.ph,
      settings.margin,
      settings.zoom,
      settings.panX,
      settings.panY,
      settings.lensFocalLength,
      settings.lensPerspective,
      settings.lensWarpExponent,
      settings.lensDistortion,
    );

    expect(result.toolpaths).toHaveLength(1);
    expect(result.toolpaths[0].runs).toHaveLength(1);
    const run = result.toolpaths[0].runs[0];
    expect(run).toHaveLength(4);
    expect(run[0]).toBeCloseTo(expected.sx[0], 5);
    expect(run[1]).toBeCloseTo(expected.sy[0], 5);
    expect(run[2]).toBeCloseTo(expected.sx[1], 5);
    expect(run[3]).toBeCloseTo(expected.sy[1], 5);
  });
});
