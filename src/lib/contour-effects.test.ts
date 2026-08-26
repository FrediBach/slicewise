import { describe, expect, it } from 'vitest';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
import { computeContours } from './contour-engine';
import { sphereDemo } from './demo-meshes';
import { pointInGenerativeMask } from './generative-mask';
import { vertexNormals, weld } from './mesh';

describe('contour output effects', () => {
  it('separates contour layers along the slice direction', () => {
    const baseSettings = {
      ...contourSettings,
      hide: false,
      sil: false,
      clipToArtboard: false,
    };
    const base = computeContours(makeContourMesh(), baseSettings, false);
    const exploded = computeContours(
      makeContourMesh(),
      { ...baseSettings, explodeAmount: 100 },
      false,
    );
    const verticalSpan = (result: typeof base): number => {
      const ys = result.toolpaths.flatMap((group) =>
        group.runs.flatMap((run) => run.filter((_, index) => index % 2 === 1)),
      );
      return Math.max(...ys) - Math.min(...ys);
    };

    expect(exploded.paths).toBe(base.paths);
    expect(verticalSpan(exploded)).toBeGreaterThan(verticalSpan(base) * 1.25);
  });

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

  it('overrides selected one-based line indexes with their assigned colours', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        lines: 8,
        hide: false,
        sil: false,
        lineIndexColorEnabled: true,
        lineIndexColors: [
          { index: 3, color: '#ff00aa' },
          { index: 6, color: '#00aa55' },
        ],
      },
      false,
    );

    expect(result.svg).toContain('stroke="#ff00aa"');
    expect(result.svg).toContain('stroke="#00aa55"');
    expect(
      result.toolpaths.find((group) => group.color === '#ff00aa')?.runs.length,
    ).toBeGreaterThan(0);
    expect(
      result.toolpaths.find((group) => group.color === '#00aa55')?.runs.length,
    ).toBeGreaterThan(0);
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
      'yarnCurl',
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

  it('cuts a stable percentage of lines with independently adjustable curl sizing', () => {
    const settings = {
      ...contourSettings,
      hide: false,
      sil: false,
      lines: 12,
      quality: 5,
      yarnCurl: true,
    };
    const lowPercent = computeContours(
      makeContourMesh(),
      { ...settings, yarnCutPercent: 10 },
      false,
    );
    const highPercent = computeContours(
      makeContourMesh(),
      { ...settings, yarnCutPercent: 40 },
      false,
    );
    const repeated = computeContours(makeContourMesh(), { ...settings, yarnCutPercent: 40 }, false);

    expect(lowPercent.svg).not.toBe(highPercent.svg);
    expect(highPercent.nodes).toBeGreaterThan(lowPercent.nodes);
    expect(repeated.svg).toBe(highPercent.svg);
    expect(repeated.toolpaths).toEqual(highPercent.toolpaths);

    const openedRuns = highPercent.toolpaths
      .flatMap((group) => group.runs)
      .filter(
        (run) => Math.hypot(run[0] - run.at(-2)!, run[1] - run.at(-1)!) > 0.1 && run.length >= 28,
      );
    const terminalLengths = openedRuns.flatMap((run) => {
      const endLength = (start: number, direction: number): number => {
        let length = 0;
        for (let index = start, count = 0; count < 10; index += direction * 2, count++)
          length += Math.hypot(
            run[index + direction * 2] - run[index],
            run[index + direction * 2 + 1] - run[index + 1],
          );
        return Math.round(length * 10) / 10;
      };
      return [endLength(0, 1), endLength(run.length - 2, -1)];
    });
    expect(openedRuns.length).toBeGreaterThanOrEqual(4);
    expect(new Set(terminalLengths).size).toBeGreaterThanOrEqual(4);

    const smallCurls = computeContours(
      makeContourMesh(),
      { ...settings, yarnCutPercent: 40, yarnCurlSize: 50 },
      false,
    );
    const largeCurls = computeContours(
      makeContourMesh(),
      { ...settings, yarnCutPercent: 40, yarnCurlSize: 180 },
      false,
    );
    const totalLength = (result: typeof smallCurls): number =>
      result.toolpaths
        .flatMap((group) => group.runs)
        .reduce((sum, run) => {
          for (let index = 2; index < run.length; index += 2)
            sum += Math.hypot(run[index] - run[index - 2], run[index + 1] - run[index - 1]);
          return sum;
        }, 0);
    expect(totalLength(largeCurls)).toBeGreaterThan(totalLength(smallCurls));

    const oneCutPerLine = computeContours(
      makeContourMesh(),
      { ...settings, yarnCutPercent: 100 },
      false,
    );
    const threeCutsPerLine = computeContours(
      makeContourMesh(),
      { ...settings, yarnCutPercent: 300 },
      false,
    );
    const repeatedThreeCuts = computeContours(
      makeContourMesh(),
      { ...settings, yarnCutPercent: 300 },
      false,
    );
    expect(threeCutsPerLine.paths).toBeGreaterThan(oneCutPerLine.paths * 2);
    expect(threeCutsPerLine.svg).not.toBe(oneCutPerLine.svg);
    expect(repeatedThreeCuts.toolpaths).toEqual(threeCutsPerLine.toolpaths);
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

  it('clips SVG and plotter paths to a morphable two-LFO mask', () => {
    const settings = {
      ...contourSettings,
      hide: false,
      sil: false,
      lines: 18,
      maskEnabled: true,
      maskRoundness: 35,
      maskScaleX: 72,
      maskScaleY: 80,
      maskLfo1Amplitude: 24,
      maskLfo1Cycles: 3.5,
      maskLfo1Phase: 30,
      maskLfo1Waveform: 40,
      maskLfo2Amplitude: 13,
      maskLfo2Cycles: 6.25,
      maskLfo2Phase: 120,
      maskLfo2Waveform: 80,
    };
    const result = computeContours(makeContourMesh(), settings, false);

    expect(result.svg).toContain('<clipPath id="generative-mask-');
    expect(result.toolpaths.flatMap((group) => group.runs).length).toBeGreaterThan(0);
    for (const run of result.toolpaths.flatMap((group) => group.runs))
      for (let index = 0; index < run.length; index += 2)
        expect(
          pointInGenerativeMask(
            settings,
            settings.pw,
            settings.ph,
            settings.margin,
            run[index],
            run[index + 1],
          ),
        ).toBe(true);
  });

  it('applies independent mask targets across a two-dimensional morph grid', () => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        hide: false,
        sil: false,
        maskEnabled: true,
        morphEnabled: true,
        morphSteps: 2,
        morphTargets: { maskRoundness: 0, maskLfo1Amplitude: 25 },
        morphSecondEnabled: true,
        morphStepsY: 2,
        morphTargets2: { maskScaleX: 60, maskOffsetX: 35, maskLfo2Waveform: 100 },
      },
      false,
    );

    expect(result.svg.match(/data-morph-x-step=/g)).toHaveLength(4);
    expect(result.svg.match(/<clipPath id="generative-mask-/g)).toHaveLength(4);
    expect(new Set(result.svg.match(/generative-mask-[a-z0-9]+/g))).toHaveProperty('size', 4);
  });

  it('optionally draws the mask boundary in SVG and plotter output', () => {
    const settings = {
      ...contourSettings,
      maskEnabled: true,
      maskOutline: true,
      maskScaleX: 70,
      maskScaleY: 75,
      maskOffsetX: 12,
      maskOffsetY: -8,
    };
    const withoutOutline = computeContours(
      makeContourMesh(),
      { ...settings, maskOutline: false },
      false,
    );
    const withOutline = computeContours(makeContourMesh(), settings, false);
    const runCount = (result: typeof withOutline) =>
      result.toolpaths.reduce((sum, group) => sum + group.runs.length, 0);

    expect(withOutline.svg).toContain('id="generative-mask-outline"');
    expect(withoutOutline.svg).not.toContain('id="generative-mask-outline"');
    expect(runCount(withOutline)).toBe(runCount(withoutOutline) + 1);
    const outline = withOutline.toolpaths.flatMap((group) => group.runs).at(-1)!;
    expect(outline[0]).toBeCloseTo(outline.at(-2)!, 5);
    expect(outline[1]).toBeCloseTo(outline.at(-1)!, 5);
  });
});

describe('contour projection modes', () => {
  it.each([
    ['up', 50, 0],
    ['cam', 24, -45],
    ['x', 12, -100],
    ['y', 85, 40],
    ['custom', 300, 0],
  ])('renders the %s field through a %s mm / %s%% lens', (axis, focalLength, distortion) => {
    const result = computeContours(
      makeContourMesh(),
      {
        ...contourSettings,
        axis,
        lensFocalLength: focalLength,
        lensDistortion: distortion,
        hide: false,
        sil: false,
      },
      true,
    );

    expect(result.paths).toBeGreaterThan(0);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
  });

  it('changes the projection continuously with focal length and signed distortion', () => {
    const render = (lensFocalLength: number, lensDistortion: number, lensPerspective = 100) =>
      computeContours(
        makeContourMesh(),
        {
          ...contourSettings,
          lensFocalLength,
          lensPerspective,
          lensDistortion,
          hide: false,
          sil: false,
        },
        true,
      ).svg;

    const neutral = render(50, 0);
    expect(render(18, 0)).not.toBe(neutral);
    expect(render(50, -60)).not.toBe(neutral);
    expect(render(50, 60)).not.toBe(neutral);
    expect(render(18, 0, 0)).toBe(render(300, 0, 0));
  });

  it('warps continuously from Klein to Poincaré disk coordinates', () => {
    const render = (lensWarpExponent: number) =>
      computeContours(
        makeContourMesh(),
        {
          ...contourSettings,
          lensPerspective: 0,
          lensWarpExponent,
          lensDistortion: 0,
          hide: false,
          sil: false,
        },
        true,
      ).svg;

    const klein = render(0);
    const halfway = render(50);
    const poincare = render(100);
    expect(halfway).not.toBe(klein);
    expect(poincare).not.toBe(halfway);
    expect(poincare).not.toMatch(/NaN|Infinity/);
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
