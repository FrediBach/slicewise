import { describe, expect, it } from 'vitest';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { computeContours } from './contour-engine';

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

  it('caps large morph grids in quick previews', () => {
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
});
