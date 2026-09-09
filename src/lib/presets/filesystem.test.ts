import { describe, expect, it, vi } from 'vitest';
import { presetEnvelope } from '../../test/fixtures/presets';
import { serializePreset, parsePreset } from './document';
import {
  isPickerCancellation,
  pickPresetDestination,
  pickPresetFiles,
  pickPresetFolder,
  presetFilename,
  presetFolderPermission,
  PresetFileSession,
  scanPresetFolder,
  type PresetDirectoryHandle,
  type PresetFileHandle,
} from './filesystem';

function fileHandle(name: string, initial = serializePreset(presetEnvelope())) {
  let text = initial;
  let fail: 'write' | 'close' | null = null;
  const abort = vi.fn(async () => undefined);
  const createWritable = vi.fn(async () => {
    let pending = '';
    return {
      async write(value: string) {
        if (fail === 'write') throw new Error('Write failed');
        pending = value;
      },
      async close() {
        if (fail === 'close') throw new Error('Close failed');
        text = pending;
      },
      abort,
    };
  });
  const handle: PresetFileHandle = {
    kind: 'file',
    name,
    getFile: async () => new File([text], name),
    createWritable,
  };
  return {
    handle,
    createWritable,
    abort,
    content: () => text,
    externalEdit: (value: string) => {
      text = value;
    },
    failure: (value: typeof fail) => {
      fail = value;
    },
  };
}

function directory(
  name: string,
  children: (PresetFileHandle | PresetDirectoryHandle)[],
): PresetDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *values() {
      yield* children;
    },
    async getFileHandle(filename) {
      const handle = children.find((child) => child.kind === 'file' && child.name === filename);
      if (!handle || handle.kind !== 'file')
        throw new DOMException('Missing file', 'NotFoundError');
      return handle;
    },
    async removeEntry() {},
    queryPermission: vi.fn(async () => 'granted' as const),
    requestPermission: vi.fn(async () => 'granted' as const),
  };
}

describe('preset native file operations', () => {
  it('opens UTF-8 presets and commits a complete replacement through close', async () => {
    const file = fileHandle('study.slicewise-preset.json');
    const { session, document } = await PresetFileSession.open(file.handle);
    document.metadata.name = '改訂';
    await session.save(document);
    expect(parsePreset(file.content()).metadata.name).toBe('改訂');
    expect(file.createWritable).toHaveBeenCalledTimes(1);
  });

  it('detects same-size external changes before opening a writable stream', async () => {
    const file = fileHandle('study.slicewise-preset.json');
    const { session, document } = await PresetFileSession.open(file.handle);
    file.externalEdit(file.content().replace('Contour study', 'Another study'));
    await expect(session.save(document)).rejects.toMatchObject({ code: 'conflict' });
    expect(file.createWritable).not.toHaveBeenCalled();
    expect(parsePreset(file.content()).metadata.name).toBe('Another study');
  });

  it.each(['write', 'close'] as const)(
    'aborts on %s failure and allows retry without losing the baseline',
    async (failure) => {
      const file = fileHandle('study.slicewise-preset.json');
      const original = file.content();
      const { session, document } = await PresetFileSession.open(file.handle);
      document.metadata.name = 'Updated';
      file.failure(failure);
      await expect(session.save(document)).rejects.toThrow(/failed/);
      expect(file.content()).toBe(original);
      expect(file.abort).toHaveBeenCalledTimes(1);
      file.failure(null);
      await session.save(document);
      expect(parsePreset(file.content()).metadata.name).toBe('Updated');
    },
  );

  it('serializes queued writes and captures values at invocation time', async () => {
    const file = fileHandle('study.slicewise-preset.json');
    const { session, document } = await PresetFileSession.open(file.handle);
    document.metadata.name = 'First';
    const first = session.save(document);
    document.metadata.name = 'Second';
    const second = session.save(document);
    document.metadata.name = 'Unsaved';
    await Promise.all([first, second]);
    expect(parsePreset(file.content()).metadata.name).toBe('Second');
  });

  it('supports an empty Save As destination and protects it against later changes', async () => {
    const file = fileHandle('new.slicewise-preset.json', '');
    const session = await PresetFileSession.destination(file.handle);
    await session.save(presetEnvelope());
    expect(parsePreset(file.content()).id).toBe(presetEnvelope().id);
    file.externalEdit('External text');
    await expect(session.save(presetEnvelope())).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects invalid encoding before parsing or writing', async () => {
    const file = fileHandle('invalid.slicewise-preset.json');
    file.handle.getFile = async () => new File([new Uint8Array([0xc3, 0x28])], file.handle.name);
    await expect(PresetFileSession.open(file.handle)).rejects.toThrow(/UTF-8/);
    expect(file.createWritable).not.toHaveBeenCalled();
  });

  it('calls pickers synchronously inside the initiating user gesture', async () => {
    const file = fileHandle('study.slicewise-preset.json');
    const folder = directory('Presets', []);
    const pickers = {
      showSaveFilePicker: vi.fn(async () => file.handle),
      showOpenFilePicker: vi.fn(async () => [file.handle]),
      showDirectoryPicker: vi.fn(async () => folder),
    };
    const destination = pickPresetDestination(pickers, 'Study');
    expect(pickers.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Study.slicewise-preset.json' }),
    );
    const opened = pickPresetFiles(pickers, true);
    expect(pickers.showOpenFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true }),
    );
    const chosenFolder = pickPresetFolder(pickers);
    expect(pickers.showDirectoryPicker).toHaveBeenCalledWith({ mode: 'read' });
    await Promise.all([destination, opened, chosenFolder]);
  });

  it('reports unsupported pickers and distinguishes cancellation from permission errors', async () => {
    await expect(pickPresetFiles({})).rejects.toThrow(/File System Access API/);
    await expect(pickPresetDestination({}, 'Study')).rejects.toThrow(/File System Access API/);
    await expect(pickPresetFolder({})).rejects.toThrow(/File System Access API/);
    expect(isPickerCancellation(new DOMException('Cancelled', 'AbortError'))).toBe(true);
    expect(isPickerCancellation(new DOMException('Denied', 'NotAllowedError'))).toBe(false);
  });

  it('rechecks persisted permissions without prompting during background reads', async () => {
    const folder = directory('Presets', []);
    folder.queryPermission = vi.fn(async () => 'prompt' as const);
    expect(await presetFolderPermission(folder, 'read')).toBe(false);
    expect(folder.requestPermission).not.toHaveBeenCalled();
    expect(await presetFolderPermission(folder, 'readwrite', true)).toBe(true);
    expect(folder.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    folder.requestPermission = vi.fn(async () => 'denied' as const);
    expect(await presetFolderPermission(folder, 'readwrite', true)).toBe(false);
  });

  it('creates portable filenames without paths or reserved device names', () => {
    expect(presetFilename('../Study: one')).toBe('..-Study- one.slicewise-preset.json');
    expect(presetFilename('CON')).toBe('preset-CON.slicewise-preset.json');
    expect(presetFilename('...')).toBe('untitled.slicewise-preset.json');
    expect(presetFilename('a'.repeat(500)).length).toBe(100 + '.slicewise-preset.json'.length);
  });
});

describe('local preset folder indexing', () => {
  it('keeps duplicate UUIDs by path and isolates corrupt files', async () => {
    const first = fileHandle('a.slicewise-preset.json');
    const duplicate = fileHandle('a.slicewise-preset.json');
    const corrupt = fileHandle('broken.slicewise-preset.json', '{');
    const folder = directory('Presets', [
      first.handle,
      directory('Copies', [duplicate.handle]),
      corrupt.handle,
      fileHandle('notes.txt').handle,
    ]);
    const result = await scanPresetFolder(folder);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'Copies/a.slicewise-preset.json',
      'a.slicewise-preset.json',
      'broken.slicewise-preset.json',
    ]);
    expect(result.entries[0].id).toBe(result.entries[1].id);
    expect(result.entries[2].error).toMatch(/valid JSON/);
    expect(result.issues).toEqual([]);
  });

  it('bounds directory depth and reports inaccessible folders independently', async () => {
    let nested = directory('deep', [fileHandle('study.slicewise-preset.json').handle]);
    for (let i = 0; i < 10; i++) nested = directory(`folder${i}`, [nested]);
    const denied = directory('Denied', []);
    denied.values = () => ({
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        throw new DOMException('Access denied', 'NotAllowedError');
      },
    });
    const result = await scanPresetFolder(
      directory('Presets', [nested, denied, fileHandle('good.slicewise-preset.json').handle]),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.issues).toEqual([
      expect.stringContaining('nesting'),
      expect.stringContaining('Access denied'),
    ]);
  });
});
