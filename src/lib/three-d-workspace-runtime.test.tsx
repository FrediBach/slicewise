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
  change('lines', '6');
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.settings.lines).toBe(6);
  expect(document.querySelectorAll('#lines')).toHaveLength(1);
  expect(document.querySelectorAll('#axis')).toHaveLength(1);
  const originalDirection = second.requests.at(-1)!.project.viewDirection;
  document.dispatchEvent(new CustomEvent('threedalignview', { detail: { direction: [1, 0, 0] } }));
  second.complete();
  await settle();
  second.complete();
  expect(input('axis').value).toBe('cam');
  expect(second.requests.at(-1)!.project.viewDirection).toEqual([1, 0, 0]);
  input('undo').click();
  second.complete();
  await settle();
  second.complete();
  expect(input('axis').value).toBe('up');
  expect(second.requests.at(-1)!.project.viewDirection).toEqual(originalDirection);
  document.dispatchEvent(
    new CustomEvent('threedprojectchange', {
      detail: { profileToleranceMm: 0.02, buildVolumeMm: [180, 120, 160] },
    }),
  );
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project.profileToleranceMm).toBe(0.02);
  expect(second.requests.at(-1)!.project.buildVolumeMm).toEqual([180, 120, 160]);
  input('undo').click();
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project.profileToleranceMm).toBe(0.05);
  expect(second.requests.at(-1)!.project.buildVolumeMm).toEqual([220, 220, 250]);
  input('redo').click();
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project.profileToleranceMm).toBe(0.02);
  expect(second.requests.at(-1)!.project.buildVolumeMm).toEqual([180, 120, 160]);
  document.dispatchEvent(
    new CustomEvent('threedprojectchange', {
      detail: { profileToleranceMm: -1, buildVolumeMm: [-1, 100, 100] },
    }),
  );
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project.profileToleranceMm).toBe(0.02);
  expect(second.requests.at(-1)!.project.buildVolumeMm).toEqual([180, 120, 160]);
  document.dispatchEvent(
    new CustomEvent('threedprojectchange', { detail: { printerPresetId: 'prusa-mk4s' } }),
  );
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project).toMatchObject({
    printerPresetId: 'prusa-mk4s',
    buildVolumeMm: [250, 210, 220],
  });
  document.dispatchEvent(
    new CustomEvent('threedprojectchange', { detail: { buildVolumeMm: [200, 210, 220] } }),
  );
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project.printerPresetId).toBeUndefined();
  input('undo').click();
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project).toMatchObject({
    printerPresetId: 'prusa-mk4s',
    buildVolumeMm: [250, 210, 220],
  });
  document.dispatchEvent(
    new CustomEvent('threedprojectchange', { detail: { printerPresetId: 'unknown-printer' } }),
  );
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project.printerPresetId).toBe('prusa-mk4s');
  document.dispatchEvent(
    new CustomEvent('threedprojectchange', { detail: { printerPresetId: 'custom' } }),
  );
  second.complete();
  await settle();
  second.complete();
  expect(second.requests.at(-1)!.project.printerPresetId).toBeUndefined();
  expect(second.requests.at(-1)!.project.buildVolumeMm).toEqual([250, 210, 220]);
  mode('sequencer');
  expect(second.terminated).toBe(true);
  expect(document.body).toHaveClass('sequencer-mode');
  mode('config');
  await settle();
});
