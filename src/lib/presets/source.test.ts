// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createInitialAppState } from '../app-state';
import { generateMesh, meshToStl } from '../generativeMesh';
import { generateTerrain } from '../generative-terrain';
import { parseSVG, parseSVGCenterlines } from '../svg-mesh';
import { createPresetAsset, resolvePresetAssets } from './assets';
import { presetEnvelope } from '../../test/fixtures/presets';
import { normalizedSourceMesh, preparePresetSource, type SourceParsers } from './source';

const parsers: SourceParsers = {
  svg: async (...args) => parseSVG(...args),
  centerlines: async (...args) => parseSVGCenterlines(...args),
  generated: async (settings) => {
    const mesh = settings.source === 'terrain' ? generateTerrain(settings) : generateMesh(settings);
    return { verts: mesh.positions, tris: mesh.indices };
  },
};
const obj = 'v 0 0 0\nv 20 0 0\nv 0 10 0\nf 1 2 3\n';
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>';

describe('portable source preparation', () => {
  it('keeps original uploaded units and bytes across asset serialization', async () => {
    const original = new TextEncoder().encode(obj);
    const asset = await createPresetAsset(original, 'drawing.obj');
    const document = presetEnvelope();
    document.assets[asset.id] = asset.asset;
    const bytes = (await resolvePresetAssets(document)).get(asset.id)!;
    expect(Array.from(bytes)).toEqual(Array.from(original));
    const source = await preparePresetSource(
      { ...createInitialAppState(), source: 'upload' },
      { name: 'drawing.obj', bytes },
      parsers,
    );
    expect(Array.from(source.raw!.verts)).toEqual([0, 0, 0, 20, 0, 0, 0, 10, 0]);
    expect(source.mesh).toHaveProperty('normalization.rawMax', [20, 10, 0]);
    expect(source.mesh.V.every(Number.isFinite)).toBe(true);
  });
  it('prepares binary STL and filled or centreline SVG using saved import choices', async () => {
    const mesh = generateMesh({ genRes: 8 });
    const stl = await preparePresetSource(
      { ...createInitialAppState(), source: 'upload' },
      { name: 'model.stl', bytes: new Uint8Array(meshToStl(mesh)) },
      parsers,
    );
    expect(stl.mesh.T.length).toBeGreaterThan(0);
    for (const svgMode of ['extrude', 'centerline'] as const) {
      const source = await preparePresetSource(
        { ...createInitialAppState(), source: 'upload', svgMode, svgDepth: 25 },
        { name: 'art.svg', bytes: new TextEncoder().encode(svg) },
        parsers,
      );
      expect(source.svg).toBe(svg);
      expect(source.mesh.V.length).toBeGreaterThan(0);
      expect(!!source.mesh.lineArt).toBe(svgMode === 'centerline');
    }
  });
  it.each(['generative', 'terrain', 'hyperbolic-tiling', 'torus'])(
    'recreates deterministic %s recipes',
    async (source) => {
      const settings = {
        ...createInitialAppState(),
        source,
        genRes: 8,
        terrainRes: 32,
        tilingDepth: 2,
      };
      const first = await preparePresetSource(settings, null, parsers);
      const second = await preparePresetSource(settings, null, parsers);
      expect(second.mesh.V).toEqual(first.mesh.V);
      expect(second.mesh.T).toEqual(first.mesh.T);
      if (source === 'terrain') expect(first.mesh.terrain).toBe(true);
    },
  );
  it('rejects invalid mesh data and missing sources before producing a workspace', async () => {
    expect(() =>
      normalizedSourceMesh(
        { verts: new Float32Array([NaN, 0, 0]), tris: new Uint32Array([0, 0, 0]) },
        {},
      ),
    ).toThrow();
    await expect(preparePresetSource({ source: 'upload' }, null, parsers)).rejects.toThrow(/needs/);
  });
});
