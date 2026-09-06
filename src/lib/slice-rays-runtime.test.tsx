// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
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
it('binds slice rays, restores history, and disables incompatible modes', async () => {
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
  expect(input('sliceRays')).not.toBeChecked();
  expect(input('sliceRayLength')).toBeDisabled();
  change('sliceRays', true);
  await settle();
  expect(latest().sliceRays).toBe(true);
  expect(input('sliceRayLength')).not.toBeDisabled();
  for (const [id, value] of [
    ['sliceRayAmount', '36'],
    ['sliceRayLength', '22'],
    ['sliceRayVariation', '0'],
    ['sliceRayFade', '75'],
  ]) {
    change(id + 'N', value);
    await settle();
    expect(input(id).value).toBe(value);
    expect(latest()[id as keyof ContourSettings]).toBe(Number(value));
  }
  input('undo').click();
  await settle();
  expect(latest().sliceRayFade).toBe(50);
  expect(input('sliceRayFadeN').value).toBe('50');
  input('redo').click();
  await settle();
  expect(latest().sliceRayFade).toBe(75);
  change('axis', 'spherical');
  await settle();
  expect(input('sliceRays')).toBeDisabled();
  expect(input('sliceRayAmount')).toBeDisabled();
  change('axis', 'up');
  await settle();
  expect(input('sliceRays')).not.toBeDisabled();
  expect(input('sliceRays')).toBeChecked();
  for (const mode of ['spiral', 'sliceLfo', 'contourWeave']) {
    change(mode, true);
    await settle();
    expect(input('sliceRays')).toBeDisabled();
    change(mode, false);
    await settle();
    expect(input('sliceRays')).not.toBeDisabled();
  }
});
