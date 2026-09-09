import { parsePreset, serializePreset } from './document';
import { sha256 } from './assets';
import {
  PRESET_EXTENSION,
  PRESET_LIMITS,
  PresetError,
  type PresetDocument,
  type PresetMetadata,
} from './types';

/** Small structural interfaces allow native handles and deterministic test doubles. */
export interface PresetFileHandle {
  readonly kind: 'file';
  readonly name: string;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  isSameEntry?(other: PresetFileHandle): Promise<boolean>;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

export interface PresetDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterableIterator<PresetFileHandle | PresetDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<PresetFileHandle>;
  removeEntry(name: string): Promise<void>;
  queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export interface PresetPickers {
  showOpenFilePicker?: (options: {
    multiple: boolean;
    types: typeof pickerTypes;
  }) => Promise<PresetFileHandle[]>;
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: typeof pickerTypes;
  }) => Promise<PresetFileHandle>;
  showDirectoryPicker?: (options: { mode: 'read' }) => Promise<PresetDirectoryHandle>;
}

const pickerTypes = [
  { description: 'Slicewise preset', accept: { 'application/json': ['.json'] } },
];

export function presetFilename(name: string): string {
  const cleaned = Array.from(name, (character) =>
    character.charCodeAt(0) < 32 ? '-' : character,
  ).join('');
  const base = cleaned
    .replace(/[<>:"/\\|?*]/g, '-')
    .trim()
    .slice(0, 100)
    .replace(/[. ]+$/g, '');
  const portable = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(base)
    ? `preset-${base}`
    : base;
  return `${portable || 'untitled'}${PRESET_EXTENSION}`;
}

export function isPickerCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

/** Call directly from the click handler; capture/encode only after this resolves. */
export function pickPresetDestination(
  pickers: PresetPickers,
  name: string,
): Promise<PresetFileHandle> {
  if (!pickers.showSaveFilePicker)
    return Promise.reject(
      new PresetError('incompatible', 'Saving presets requires the File System Access API.'),
    );
  return pickers.showSaveFilePicker({ suggestedName: presetFilename(name), types: pickerTypes });
}

export function pickPresetFiles(
  pickers: PresetPickers,
  multiple = false,
): Promise<PresetFileHandle[]> {
  if (!pickers.showOpenFilePicker)
    return Promise.reject(
      new PresetError('incompatible', 'Opening presets requires the File System Access API.'),
    );
  return pickers.showOpenFilePicker({ multiple, types: pickerTypes });
}

export function pickPresetFolder(pickers: PresetPickers): Promise<PresetDirectoryHandle> {
  if (!pickers.showDirectoryPicker)
    return Promise.reject(
      new PresetError('incompatible', 'Preset folders require the File System Access API.'),
    );
  return pickers.showDirectoryPicker({ mode: 'read' });
}

/** Only request permission from a user gesture, never during a background refresh. */
export async function presetFolderPermission(
  directory: PresetDirectoryHandle,
  mode: 'read' | 'readwrite',
  request = false,
): Promise<boolean> {
  const permission = await directory.queryPermission({ mode });
  return (
    permission === 'granted' ||
    (request && (await directory.requestPermission({ mode })) === 'granted')
  );
}

async function readBytes(file: File): Promise<Uint8Array> {
  if (file.size > PRESET_LIMITS.fileBytes)
    throw new PresetError('limit', `${file.name} exceeds 96 MiB.`);
  return new Uint8Array(await file.arrayBuffer());
}

function decode(bytes: Uint8Array): PresetDocument {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PresetError('invalid', 'Preset must be UTF-8 text.');
  }
  return parsePreset(text);
}

/** One session per open file; the library must reuse it for all edits to that handle. */
export class PresetFileSession {
  readonly handle: PresetFileHandle;
  #digest: string;
  #writes: Promise<unknown> = Promise.resolve();

  private constructor(handle: PresetFileHandle, digest: string) {
    this.handle = handle;
    this.#digest = digest;
  }

  static async open(
    handle: PresetFileHandle,
  ): Promise<{ session: PresetFileSession; document: PresetDocument }> {
    const bytes = await readBytes(await handle.getFile());
    const document = decode(bytes);
    return { session: new PresetFileSession(handle, await sha256(bytes)), document };
  }

  /** Record the destination's current bytes, including an empty newly selected file. */
  static async destination(handle: PresetFileHandle): Promise<PresetFileSession> {
    return new PresetFileSession(handle, await sha256(await readBytes(await handle.getFile())));
  }

  save(document: PresetDocument): Promise<void> {
    // Freeze edits at invocation time, not after an earlier write finishes.
    const text = serializePreset(document);
    const operation = this.#writes.then(async () => {
      const current = await readBytes(await this.handle.getFile());
      if ((await sha256(current)) !== this.#digest)
        throw new PresetError(
          'conflict',
          `${this.handle.name} changed outside Slicewise. Reload it or save a copy.`,
        );
      const expectedDigest = await sha256(new TextEncoder().encode(text));
      const writable = await this.handle.createWritable();
      try {
        await writable.write(text);
        await writable.close();
      } catch (error) {
        try {
          await writable.abort();
        } catch {
          /* Preserve the original write/close error. */
        }
        throw error;
      }
      this.#digest = expectedDigest;
    });
    // A failed write must not poison the queue or mark unsaved edits as saved.
    this.#writes = operation.catch(() => undefined);
    return operation;
  }
}

export interface PresetLibraryEntry {
  path: string;
  handle: PresetFileHandle;
  directory: PresetDirectoryHandle;
  id?: string;
  metadata?: PresetMetadata;
  entryMode?: string;
  error?: string;
}

export const PRESET_SCAN_LIMITS = { entries: 5000, depth: 8, bytes: 256 * 1024 * 1024 } as const;

/** File paths are the index identity: copied files may intentionally share a UUID. */
export async function scanPresetFolder(directory: PresetDirectoryHandle): Promise<{
  entries: PresetLibraryEntry[];
  issues: string[];
}> {
  const entries: PresetLibraryEntry[] = [];
  const issues: string[] = [];
  let visited = 0;
  let bytesRead = 0;
  let stopped = false;
  async function scan(folder: PresetDirectoryHandle, path: string, depth: number): Promise<void> {
    if (depth > PRESET_SCAN_LIMITS.depth) {
      issues.push(`${path}: folder nesting exceeds ${PRESET_SCAN_LIMITS.depth} levels.`);
      return;
    }
    try {
      for await (const handle of folder.values()) {
        if (stopped) break;
        if (++visited > PRESET_SCAN_LIMITS.entries) {
          issues.push(`Stopped after ${PRESET_SCAN_LIMITS.entries} filesystem entries.`);
          stopped = true;
          break;
        }
        const relativePath = path ? `${path}/${handle.name}` : handle.name;
        if (handle.kind === 'directory') {
          await scan(handle, relativePath, depth + 1);
        } else if (handle.name.toLowerCase().endsWith(PRESET_EXTENSION)) {
          const entry: PresetLibraryEntry = { path: relativePath, handle, directory: folder };
          try {
            const file = await handle.getFile();
            if (file.size > PRESET_LIMITS.fileBytes)
              throw new PresetError('limit', `${file.name} exceeds 96 MiB.`);
            if (bytesRead + file.size > PRESET_SCAN_LIMITS.bytes) {
              stopped = true;
              issues.push('Folder scan reached its 256 MiB reading budget.');
              break;
            }
            bytesRead += file.size;
            const document = decode(await readBytes(file));
            entry.id = document.id;
            entry.metadata = document.metadata;
            entry.entryMode = document.entryMode;
          } catch (error) {
            entry.error = error instanceof Error ? error.message : String(error);
          }
          entries.push(entry);
        }
      }
    } catch (error) {
      issues.push(
        `${path || directory.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  await scan(directory, '', 0);
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return { entries, issues };
}
