// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import type { ThreeDRequest } from './three-d-project';
vi.mock('./animation-storage', () => ({
  localAnimationProjectId: () => '3d-test',
  loadAnimationProject: async () => null,
  saveAnimationProject: vi.fn(),
}));
vi.mock('./video-encoder', () => ({ detectAnimationVideoCodec: vi.fn(async () => null) }));
class WorkerStub extends EventTarget {
  static instances: WorkerStub[] = [];
  requests: Array<ThreeDRequest & { type?: string }> = [];
  terminated = false;
  constructor() {
    super();
    WorkerStub.instances.push(this);
  }
  postMessage(request: ThreeDRequest & { type?: string }) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  complete() {
    const r = this.requests.at(-1)!;
    this.dispatchEvent(
      new MessageEvent('message', {
        data: { id: r.id, sourceVersion: r.source.version, error: 'test completion' },
      }),
    );
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.body.className = '';
});
it('integrates mode exits, shared Object edits, scoped history, source replacement and export blocking', async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.stubGlobal('Worker', WorkerStub);
  document.body.innerHTML = renderToStaticMarkup(<App />);
  await import('./slicer');
  const input = (id: string) => document.getElementById(id) as HTMLInputElement;
  const mode = (mode: string) =>
    document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode } }));
  const change = (id: string, value: string | boolean) => {
    if (typeof value === 'boolean') input(id).checked = value;
    else input(id).value = value;
    input(id).dispatchEvent(new Event('input', { bubbles: true }));
    input(id).dispatchEvent(new Event('change', { bubbles: true }));
  };
  const settle = () => vi.advanceTimersByTimeAsync(400);
  mode('animation');
  await settle();
  expect(document.body).toHaveClass('animation-mode');
  mode('3d');
  await settle();
  expect(document.body).toHaveClass('three-d-mode');
  expect(document.body).not.toHaveClass('animation-mode');
  expect(input('save')).toBeDisabled();
  const worker = WorkerStub.instances.at(-1)!;
  const latest = () => worker.requests.at(-1)!;
  expect(latest().project).toMatchObject({ longestMm: 100, sizeConfirmed: false });
  const initialSource = latest().source.id;
  worker.complete();
  document.dispatchEvent(
    new CustomEvent('threedprojectchange', { detail: { longestMm: 150, sizeConfirmed: true } }),
  );
  await settle();
  worker.complete();
  change('objectEnabled', true);
  change('objectScaleX', '125');
  await settle();
  worker.complete();
  expect(latest().settings).toMatchObject({ objectEnabled: true, objectScaleX: 125 });
  expect(latest().project.longestMm).toBe(150);
  input('undo').click();
  worker.complete();
  await settle();
  worker.complete();
  expect(input('objectScaleX').value).toBe('100');
  expect(latest().project.longestMm).toBe(150);
  input('undo').click();
  worker.complete();
  await settle();
  worker.complete();
  expect(latest().project.longestMm).toBe(100);
  input('redo').click();
  worker.complete();
  await settle();
  worker.complete();
  expect(latest().project.longestMm).toBe(150);
  change('objectEnabled', true);
  change('objectScaleX', '140');
  await settle();
  worker.complete();
  mode('config');
  await settle();
  expect(worker.terminated).toBe(true);
  expect(input('save')).not.toBeDisabled();
  expect(input('objectScaleX').value).toBe('140');
  input('undo').click();
  expect(input('objectScaleX').value).toBe('100');
  input('redo').click();
  expect(input('objectScaleX').value).toBe('140');
  mode('3d');
  const second = WorkerStub.instances.at(-1)!;
  expect(second.requests[0].project.longestMm).toBe(150);
  second.complete();
  change('demo', 'torus');
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.source.id).not.toBe(initialSource);
  expect(second.requests.at(-1)!.project).toMatchObject({ longestMm: 100, sizeConfirmed: false });
  mode('sequencer');
  expect(second.terminated).toBe(true);
  expect(document.body).toHaveClass('sequencer-mode');
  mode('config');
  await settle();
});
