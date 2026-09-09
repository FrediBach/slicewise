import { describe, expect, it, vi } from 'vitest';
import { presetEnvelope } from '../../test/fixtures/presets';
import { parsePreset, serializePreset } from './document';
import { copyPresetToFolder, renamePresetFile } from './library';
import type { PresetDirectoryHandle, PresetFileHandle } from './filesystem';

function memoryFolder() {
  const files = new Map<string, string>();
  const handle = (name: string): PresetFileHandle => ({
    kind: 'file',
    name,
    getFile: async () => new File([files.get(name)!], name),
    createWritable: async () => {
      let pending = '';
      return {
        write: async (text) => {
          pending = text;
        },
        close: async () => {
          files.set(name, pending);
        },
        abort: async () => undefined,
      };
    },
  });
  const folder: PresetDirectoryHandle = {
    kind: 'directory',
    name: 'Presets',
    async *values() {
      for (const name of files.keys()) yield handle(name);
    },
    getFileHandle: async (name, options) => {
      if (!files.has(name)) {
        if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
        files.set(name, '');
      }
      return handle(name);
    },
    removeEntry: vi.fn(async (name) => {
      files.delete(name);
    }),
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  };
  return { files, folder, handle };
}

describe('local preset files', () => {
  it('creates unique filenames without replacing existing or copied UUIDs', async () => {
    const { files, folder } = memoryFolder();
    const preset = presetEnvelope();
    const first = await copyPresetToFolder(folder, preset);
    const second = await copyPresetToFolder(folder, preset);
    expect(second.name).not.toBe(first.name);
    expect(files.size).toBe(2);
    expect(parsePreset(files.get(second.name)!).id).toBe(preset.id);
  });
  it('renames through a verified copy, retaining identity and updating display name', async () => {
    const { files, folder } = memoryFolder();
    const preset = presetEnvelope();
    const original = await copyPresetToFolder(folder, preset);
    const renamed = await renamePresetFile(folder, original, 'New name');
    expect(files.has(original.name)).toBe(false);
    expect(parsePreset(files.get(renamed.name)!)).toMatchObject({
      id: preset.id,
      metadata: { name: 'New name' },
    });
  });
  it('retains both copies when removal is denied', async () => {
    const { files, folder } = memoryFolder();
    const original = await copyPresetToFolder(folder, presetEnvelope());
    vi.mocked(folder.removeEntry).mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await expect(renamePresetFile(folder, original, 'New name')).rejects.toThrow(
      /Both files were kept/,
    );
    expect(files.size).toBe(2);
    expect(files.get(original.name)).toBe(serializePreset(presetEnvelope()));
  });
});
