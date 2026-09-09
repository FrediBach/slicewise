// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { presetEnvelope } from '../../test/fixtures/presets';
import { PresetsPanel } from './PresetsPanel';
import type { PresetPickers } from '../../lib/presets/filesystem';
const pickers = window as unknown as PresetPickers;

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  destination: vi.fn(),
  save: vi.fn(),
  catalog: vi.fn(),
  example: vi.fn(),
}));
vi.mock('../../lib/presets/bridge', () => ({ requestPreset: mocks.request }));
vi.mock('../../lib/presets/library', () => ({
  rememberedPresetFolder: async () => null,
  rememberPresetFolder: vi.fn(),
  listExamplePresets: mocks.catalog,
  loadExamplePreset: mocks.example,
  copyPresetToFolder: vi.fn(),
  renamePresetFile: vi.fn(),
}));
vi.mock('../../lib/presets/filesystem', async (original) => ({
  ...(await original<typeof import('../../lib/presets/filesystem')>()),
  PresetFileSession: { destination: mocks.destination },
}));
beforeEach(() => {
  vi.resetAllMocks();
  const preset = presetEnvelope();
  mocks.catalog.mockResolvedValue([
    { id: preset.id, name: 'Example study', description: 'Try it', tags: [], mode: 'config' },
  ]);
  mocks.example.mockResolvedValue(preset);
  mocks.request.mockImplementation(async (request) => request.document ?? presetEnvelope());
  mocks.destination.mockResolvedValue({ save: mocks.save });
  mocks.save.mockResolvedValue(undefined);
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: vi.fn(async () => ({ name: 'study.slicewise-preset.json' })),
  });
  Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: vi.fn() });
});
function openPanel() {
  render(<PresetsPanel />);
  fireEvent.click(screen.getByText('Presets'));
}
it('opens the native picker before capture and keeps edits made during a write unsaved', async () => {
  let finish!: () => void;
  mocks.save.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  openPanel();
  fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Study' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
  expect(pickers.showSaveFilePicker).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  act(() => document.dispatchEvent(new CustomEvent('presetdirty')));
  await act(async () => finish());
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  expect(mocks.save.mock.calls[0][0].metadata.name).toBe('Study');
});
it('treats picker cancellation as normal and never captures or writes', async () => {
  vi.mocked(pickers.showSaveFilePicker).mockRejectedValue(
    new DOMException('Cancelled', 'AbortError'),
  );
  openPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save preset' })).toBeEnabled());
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.queryByText(/Cancelled/)).not.toBeInTheDocument();
});
it('loads read-only examples through the runtime and assigns attribution to local copies', async () => {
  openPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Examples' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Use example' }));
  const save = await screen.findByRole('button', { name: 'Save local copy' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const saved = mocks.save.mock.calls[0][0];
  expect(saved.id).not.toBe(presetEnvelope().id);
  expect(saved.metadata.derivedFrom).toBeDefined();
  expect(mocks.request.mock.calls[0][0]).toMatchObject({ command: 'apply' });
});
