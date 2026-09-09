import { describe, expect, it } from 'vitest';
import { presetEnvelope } from '../../test/fixtures/presets';
import { createPresetAsset, resolvePresetAssets, sha256 } from './assets';
import { validatePresetDocument } from './document';

describe('portable preset assets', () => {
  it('uses SHA-256 of original source bytes as stable asset identity', async () => {
    const bytes = new TextEncoder().encode('abc');
    expect(await sha256(bytes)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const first = await createPresetAsset(bytes, 'one.stl');
    const second = await createPresetAsset(bytes, 'renamed.stl');
    expect(first.id).toBe(second.id);
  });

  it('round-trips arbitrary binary sources and detaches caller-owned bytes', async () => {
    const bytes = Uint8Array.from({ length: 20_001 }, (_, index) => index % 256);
    const original = bytes.slice();
    const creation = createPresetAsset(bytes, 'model.stl');
    bytes.fill(0);
    const { id, asset } = await creation;
    const document = presetEnvelope();
    document.assets[id] = asset;
    expect((await resolvePresetAssets(document)).get(id)).toEqual(original);
  });

  it('requires external sources to match content, not filename', async () => {
    const { id, asset } = await createPresetAsset(
      new Uint8Array([1, 2, 3]),
      'model.stl',
      'application/octet-stream',
      false,
    );
    const document = presetEnvelope();
    document.assets[id] = asset;
    await expect(resolvePresetAssets(document)).rejects.toThrow(/Locate the source file/);
    await expect(
      resolvePresetAssets(document, async () => new Uint8Array([3, 2, 1])),
    ).rejects.toThrow(/does not match/);
    await expect(resolvePresetAssets(document, async () => new Uint8Array([1]))).rejects.toThrow(
      /size does not match/,
    );
    expect(
      (await resolvePresetAssets(document, async () => new Uint8Array([1, 2, 3]))).get(id),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rejects invalid encoding, noncanonical padding bits, and corrupted digests', async () => {
    const { id, asset } = await createPresetAsset(new Uint8Array([0]), 'model.stl');
    const document = presetEnvelope();
    document.assets[id] = asset;
    for (const data of ['!!!!', 'AB==', 'AQ==']) {
      asset.content = { kind: 'embedded', encoding: 'base64', data };
      await expect(resolvePresetAssets(document)).rejects.toThrow(/Invalid base64|does not match/);
    }
  });

  it('rejects asset ID mismatches, invalid storage, and dishonest declared lengths', async () => {
    const { id, asset } = await createPresetAsset(new Uint8Array([1]), 'model.stl');
    const document = presetEnvelope();
    document.assets[id] = { ...asset, sha256: '0'.repeat(64) };
    expect(() => validatePresetDocument(document)).toThrow(/disagree/);
    document.assets[id] = { ...asset, byteLength: 4 };
    expect(() => validatePresetDocument(document)).toThrow(/Encoded length/);
    document.assets[id] = { ...asset, content: { kind: 'url' } as never };
    expect(() => validatePresetDocument(document)).toThrow(/Unsupported asset storage/);
  });
});
