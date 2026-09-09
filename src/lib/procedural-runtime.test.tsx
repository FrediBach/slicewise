// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { generateTerrain, TERRAIN_CONTROLS } from './generative-terrain';
import { GENERATIVE_CONTROLS } from './procedural-source';
import type { ContourSettings } from './contour-engine';
vi.mock('./animation-storage', () => ({
  localAnimationProjectId: () => 'map-test',
  loadAnimationProject: async () => null,
  saveAnimationProject: vi.fn(),
}));
vi.mock('./video-encoder', () => ({ detectAnimationVideoCodec: vi.fn(async () => null) }));
class WorkerStub extends EventTarget {
  static instances: WorkerStub[] = [];
  requests: Array<{ type: string; id: number; meshVersion: number; settings: ContourSettings }> =
    [];
  constructor() {
    super();
    WorkerStub.instances.push(this);
  }
  postMessage(request: WorkerStub['requests'][number]) {
    this.requests.push(request);
  }
  complete() {
    const request = this.requests.filter((r) => r.type === 'render').at(-1)!;
    this.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'result',
          id: request.id,
          meshVersion: request.meshVersion,
          result: {
            svg: '<svg/>',
            W: 120,
            H: 100,
            paths: 0,
            nodes: 0,
            bytes: 6,
            ms: 1,
            quick: false,
            toolpaths: [],
          },
        },
      }),
    );
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
it('registers omitted morphs and edits generated animation without replacing the Config mesh', async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.stubGlobal('Worker', WorkerStub);
  document.body.innerHTML = renderToStaticMarkup(<App />);
  await import('./slicer');
  const worker = WorkerStub.instances[0];
  const input = (id: string) => document.getElementById(id) as HTMLInputElement;
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(400);
    worker.complete();
    await vi.advanceTimersByTimeAsync(400);
  };
  const change = (id: string, value: string | boolean) => {
    if (typeof value === 'boolean') input(id).checked = value;
    else input(id).value = value;
    input(id).dispatchEvent(new Event('input', { bubbles: true }));
    input(id).dispatchEvent(new Event('change', { bubbles: true }));
  };
  const latest = () => worker.requests.filter((r) => r.type === 'render').at(-1)!.settings;
  await settle();
  for (const { id } of [...GENERATIVE_CONTROLS, ...TERRAIN_CONTROLS]) {
    expect(document.querySelector(`#${id}Control .morph-toggle`)).not.toBeNull();
  }
  for (const [id, value] of Object.entries({
    genBlend: 80,
    terrainScale: 4,
    divergence: 40,
    svgSliceX: 20,
    blockGlitchSeed: 4,
    mapBuildings: 25,
    weatherLowColor: '#123456',
    vectorZoom1Color: '#234567',
    misregistrationColor1: '#345678',
  })) {
    document.dispatchEvent(
      new CustomEvent('morphchange', { detail: { id, dimension: 1, active: true, value } }),
    );
    await settle();
    expect(latest().morphTargets[id]).toBe(value);
  }
  change('demo', 'terrain');
  await vi.advanceTimersByTimeAsync(400);
  const generator = WorkerStub.instances[1];
  const request = generator.requests.at(-1)!;
  const mesh = generateTerrain({ terrainRes: 32 });
  generator.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: 'result',
        id: request.id,
        positions: mesh.positions.buffer,
        indices: mesh.indices.buffer,
        normals: mesh.normals.buffer,
        stats: mesh.stats,
      },
    }),
  );
  await settle();
  expect(latest().proceduralSource).toBe('terrain');
  const original = latest().terrainRelief;
  const generations = generator.requests.length;
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'animation' } }));
  await settle();
  expect(input('terrainRelief')).not.toBeDisabled();
  change('terrainReliefN', '85');
  await settle();
  expect(latest().terrainRelief).toBe(85);
  expect(generator.requests.length).toBe(generations);
  expect(latest().morphEnabled).toBe(false);
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'config' } }));
  await settle();
  expect(latest().terrainRelief).toBe(original);
  expect(input('terrainReliefN').value).toBe(String(original));
});
