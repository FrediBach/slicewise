import { describe, expect, it } from 'vitest';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { computeContours } from './contour-engine';
import { sphereDemo } from './demo-meshes';
import { vertexNormals, weld } from './mesh';

describe('contour output effects', () => {
  it('keeps the hidden-line silhouette of a rounded cube closed', () => {
    const normalized = weld(sphereDemo('cube', 128, 64));
    const mesh = { ...normalized, N: vertexNormals(normalized.V, normalized.T) };
    for (const [az, el] of [
      [0, 0],
      [15, 10],
      [30, 20],
      [45, 30],
      [60, 40],
      [75, 50],
      [90, 0],
      [105, 10],
      [120, 20],
      [135, 30],
      [150, 40],
      [165, 50],
    ]) {
      const result = computeContours(
        mesh,
        {
          ...contourSettings,
          az,
          el,
          lines: 6,
          gradientEnabled: true,
          gradientColors: 2,
        },
        false,
      );

      const silhouette = result.toolpaths.find((group) => group.label === 'silhouette');
      expect(silhouette?.runs, `az ${az}, el ${el}`).toHaveLength(1);
      const run = silhouette!.runs[0];
      expect(
        Math.hypot(run[0] - run.at(-2)!, run[1] - run.at(-1)!),
        `az ${az}, el ${el}`,
      ).toBeLessThan(1e-5);
    }
  });

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

  it('composes humanized halftone chromatic contours with blueprint overlays', () => {
    const settings = {
      ...contourSettings,
      hide: false,
      sil: false,
      humanizer: true,
      humanizerAmount: 64,
      halftone: true,
      chroma: true,
      blueprint: true,
    };

    const first = computeContours(makeContourMesh(), settings, false);
    const second = computeContours(makeContourMesh(), settings, false);

    expect(first.svg).toBe(second.svg);
    expect(first.svg).toContain('fill="#0b3f7a"');
    expect(first.svg).toContain('stroke-dasharray="');
    expect(first.svg).toContain('mix-blend-mode:screen');
    expect(first.svg).toContain('stroke="#ff2020"');
    expect(first.svg).toContain('id="technical-annotations"');
    expect(first.svg.indexOf('mix-blend-mode:screen')).toBeLessThan(
      first.svg.indexOf('id="technical-annotations"'),
    );
    expect(first.toolpaths).toEqual(second.toolpaths);
  });

  it('keeps a gradient base visible beneath chromatic ghost layers', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        sil: false,
        gradientEnabled: true,
        chroma: true,
      },
      true,
    );

    expect(result.svg).toContain('id="chroma-base"');
    expect(result.svg).toContain('stroke="#ef4444"');
    expect(result.svg).toContain('stroke="#3b82f6"');
    expect(result.svg).toContain('stroke="#ff2020"');
  });

  it('composes effects for imported SVG centreline artwork', () => {
    const points: number[] = [];
    const offsets = [0];
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 6; column++)
        points.push(-0.9 + column * 0.36, -0.7 + row * 0.2 + Math.sin(column) * 0.03, 0);
      offsets.push(points.length / 3);
    }
    const result = computeContours(
      {
        V: Float32Array.from(points),
        T: new Uint32Array(),
        lineArt: { offsets: Uint32Array.from(offsets) },
      },
      {
        ...contourSettings,
        gradientEnabled: true,
        halftone: true,
        chroma: true,
        humanizer: true,
        blueprint: true,
        topographicMap: true,
      },
      false,
    );

    expect(result.svg).toContain('id="chroma-base"');
    expect(result.svg).toContain('stroke-dasharray="');
    expect(result.svg).toContain('id="topographic-annotations"');
    expect(result.svg).toContain('id="technical-annotations"');
    expect(result.toolpaths.some((group) => group.label.startsWith('gradient colour'))).toBe(true);
    expect(result.toolpaths.some((group) => group.label === 'topographic annotations')).toBe(true);
  });

  it('renders every post-processing combination without invalid SVG values', () => {
    const effects = [
      'gradientEnabled',
      'halftone',
      'chroma',
      'humanizer',
      'blueprint',
      'topographicMap',
    ] as const;

    for (let mask = 0; mask < 1 << effects.length; mask++) {
      const enabled = Object.fromEntries(
        effects.map((effect, index) => [effect, Boolean(mask & (1 << index))]),
      );
      const result = computeContours(
        makeContourMesh(),
        { ...contourSettings, hide: false, sil: false, lines: 6, ...enabled },
        true,
      );

      expect(result.svg).toMatch(/^<svg/);
      expect(result.svg).not.toMatch(/(?:NaN|undefined|Infinity)/);
      if (enabled.halftone) expect(result.svg).toContain('stroke-dasharray="');
      if (enabled.chroma) expect(result.svg).toContain('id="chromatic-aberration"');
      if (enabled.blueprint) expect(result.svg).toContain('id="technical-annotations"');
      if (enabled.topographicMap) expect(result.svg).toContain('id="topographic-annotations"');
    }
  });

  it('keeps combined document effects outside repeated morph layers', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        morphEnabled: true,
        morphSteps: 3,
        morphTargets: { az: 70 },
        chroma: true,
        blueprint: true,
      },
      true,
    );

    expect(result.svg.match(/data-morph-x-step=/g)).toHaveLength(3);
    expect(result.svg.match(/<rect width="120" height="100" fill="#0b3f7a"\/>/g)).toHaveLength(1);
    expect(result.svg.match(/id="technical-annotations"/g)).toHaveLength(1);
    expect(result.svg.match(/id="chromatic-aberration"/g)).toHaveLength(3);
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

  it('warps the slicing field with a deterministic LFO before projection', () => {
    const mesh = makeContourMesh();
    const planar = computeContours(mesh, { ...contourSettings, hide: false, sil: false }, false);
    const settings = {
      ...contourSettings,
      hide: false,
      sil: false,
      sliceLfo: true,
      sliceLfoAmplitude: 140,
      sliceLfoCycles: 2.5,
      sliceLfoAngle: 32,
      sliceLfoPhase: 45,
    };
    const first = computeContours(mesh, settings, false);
    const second = computeContours(mesh, settings, false);

    expect(first.svg).toBe(second.svg);
    expect(first.toolpaths).toEqual(second.toolpaths);
    expect(first.svg).not.toBe(planar.svg);
    expect(first.toolpaths).not.toEqual(planar.toolpaths);
    expect(first.paths).toBeGreaterThan(0);
    expect(first.svg).not.toMatch(/NaN|Infinity/);
  });

  it.each(['sine', 'triangle'])('supports %s slice-plane modulation', (sliceLfoWaveform) => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        axis: 'custom',
        cutAz: 28,
        cutEl: 51,
        divergence: 55,
        sliceLfo: true,
        sliceLfoAmplitude: 95,
        sliceLfoCycles: 3,
        sliceLfoWaveform,
        hide: false,
        sil: false,
      },
      true,
    );

    expect(result.paths).toBeGreaterThan(0);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
  });

  it('leaves planar slices unchanged at zero LFO amplitude', () => {
    const mesh = makeContourMesh();
    const planar = computeContours(mesh, { ...contourSettings, hide: false, sil: false }, true);
    const zeroAmplitude = computeContours(
      mesh,
      {
        ...contourSettings,
        hide: false,
        sil: false,
        sliceLfo: true,
        sliceLfoAmplitude: 0,
      },
      true,
    );

    expect(zeroAmplitude.svg).toBe(planar.svg);
  });

  it.each(['amplitude', 'frequency'])(
    'modulates the slice LFO with deterministic %s modulation',
    (sliceLfoModulationMode) => {
      const mesh = makeContourMesh();
      const carrierSettings = {
        ...contourSettings,
        hide: false,
        sil: false,
        sliceLfo: true,
        sliceLfoAmplitude: 120,
        sliceLfoCycles: 2.5,
        sliceLfoPhase: 25,
      };
      const carrier = computeContours(mesh, carrierSettings, false);
      const settings = {
        ...carrierSettings,
        sliceLfoModulation: true,
        sliceLfoModulationMode,
        sliceLfoModulationDepth: 70,
        sliceLfoModulationCycles: 1.5,
        sliceLfoModulationPhase: 65,
      };
      const first = computeContours(mesh, settings, false);
      const second = computeContours(mesh, settings, false);

      expect(first.svg).toBe(second.svg);
      expect(first.toolpaths).toEqual(second.toolpaths);
      expect(first.svg).not.toBe(carrier.svg);
      expect(first.toolpaths).not.toEqual(carrier.toolpaths);
      expect(first.svg).not.toMatch(/NaN|Infinity/);
    },
  );

  it('keeps enabled LFO modulation neutral at zero depth', () => {
    const mesh = makeContourMesh();
    const carrierSettings = {
      ...contourSettings,
      hide: false,
      sil: false,
      sliceLfo: true,
      sliceLfoAmplitude: 110,
      sliceLfoCycles: 2,
    };
    const carrier = computeContours(mesh, carrierSettings, true);
    const neutral = computeContours(
      mesh,
      {
        ...carrierSettings,
        sliceLfoModulation: true,
        sliceLfoModulationMode: 'frequency',
        sliceLfoModulationDepth: 0,
        sliceLfoModulationCycles: 8,
      },
      true,
    );

    expect(neutral.svg).toBe(carrier.svg);
  });

  it('adaptively refines near-tangent LFO slices on the rounded cube', () => {
    const normalized = weld(sphereDemo('cube', 48, 24));
    const mesh = { ...normalized, N: vertexNormals(normalized.V, normalized.T) };
    const settings = {
      ...contourSettings,
      lines: 18,
      hide: false,
      sil: false,
      clipToArtboard: false,
      sliceLfo: true,
      sliceLfoAmplitude: 180,
      sliceLfoCycles: 3,
      sliceLfoAngle: 18,
      sliceLfoPhase: 40,
    };
    const low = computeContours(mesh, { ...settings, quality: 1 }, false);
    const normal = computeContours(mesh, { ...settings, quality: 7 }, false);
    const high = computeContours(mesh, { ...settings, quality: 10 }, false);
    const longestSegment = (result: typeof high): number => {
      let longest = 0;
      for (const run of result.toolpaths.flatMap((group) => group.runs))
        for (let index = 2; index < run.length; index += 2)
          longest = Math.max(
            longest,
            Math.hypot(run[index] - run[index - 2], run[index + 1] - run[index - 1]),
          );
      return longest;
    };

    expect(normal.nodes).toBeGreaterThan(low.nodes);
    expect(high.nodes).toBeGreaterThan(normal.nodes);
    expect(longestSegment(normal)).toBeLessThan(longestSegment(low));
    expect(longestSegment(high)).toBeLessThanOrEqual(longestSegment(normal));
    expect(high.svg).not.toMatch(/NaN|Infinity/);
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
