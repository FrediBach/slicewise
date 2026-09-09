// @vitest-environment jsdom
import { sha256 } from './presets/assets';
const files = import.meta.glob('../../public/presets/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { requestPreset } from './presets/bridge';
import { parsePreset } from './presets/document';
import type { PresetDocument } from './presets/types';

vi.mock('./animation-storage', () => ({
  localAnimationProjectId: () => 'examples-test',
  loadAnimationProject: async () => null,
  saveAnimationProject: async () => undefined,
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

it('loads every bundled example through the same complete runtime importer', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', WorkerStub);
  document.body.innerHTML = renderToStaticMarkup(<App />);
  await import('./slicer');
  const catalog = JSON.parse(files['../../public/presets/index.json']);
  expect(catalog.version).toBe(1);
  expect(new Set(catalog.presets.map((entry: { mode: string }) => entry.mode))).toEqual(
    new Set(['config', 'animation', 'sequencer', '3d']),
  );
  for (const example of catalog.presets) {
    const text = files[`../../public/presets/${example.file}`];
    expect(await sha256(new TextEncoder().encode(text))).toBe(example.sha256);
    const preset: PresetDocument = parsePreset(text);
    expect(preset.id).toBe(example.id);
    expect(Object.values(preset.assets).every((asset) => asset.content.kind === 'embedded')).toBe(
      true,
    );
    await requestPreset({ command: 'apply', document: preset });
    const restored = await requestPreset({ command: 'capture' });
    expect(restored.entryMode).toBe(example.mode);
    expect(restored.sections).toEqual(preset.sections);
  }
});
