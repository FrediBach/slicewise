// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import type { ContourSettings } from './contour-engine';
import { WEAVE_CONTROLS } from './contour-weave-settings';
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
it('binds weave controls, restores history, and captures colour and numeric morph targets', async () => {
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
  const latest = () => worker.requests.filter((r) => r.type === 'render').at(-1)!.settings;
  const change = async (id: string, value: string) => {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input', { bubbles: true }));
    input(id).dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  };
  await settle();
  for (const { id } of WEAVE_CONTROLS) expect(input(id)).toBeDisabled();
  input('contourWeave').checked = true;
  input('contourWeave').dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(latest().contourWeave).toBe(true);
  expect(input('axis')).toBeDisabled();
  expect(input('gapEase')).toBeDisabled();
  expect(input('spiral')).toBeDisabled();
  expect(input('lines')).not.toBeDisabled();
  expect(document.getElementById('weaveRotation')).toBeNull();
  for (const { id } of WEAVE_CONTROLS) expect(input(id)).not.toBeDisabled();
  await change('weaveAzimuthN', '-42');
  expect(input('weaveAzimuth').value).toBe('-42');
  expect(latest().weaveAzimuth).toBe(-42);
  input('undo').click();
  await settle();
  expect(input('weaveAzimuth').value).toBe('0');
  input('redo').click();
  await settle();
  expect(input('weaveAzimuth').value).toBe('-42');
  await change('weavePattern', 'twill');
  await change('weaveOutput', 'crossings');
  expect(latest()).toMatchObject({ weavePattern: 'twill', weaveOutput: 'crossings' });
  await change('weaveColorHex', '#123456');
  expect(latest().weaveColor).toBe('#123456');
  expect(input('weaveColor').value).toBe('#123456');
  input('undo').click();
  await settle();
  expect(input('weaveColorHex').value).toBe('#b87333');
  input('redo').click();
  await settle();
  expect(input('weaveColorHex').value).toBe('#123456');
  for (const [id, value] of [
    ['weaveAzimuth', 120],
    ['weaveColor', '#abcdef'],
  ] as const)
    document.dispatchEvent(
      new CustomEvent('morphchange', { detail: { id, value, active: true, dimension: 1 } }),
    );
  await settle();
  expect(latest().morphTargets).toMatchObject({ weaveAzimuth: 120, weaveColor: '#abcdef' });
  document.dispatchEvent(
    new CustomEvent('randomlockchange', { detail: { id: 'weaveAzimuth', locked: true } }),
  );
  document.dispatchEvent(
    new CustomEvent('randomizegroup', {
      detail: { ids: ['weaveAzimuth', 'weaveDensity'], title: 'Weave test' },
    }),
  );
  await settle();
  expect(latest().weaveAzimuth).toBe(-42);
  expect(latest().weaveDensity).toBeGreaterThanOrEqual(65);
  expect(latest().weaveDensity).toBeLessThanOrEqual(150);
  expect(latest().weaveOutput).toBe('crossings');
  const capture = { snapshot: undefined as unknown };
  document.dispatchEvent(new CustomEvent('captureparametersnapshot', { detail: capture }));
  expect(capture.snapshot).toMatchObject({
    parameters: { contourWeave: true, weaveAzimuth: -42, weaveColor: '#123456' },
    randomLocks: ['weaveAzimuth'],
  });
  input('contourWeave').checked = false;
  input('contourWeave').dispatchEvent(new Event('change', { bubbles: true }));
  for (const { id } of WEAVE_CONTROLS) expect(input(id)).toBeDisabled();
  expect(input('weaveColorHex')).toBeDisabled();
  expect(input('axis')).not.toBeDisabled();
  expect(input('gapEase')).not.toBeDisabled();
  await change('demo', 'hyperbolic-tiling');
  expect(input('contourWeave')).toBeDisabled();
  await change('demo', 'knot');
  expect(input('contourWeave')).not.toBeDisabled();
});
