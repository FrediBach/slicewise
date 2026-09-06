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
it('uploads cutting paths, binds placement and divergence, and restores undo', async () => {
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
  await settle();
  input('axis').value = 'svg';
  input('axis').dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(input('lines')).toBeDisabled();
  expect(input('gapEase')).toBeDisabled();
  expect(input('sliceLfo')).toBeDisabled();
  expect(input('spiral')).toBeDisabled();
  expect(input('divergence')).not.toBeDisabled();
  const file = new File(
    ['<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>'],
    'logo.svg',
    { type: 'image/svg+xml' },
  );
  Object.defineProperty(input('svgSliceFile'), 'files', { value: [file], configurable: true });
  input('svgSliceFile').dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(
    () => expect(document.getElementById('svgSliceStatus')?.textContent).toContain('1 SVG'),
    { timeout: 5000 },
  );
  await settle();
  expect(latest().svgSlicePaths).toEqual([[-1, 1, 1, -1]]);
  input('svgSliceScaleN').value = '60';
  input('svgSliceScaleN').dispatchEvent(new Event('input', { bubbles: true }));
  input('svgSliceScaleN').dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(latest().svgSliceScale).toBe(60);
  input('undo').click();
  await settle();
  expect(latest().svgSliceScale).toBe(100);
  expect(latest().svgSlicePaths).toHaveLength(1);
  input('redo').click();
  await settle();
  expect(latest().svgSliceScale).toBe(60);
  const drop = document.getElementById('svgSliceDrop')!;
  expect(drop).toHaveClass('dropzone');
  const propagated = vi.fn();
  document.addEventListener('drop', propagated);
  const badDrop = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(badDrop, 'dataTransfer', {
    value: { files: [new File(['<svg/>'], 'empty.svg')] },
  });
  drop.dispatchEvent(badDrop);
  await vi.waitFor(
    () => expect(document.getElementById('svgSliceStatus')?.textContent).toContain('No measurable'),
    { timeout: 5000 },
  );
  expect(propagated).not.toHaveBeenCalled();
  expect(latest().svgSlicePaths).toEqual([[-1, 1, 1, -1]]);
  document.removeEventListener('drop', propagated);
});
