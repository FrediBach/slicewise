import { PRESET_LIMITS, PresetError, type PresetAsset, type PresetDocument } from './types';
import { validatePresetDocument } from './document';

export async function sha256(bytes: Uint8Array): Promise<string> {
  // Detached buffer also accepts views backed by SharedArrayBuffer without sharing it.
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}

function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(chunks.join(''));
}

export async function createPresetAsset(
  bytes: Uint8Array,
  name: string,
  mediaType = 'application/octet-stream',
  embedded = true,
): Promise<{ id: string; asset: PresetAsset }> {
  if (bytes.byteLength > PRESET_LIMITS.assetBytes)
    throw new PresetError('limit', 'Source file exceeds 32 MiB.');
  // Capture once so edits to a caller-owned buffer cannot mismatch digest and content.
  const captured = new Uint8Array(bytes);
  const digest = await sha256(captured);
  return {
    id: `sha256-${digest}`,
    asset: {
      name,
      mediaType,
      byteLength: captured.byteLength,
      sha256: digest,
      content: embedded
        ? { kind: 'embedded', encoding: 'base64', data: base64(captured) }
        : { kind: 'external' },
    },
  };
}

export async function resolvePresetAssets(
  input: PresetDocument,
  external: (id: string, asset: PresetAsset) => Promise<Uint8Array | null> = async () => null,
): Promise<Map<string, Uint8Array>> {
  const document = validatePresetDocument(input);
  const resolved = new Map<string, Uint8Array>();
  // Sequential resolution bounds transient allocations for large sources.
  for (const [id, asset] of Object.entries(document.assets)) {
    let bytes: Uint8Array;
    if (asset.content.kind === 'embedded') {
      try {
        const binary = atob(asset.content.data);
        bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        if (base64(bytes) !== asset.content.data) throw new Error('Noncanonical encoding');
      } catch {
        throw new PresetError('asset', `Invalid base64 source: ${asset.name}.`);
      }
    } else {
      const supplied = await external(id, structuredClone(asset));
      if (!supplied)
        throw new PresetError('asset', `Locate the source file ${asset.name} to use this preset.`);
      if (supplied.byteLength !== asset.byteLength)
        throw new PresetError('asset', `Source size does not match ${asset.name}.`);
      bytes = new Uint8Array(supplied);
    }
    if (bytes.byteLength !== asset.byteLength || (await sha256(bytes)) !== asset.sha256)
      throw new PresetError('asset', `Source content does not match ${asset.name}.`);
    resolved.set(id, bytes);
  }
  return resolved;
}
