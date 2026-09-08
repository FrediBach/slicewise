// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { OBJECT_CONTROLS, OBJECT_DEFAULTS } from './object-settings';
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
it('binds object controls, history, snapshots, randomization, sources and animation', async () => {
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
  expect(latest()).toMatchObject(OBJECT_DEFAULTS);
  expect(input('objectScaleX')).toBeDisabled();
  change('objectEnabled', true);
  await settle();
  expect(input('objectScaleX')).not.toBeDisabled();
  for (const { id } of OBJECT_CONTROLS) {
    change(id + 'N', id.includes('Scale') ? '120' : '25');
    await settle();
    expect(input(id).value).toBe(id.includes('Scale') ? '120' : '25');
    expect(latest()[id]).toBe(id.includes('Scale') ? 120 : 25);
  }
  change('objectBendAxis', 'y');
  await settle();
  expect(latest().objectBendAxis).toBe('y');
  input('undo').click();
  await settle();
  expect(input('objectBendAxis').value).toBe('z');
  input('redo').click();
  await settle();
  expect(input('objectBendAxis').value).toBe('y');
  change('objectTwist', false);
  await settle();
  expect(input('objectTwistAngle')).toBeDisabled();
  expect(latest().objectTwistAngle).toBe(25);
  change('objectTwist', true);
  await settle();
  document.dispatchEvent(
    new CustomEvent('morphchange', {
      detail: { id: 'objectTwistAngle', active: true, value: 90, dimension: 1 },
    }),
  );
  await settle();
  expect(latest().morphTargets.objectTwistAngle).toBe(90);
  const captured: { snapshot?: { parameters: ContourSettings; randomLocks: string[] } } = {};
  document.dispatchEvent(new CustomEvent('captureparametersnapshot', { detail: captured }));
  expect(captured.snapshot?.parameters.objectBendAxis).toBe('y');
  input('resetObject').click();
  await settle();
  expect(latest()).toMatchObject(OBJECT_DEFAULTS);
  expect(latest().morphTargets).not.toHaveProperty('objectTwistAngle');
  input('undo').click();
  await settle();
  expect(latest().objectEnabled).toBe(true);
  expect(latest().objectBendAxis).toBe('y');
  expect(latest().morphTargets.objectTwistAngle).toBe(90);
  document.dispatchEvent(new CustomEvent('applyparametersnapshot', { detail: captured.snapshot }));
  await settle();
  expect(latest().objectScaleX).toBe(120);
  document.dispatchEvent(
    new CustomEvent('randomlockchange', { detail: { id: 'objectScaleX', locked: true } }),
  );
  document.dispatchEvent(
    new CustomEvent('randomizegroup', {
      detail: { ids: ['objectScaleX', 'objectScaleY'], title: 'Object' },
    }),
  );
  await settle();
  expect(latest().objectScaleX).toBe(120);
  expect(latest().objectScaleY).toBeGreaterThanOrEqual(70);
  expect(latest().objectScaleY).toBeLessThanOrEqual(140);
  expect(latest().objectBendAxis).toBe('y');
  change('demo', 'hyperbolic-tiling');
  await settle();
  expect(input('objectEnabled')).toBeDisabled();
  expect(input('objectEnabled')).toBeChecked();
  change('demo', 'knot');
  await settle();
  expect(input('objectEnabled')).not.toBeDisabled();
  expect(input('objectTwistAngle')).not.toBeDisabled();
  expect(latest().objectTwistAngle).toBe(25);
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'animation' } }));
  await settle();
  expect(input('objectTwistAngle')).not.toBeDisabled();
  expect(input('objectBendAxis')).toBeDisabled();
  change('objectTwistAngleN', '75');
  await settle();
  expect(latest().objectTwistAngle).toBe(75);
  expect(latest().morphEnabled).toBe(false);
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'config' } }));
  await settle();
  expect(latest().objectTwistAngle).toBe(25);
});
