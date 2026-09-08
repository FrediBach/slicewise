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
  for (const { id, min, max } of OBJECT_CONTROLS) {
    const value = Math.max(min, Math.min(max, id.includes('Scale') ? 120 : 25));
    change(id + 'N', String(value));
    await settle();
    expect(input(id).value).toBe(String(value));
    expect(latest()[id]).toBe(value);
  }
  expect(input('objectNoiseSeed').step).toBe('1');
  change('objectNoiseSeedN', '42.7');
  await settle();
  expect(latest().objectNoiseSeed).toBe(43);
  expect(input('objectNoiseSeedN').value).toBe('43');
  for (const [group, axis, amount, value] of [
    ['objectBulge', 'objectBulgeAxis', 'objectBulgeAmount', 'x'],
    ['objectShear', 'objectShearAxis', 'objectShearAmount', 'y'],
    ['objectRipple', 'objectRippleAxis', 'objectRippleAmount', 'x'],
  ]) {
    change(axis, value);
    await settle();
    expect(latest()[axis]).toBe(value);
    change(group, false);
    await settle();
    expect(input(axis)).toBeDisabled();
    expect(input(amount)).toBeDisabled();
    expect(latest()[amount]).toBe(amount === 'objectRippleAmount' ? 20 : 25);
    input('undo').click();
    await settle();
    expect(input(axis)).not.toBeDisabled();
    expect(input(amount)).not.toBeDisabled();
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
  document.dispatchEvent(
    new CustomEvent('morphchange', {
      detail: { id: 'objectBulgeAmount', active: true, value: -50, dimension: 1 },
    }),
  );
  document.dispatchEvent(
    new CustomEvent('morphchange', {
      detail: { id: 'objectShearAmount', active: true, value: 80, dimension: 2 },
    }),
  );
  await settle();
  for (const id of ['objectRipplePhase', 'objectNoiseAmount', 'objectNoiseSeed']) {
    document.dispatchEvent(
      new CustomEvent('morphchange', { detail: { id, active: true, value: 10, dimension: 1 } }),
    );
  }
  await settle();
  const captured: { snapshot?: { parameters: ContourSettings; randomLocks: string[] } } = {};
  document.dispatchEvent(new CustomEvent('captureparametersnapshot', { detail: captured }));
  expect(captured.snapshot?.parameters.objectBendAxis).toBe('y');
  expect(captured.snapshot?.parameters.objectBulgeAxis).toBe('x');
  expect(captured.snapshot?.parameters.objectShearAxis).toBe('y');
  expect(captured.snapshot?.parameters.morphTargets.objectBulgeAmount).toBe(-50);
  expect(captured.snapshot?.parameters.morphTargets2.objectShearAmount).toBe(80);
  input('resetObject').click();
  await settle();
  expect(latest()).toMatchObject(OBJECT_DEFAULTS);
  expect(latest().morphTargets).not.toHaveProperty('objectTwistAngle');
  expect(latest().morphTargets).not.toHaveProperty('objectBulgeAmount');
  expect(latest().morphTargets2).not.toHaveProperty('objectShearAmount');
  for (const id of ['objectRipplePhase', 'objectNoiseAmount', 'objectNoiseSeed'])
    expect(latest().morphTargets).not.toHaveProperty(id);
  input('undo').click();
  await settle();
  for (const id of ['objectRipplePhase', 'objectNoiseAmount', 'objectNoiseSeed'])
    expect(latest().morphTargets[id]).toBe(10);
  expect(latest().objectEnabled).toBe(true);
  expect(latest().objectBendAxis).toBe('y');
  expect(latest().morphTargets.objectTwistAngle).toBe(90);
  expect(latest().morphTargets.objectBulgeAmount).toBe(-50);
  expect(latest().morphTargets2.objectShearAmount).toBe(80);
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
  expect(input('objectBulgeAmount')).toBeDisabled();
  expect(input('objectShearAxis')).toBeDisabled();
  change('demo', 'knot');
  await settle();
  expect(input('objectEnabled')).not.toBeDisabled();
  expect(input('objectTwistAngle')).not.toBeDisabled();
  expect(input('objectBulgeAmount')).not.toBeDisabled();
  expect(input('objectShearAxis')).not.toBeDisabled();
  expect(latest().objectTwistAngle).toBe(25);
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'animation' } }));
  await settle();
  expect(input('objectTwistAngle')).not.toBeDisabled();
  expect(input('objectBendAxis')).toBeDisabled();
  change('objectTwistAngleN', '75');
  await settle();
  expect(latest().objectTwistAngle).toBe(75);
  expect(latest().morphEnabled).toBe(false);
  change('objectBulgeAmountN', '-30');
  change('objectShearAmountN', '80');
  await settle();
  expect(latest().objectBulgeAmount).toBe(-30);
  expect(latest().objectShearAmount).toBe(80);
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'config' } }));
  await settle();
  expect(latest().objectTwistAngle).toBe(25);
  expect(latest().objectBulgeAmount).toBe(25);
  expect(latest().objectShearAmount).toBe(25);
});
