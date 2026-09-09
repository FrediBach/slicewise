import { sha256 } from './assets';
import { parsePreset, serializePreset } from './document';
import {
  PresetFileSession,
  presetFilename,
  type PresetDirectoryHandle,
  type PresetFileHandle,
} from './filesystem';
import { PRESET_LIMITS, PresetError, type PresetDocument } from './types';

export async function copyPresetToFolder(
  folder: PresetDirectoryHandle,
  document: PresetDocument,
): Promise<PresetFileHandle> {
  serializePreset(document); // Validate before creating a destination file.
  for (let index = 0; index < 100; index++) {
    const name = presetFilename(document.metadata.name + (index ? ` (${index + 1})` : ''));
    try {
      await folder.getFileHandle(name);
      continue;
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('name' in error) ||
        error.name !== 'NotFoundError'
      )
        throw error;
    }
    const handle = await folder.getFileHandle(name, { create: true });
    if ((await handle.getFile()).size !== 0) continue;
    await (await PresetFileSession.destination(handle)).save(document);
    return handle;
  }
  throw new PresetError('conflict', 'Could not find an unused preset filename.');
}

/** Caller confirms this operation; delete occurs only after verified copy and source recheck. */
export async function renamePresetFile(
  folder: PresetDirectoryHandle,
  handle: PresetFileHandle,
  displayName: string,
): Promise<PresetFileHandle> {
  const file = await handle.getFile();
  if (file.size > PRESET_LIMITS.fileBytes) throw new PresetError('limit', 'Preset exceeds 96 MiB.');
  const original = new Uint8Array(await file.arrayBuffer());
  const originalDigest = await sha256(original);
  const document = parsePreset(new TextDecoder('utf-8', { fatal: true }).decode(original));
  document.metadata.name = displayName;
  document.metadata.updatedAt = new Date().toISOString();
  const destination = await copyPresetToFolder(folder, document);
  const copied = new Uint8Array(await (await destination.getFile()).arrayBuffer());
  const expected = new TextEncoder().encode(serializePreset(document));
  if ((await sha256(copied)) !== (await sha256(expected)))
    throw new PresetError('conflict', `The new copy could not be verified. Kept ${handle.name}.`);
  const current = new Uint8Array(await (await handle.getFile()).arrayBuffer());
  if ((await sha256(current)) !== originalDigest)
    throw new PresetError(
      'conflict',
      `The original changed. Kept both ${handle.name} and ${destination.name}.`,
    );
  try {
    await folder.removeEntry(handle.name);
  } catch {
    throw new PresetError(
      'conflict',
      `The copy is saved as ${destination.name}, but ${handle.name} could not be removed. Both files were kept.`,
    );
  }
  return destination;
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('slicewise-preset-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function rememberedPresetFolder(): Promise<PresetDirectoryHandle | null> {
  const database = await openLibrary();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('handles', 'readonly');
      const request = transaction.objectStore('handles').get('folder');
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}
export async function rememberPresetFolder(folder: PresetDirectoryHandle): Promise<void> {
  const database = await openLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('handles', 'readwrite');
      transaction.objectStore('handles').put(folder, 'folder');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export interface ExamplePreset {
  id: string;
  name: string;
  description: string;
  tags: string[];
  mode: string;
  file: string;
  sha256: string;
}
export async function listExamplePresets(): Promise<ExamplePreset[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}presets/index.json`);
  if (!response.ok) throw new Error('Example presets could not be loaded.');
  const catalog = await response.json();
  if (catalog.version !== 1 || !Array.isArray(catalog.presets) || catalog.presets.length > 1000)
    throw new Error('Unsupported example catalog.');
  for (const entry of catalog.presets) {
    if (
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.description !== 'string' ||
      !Array.isArray(entry.tags) ||
      !entry.tags.every((tag: unknown) => typeof tag === 'string') ||
      !['config', 'animation', 'sequencer', '3d'].includes(entry.mode) ||
      !/^[a-z0-9-]+\.slicewise-preset\.json$/.test(entry.file) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error('Invalid example catalog entry.');
  }
  return catalog.presets;
}
export async function loadExamplePreset(example: ExamplePreset): Promise<PresetDocument> {
  const response = await fetch(`${import.meta.env.BASE_URL}presets/${example.file}`);
  if (!response.ok) throw new Error('This example could not be loaded.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if ((await sha256(bytes)) !== example.sha256)
    throw new Error('The example file did not match its catalog. Refresh and try again.');
  const document = parsePreset(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (document.id !== example.id) throw new Error('Example identity does not match the catalog.');
  return document;
}
