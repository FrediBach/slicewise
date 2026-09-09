// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { requestPreset } from './presets/bridge';
import type { JsonObject } from './presets/types';
import { createThreeDProject } from './three-d-project';

vi.mock('./animation-storage', () => ({
  localAnimationProjectId: () => 'preset-test',
  loadAnimationProject: async () => null,
  saveAnimationProject: vi.fn(async () => undefined),
}));
vi.mock('./video-encoder', () => ({ detectAnimationVideoCodec: async () => null }));
class WorkerStub extends EventTarget {
  postMessage() {}
  terminate() {}
}
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('captures complete defaults, restores disabled settings, and undoes a full preset load', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', WorkerStub);
  document.body.innerHTML = renderToStaticMarkup(<App />);
  await import('./slicer');
  const first = await requestPreset({ command: 'capture' });
  expect(Object.keys(first.sections)).toHaveLength(7);
  const modified = structuredClone(first);
  const drawing = (modified.sections.drawing.data as JsonObject).settings as JsonObject;
  drawing.lines = 73;
  drawing.blockGlitch = false;
  drawing.blockGlitchCount = 9;
  const exported = (modified.sections.export.data as JsonObject).settings as JsonObject;
  exported.drawFeed = 1234;
  await requestPreset({ command: 'apply', document: modified });
  const restored = await requestPreset({ command: 'capture' });
  expect((restored.sections.drawing.data as JsonObject).settings).toMatchObject({
    lines: 73,
    blockGlitch: false,
    blockGlitchCount: 9,
  });
  expect((restored.sections.export.data as JsonObject).settings).toMatchObject({ drawFeed: 1234 });
  expect((document.getElementById('drawFeedN') as HTMLInputElement).value).toBe('1234');
  await requestPreset({ command: 'undo' });
  expect((await requestPreset({ command: 'capture' })).sections).toEqual(first.sections);

  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'animation' } }));
  await vi.advanceTimersByTimeAsync(0);
  const animated = await requestPreset({ command: 'capture' });
  expect(animated.entryMode).toBe('animation');
  const animation = (animated.sections.animation.data as JsonObject).project as JsonObject;
  ((animation.keyframes as JsonObject[])[0].values as JsonObject).zoom = 2.5;
  ((animated.sections.drawing.data as JsonObject).settings as JsonObject).zoom = 1.7;
  await requestPreset({ command: 'apply', document: animated });
  const preserved = await requestPreset({ command: 'capture' });
  expect((preserved.sections.drawing.data as JsonObject).settings).toMatchObject({ zoom: 1.7 });
  expect(
    ((preserved.sections.animation.data as JsonObject).project as JsonObject).baseSettings,
  ).toMatchObject({ zoom: 1 });
  expect((document.getElementById('zoomN') as HTMLInputElement).value).toBe('2.5');
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'config' } }));
  expect((document.getElementById('zoomN') as HTMLInputElement).value).toBe('1.7');

  const physical = structuredClone(preserved);
  physical.entryMode = '3d';
  const project = { ...createThreeDProject('placeholder') };
  delete (project as Partial<typeof project>).sourceId;
  delete (project as Partial<typeof project>).sizeConfirmed;
  project.longestMm = 123;
  project.buildVolumeMm = [300, 400, 500];
  (physical.sections.threeD.data as JsonObject).project = project as unknown as JsonObject;
  await requestPreset({ command: 'apply', document: physical });
  const threeD = await requestPreset({ command: 'capture' });
  expect(threeD.entryMode).toBe('3d');
  expect((threeD.sections.threeD.data as JsonObject).project).toMatchObject({
    longestMm: 123,
    buildVolumeMm: [300, 400, 500],
  });
  const invalid = structuredClone(threeD);
  ((invalid.sections.drawing.data as JsonObject).settings as JsonObject).lines = 1e10;
  await expect(requestPreset({ command: 'apply', document: invalid })).rejects.toThrow();
  expect((await requestPreset({ command: 'capture' })).sections).toEqual(threeD.sections);
  for (const corrupt of [
    (value: JsonObject) => {
      value.resetBars = '4';
    },
    (value: JsonObject) => {
      (value.timeSignature as JsonObject).denominator = '4';
    },
    (value: JsonObject) => {
      ((value.lanes as JsonObject[])[0].timing as JsonObject) = { mode: 'fit', cycleBars: '2' };
    },
  ]) {
    const invalid = structuredClone(threeD);
    corrupt((invalid.sections.sequencer.data as JsonObject).project as JsonObject);
    await expect(requestPreset({ command: 'validate', document: invalid })).rejects.toThrow();
  }
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    requestPreset({ command: 'apply', document: first, signal: cancelled.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect((await requestPreset({ command: 'capture' })).sections).toEqual(threeD.sections);
  document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode: 'config' } }));
  const dirty = vi.fn();
  document.addEventListener('presetdirty', dirty);
  document
    .getElementById('bed')!
    .dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true }));
  expect(dirty).toHaveBeenCalled();
  document.removeEventListener('presetdirty', dirty);
});
