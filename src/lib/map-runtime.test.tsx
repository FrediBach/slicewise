// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import type { ContourSettings } from './contour-engine';
import { MAP_CONTROLS } from './map-settings';
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
it('binds map amounts to render settings and restores them with undo and redo', async () => {
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
  await settle();
  for (const { id } of MAP_CONTROLS) expect(input(id)).toBeDisabled();
  input('topographicMap').checked = true;
  input('topographicMap').dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  for (const { id } of MAP_CONTROLS) {
    if (id === 'mapRoads' || id === 'mapRivers') expect(input(id)).toBeDisabled();
    else expect(input(id)).not.toBeDisabled();
  }
  input('mapBuildingsN').value = '37';
  input('mapBuildingsN').dispatchEvent(new Event('input', { bubbles: true }));
  input('mapBuildingsN').dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(input('mapBuildings').value).toBe('37');
  expect(worker.requests.filter((r) => r.type === 'render').at(-1)!.settings.mapBuildings).toBe(37);
  input('undo').click();
  await settle();
  expect(input('mapBuildings').value).toBe('12');
  input('redo').click();
  await settle();
  expect(input('mapBuildings').value).toBe('37');
  input('topographicMap').checked = false;
  input('topographicMap').dispatchEvent(new Event('change', { bubbles: true }));
  for (const { id } of MAP_CONTROLS) expect(input(id)).toBeDisabled();
});
