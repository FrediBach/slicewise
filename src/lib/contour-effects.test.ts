import { describe, expect, it } from 'vitest';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { computeContours } from './contour-engine';

describe('contour output effects', () => {
  it('splits gradients into plotter-ready colour groups and halftone bands', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        sil: false,
        gradientEnabled: true,
        gradientColors: 4,
        halftone: true,
        halftoneCycles: 3,
      },
      false,
    );

    expect(result.svg).toContain('stroke-dasharray="');
    expect(result.toolpaths.length).toBeGreaterThan(1);
    expect(result.toolpaths.every((group) => group.label.startsWith('gradient colour'))).toBe(true);
    expect(result.toolpaths.every((group) => /^#[0-9a-f]{6}$/i.test(group.color))).toBe(true);
  });

  it('renders chromatic aberration as three screen-blended paths', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        sil: false,
        chroma: true,
        chromaAmount: 2,
      },
      true,
    );

    expect(result.svg).toContain('fill="#000000"');
    expect(result.svg).toContain('mix-blend-mode:screen');
    expect(result.svg).toContain('stroke="#ff2020"');
    expect(result.svg).toContain('stroke="#25ff48"');
    expect(result.svg).toContain('stroke="#2548ff"');
    expect(result.paths % 3).toBe(0);
  });

  it('produces stable humanized paths for identical settings', () => {
    const effectSettings = {
      ...contourSettings,
      hide: false,
      humanizer: true,
      humanizerAmount: 70,
    };

    const first = computeContours(makeContourMesh(), effectSettings, true);
    const second = computeContours(makeContourMesh(), effectSettings, true);

    expect(first.svg).toBe(second.svg);
    expect(first.toolpaths).toEqual(second.toolpaths);
  });

  it('adds escaped technical annotations and blueprint stock', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        blueprint: true,
        blueprintStyle: 'black',
        documentTitle: 'study <draft> & review',
      },
      true,
    );

    expect(result.svg).toContain('id="technical-annotations"');
    expect(result.svg).toContain('fill="#101417"');
    expect(result.svg).toContain('STUDY &lt;DRAFT&gt; &amp; REVIEW');
    expect(result.svg).toContain('DRAWING NO.');
    expect(result.svg).toContain('stroke="#f5f9ff"');
  });

  it('adds deterministic, plotter-safe topographic labels and locations', () => {
    const mesh = makeContourMesh();
    const settings = {
      ...contourSettings,
      hide: false,
      sil: false,
      lines: 24,
      topographicMap: true,
    };
    const baseline = computeContours(mesh, { ...settings, topographicMap: false }, false);
    const first = computeContours(mesh, settings, false);
    const second = computeContours(mesh, settings, false);
    const preview = computeContours(mesh, settings, true);

    expect(first.svg).toBe(second.svg);
    expect(first.svg).toContain('id="topographic-annotations"');
    expect(first.svg).toMatch(/data-locations="[A-Z,]+"/);
    expect(first.svg).toMatch(/data-altitudes="[0-9,]+"/);
    expect(first.svg).toContain('<text');
    expect(first.svg).toContain('font-family="DM Mono,ui-monospace,monospace"');
    expect(first.svg).toContain('data-label-mask=');
    expect(first.svg).not.toContain('2KM');
    expect(first.paths).toBeGreaterThan(baseline.paths);
    expect(first.toolpaths.flatMap((group) => group.runs).length).toBeGreaterThan(
      baseline.toolpaths.flatMap((group) => group.runs).length,
    );
    expect(preview.svg).toContain('id="topographic-annotations"');
    expect(preview.toolpaths).toEqual([]);
  });
});

describe('contour projection modes', () => {
  it.each([
    ['up', 'clean'],
    ['cam', 'wide'],
    ['x', 'fisheye'],
    ['y', 'tele'],
    ['custom', 'clean'],
  ])('renders the %s field through the %s lens', (axis, lens) => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        axis,
        lens,
        lensAmount: 180,
        hide: false,
        sil: false,
      },
      true,
    );

    expect(result.paths).toBeGreaterThan(0);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
  });

  it('fans slice planes from an inferred source without producing invalid paths', () => {
    const parallel = computeContours(
      makeContourMesh(),
      { ...contourSettings, hide: false, sil: false },
      true,
    );
    const divergent = computeContours(
      makeContourMesh(),
      { ...contourSettings, divergence: 160, hide: false, sil: false },
      true,
    );

    expect(divergent.paths).toBeGreaterThan(0);
    expect(divergent.paths).toBeGreaterThanOrEqual(contourSettings.lines);
    expect(divergent.svg).not.toMatch(/NaN|Infinity/);
    expect(divergent.svg).not.toBe(parallel.svg);
  });

  it('constructs a continuous spiral toolpath', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        spiral: true,
        hide: false,
        sil: false,
        lines: 12,
      },
      false,
    );

    expect(result.paths).toBeGreaterThan(0);
    expect(result.toolpaths.some((group) => group.runs.some((run) => run.length > 20))).toBe(true);
  });
});

describe('contour line-weight variation', () => {
  it('emphasizes every configured index contour without changing plotter centerlines', () => {
    const mesh = makeContourMesh();
    const uniform = computeContours(mesh, { ...contourSettings, hide: false, sil: false }, false);
    const indexed = computeContours(
      mesh,
      {
        ...contourSettings,
        hide: false,
        sil: false,
        lineWeightMode: 'index',
        lineWeightInterval: 2,
        lineWeightAmount: 100,
      },
      false,
    );

    expect(indexed.svg).toContain('stroke-width="0.35"');
    expect(indexed.svg).toContain('stroke-width="0.7"');
    expect(indexed.toolpaths.flatMap((group) => group.runs)).toHaveLength(
      uniform.toolpaths.flatMap((group) => group.runs).length,
    );
  });

  it.each(['wave', 'center'])('emits multiple finite widths for %s weighting', (mode) => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        sil: false,
        lineWeightMode: mode,
        lineWeightInterval: 4,
        lineWeightAmount: 150,
      },
      true,
    );
    const widths = new Set(
      Array.from(result.svg.matchAll(/stroke-width="([\d.]+)"/g), (match) => match[1]),
    );

    expect(widths.size).toBeGreaterThan(1);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
  });
});
