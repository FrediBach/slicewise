// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import type { ContourSettings } from './contour-engine';

vi.mock('./animation-storage', () => ({
  localAnimationProjectId: () => 'runtime-test',
  loadAnimationProject: async () => null,
  saveAnimationProject: async () => undefined,
}));
vi.mock('./video-encoder', () => ({ detectAnimationVideoCodec: async () => null }));

type Request = {
  type: string;
  id: number;
  meshVersion: number;
  quick: boolean;
  settings: ContourSettings;
};
class SlowWorker extends EventTarget {
  static instances: SlowWorker[] = [];
  renders: Request[] = [];
  constructor() {
    super();
    SlowWorker.instances.push(this);
  }
  postMessage(request: Request) {
    if (request.type === 'render') this.renders.push(request);
  }
  complete(request = this.renders.at(-1)!) {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'result',
          id: request.id,
          meshVersion: request.meshVersion,
          result: {
            svg: `<svg xmlns="http://www.w3.org/2000/svg"><path data-frame="${request.id}" d="M0 0L10 10"/></svg>`,
            W: 210,
            H: 297,
            paths: 1,
            nodes: 2,
            bytes: 100,
            ms: 250,
            quick: request.quick,
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

it('displays slow playback results, reuses cached frames, and settles exactly on pause', async () => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  vi.stubGlobal('Worker', SlowWorker);
  document.body.innerHTML = renderToStaticMarkup(<App />);
  await import('./slicer');
  const worker = SlowWorker.instances[0];
  const command = (detail: Record<string, unknown>) =>
    document.dispatchEvent(new CustomEvent('animationcommand', { detail }));
  const displayed = () => document.querySelector('[data-frame]')?.getAttribute('data-frame');
  await vi.advanceTimersByTimeAsync(200);
  worker.complete();
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'animation' } }));
  await vi.advanceTimersByTimeAsync(200);
  worker.complete();
  const exactFrame = displayed();

  command({ type: 'play-toggle' });
  await vi.advanceTimersByTimeAsync(200);
  const first = worker.renders.at(-1)!;
  expect(first.quick).toBe(true);
  const count = worker.renders.length;
  await vi.advanceTimersByTimeAsync(250);
  expect(worker.renders).toHaveLength(count);
  worker.complete(first);
  expect(displayed()).toBe(String(first.id));
  expect(displayed()).not.toBe(exactFrame);

  await vi.advanceTimersByTimeAsync(250);
  const second = worker.renders.at(-1)!;
  expect(second.id).toBeGreaterThan(first.id);
  worker.complete(second);
  expect(displayed()).toBe(String(second.id));

  command({ type: 'play-toggle' });
  await vi.advanceTimersByTimeAsync(32);
  expect(worker.renders.at(-1)!.quick).toBe(false);
  worker.complete();
  command({ type: 'seek', timeMs: 0 });
  await vi.advanceTimersByTimeAsync(32);
  worker.complete();
  command({ type: 'play-toggle' });
  // Frame zero is presented immediately from cache, without waiting on work.
  expect(displayed()).toBe(String(first.id));
  await vi.advanceTimersByTimeAsync(200);
  const prefetch = worker.renders.at(-1)!;
  command({ type: 'play-toggle' });
  worker.complete(prefetch);
  expect(displayed()).toBe(String(first.id));
  await vi.advanceTimersByTimeAsync(32);
  expect(worker.renders.at(-1)!.quick).toBe(false);
  worker.complete();
  expect(displayed()).toBe(String(worker.renders.at(-1)!.id));
});
