// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { WEATHER_COLOR_CONTROLS } from './weather-bands';
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
it('sends weather bands to the worker and restores the toggle with undo and redo', async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.stubGlobal('Worker', WorkerStub);
  document.body.innerHTML = renderToStaticMarkup(<App />);
  await import('./slicer');
  const worker = WorkerStub.instances[0];
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(400);
    worker.complete();
    await vi.advanceTimersByTimeAsync(400);
  };
  const toggle = document.getElementById('weatherBands') as HTMLInputElement;
  const current = () => worker.requests.filter((r) => r.type === 'render').at(-1)!.settings;
  await settle();
  expect(toggle.checked).toBe(false);
  for (const { id } of WEATHER_COLOR_CONTROLS) {
    expect(document.getElementById(id)).toBeDisabled();
    expect(document.getElementById(id + 'Hex')).toBeDisabled();
  }
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(current().weatherBands).toBe(true);
  document.getElementById('undo')!.click();
  await settle();
  expect(toggle.checked).toBe(false);
  expect(current().weatherBands).toBe(false);
  document.getElementById('redo')!.click();
  await settle();
  expect(toggle.checked).toBe(true);
  expect(current().weatherBands).toBe(true);
  for (const [index, { id, defaultValue }] of WEATHER_COLOR_CONTROLS.entries()) {
    const picker = document.getElementById(id) as HTMLInputElement;
    const hex = document.getElementById(id + 'Hex') as HTMLInputElement;
    expect(picker).not.toBeDisabled();
    expect(hex).not.toBeDisabled();
    const color = ['#123456', '#abcdef', '#654321'][index];
    const editor = index === 1 ? picker : hex;
    editor.value = color;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(current()[id]).toBe(color);
    expect(picker.value).toBe(color);
    expect(hex.value).toBe(color);
    document.getElementById('undo')!.click();
    await settle();
    expect(current()[id]).toBe(defaultValue);
    expect(picker.value).toBe(defaultValue);
    expect(hex.value).toBe(defaultValue);
    document.getElementById('redo')!.click();
    await settle();
    expect(current()[id]).toBe(color);
    expect(hex.value).toBe(color);
    hex.value = 'invalid';
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    hex.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(current()[id]).toBe(color);
  }
});
