import { describe, expect, it } from 'vitest';
import { presetEnvelope } from '../../test/fixtures/presets';
import { isJsonObject, serializePreset } from './document';
import {
  mergePresetData,
  preparePreset,
  updatePreparedPreset,
  type PresetSectionCodec,
} from './sections';
import { PRESET_SECTIONS, PresetError } from './types';

const basicCodec: PresetSectionCodec = {
  version: 1,
  migrations: {},
  decode(data) {
    if (
      !isJsonObject(data) ||
      typeof data.amount !== 'number' ||
      data.amount < 0 ||
      data.amount > 10
    )
      throw new PresetError('invalid', 'Amount must be between 0 and 10.');
    return {
      data: { amount: data.amount },
      requiredFeatures: data.amount > 5 ? ['large-amount'] : [],
    };
  },
};
const codecs = Object.fromEntries(PRESET_SECTIONS.map((name) => [name, basicCodec]));
const features = new Set<string>();

describe('preset section preparation', () => {
  it('requires validated codecs for every mode, even when Config is active', () => {
    const incomplete = { ...codecs };
    delete incomplete.animation;
    expect(() => preparePreset(presetEnvelope(), incomplete, features)).toThrow(
      /animation section is not supported/,
    );
  });

  it('preserves unfamiliar inactive sections and keys outside runtime projections', () => {
    const document = presetEnvelope();
    document.sections.drawing.data = { amount: 2, unknown: { enabled: false } };
    document.sections.future = { version: 10, requiredFeatures: [], data: null };
    const prepared = preparePreset(document, codecs, features);
    expect(prepared.sections.drawing).toEqual({ amount: 2 });
    expect(prepared.sections).not.toHaveProperty('future');
    expect(prepared.document).toEqual(document);
    expect(prepared.notices).toEqual([expect.stringContaining('future')]);
  });

  it('migrates in explicit order with compatibility defaults and retains opaque data', () => {
    const document = presetEnvelope();
    document.sections.drawing.data = { legacyAmount: 3, future: { x: true } };
    const migrated = preparePreset(
      document,
      {
        ...codecs,
        drawing: {
          version: 3,
          migrations: {
            1: (data) => {
              const { legacyAmount, ...rest } = data as Record<string, number>;
              return { ...rest, amount: legacyAmount };
            },
            2: (data) => ({ ...(data as object), effectEnabled: false }),
          },
          decode: basicCodec.decode,
        },
      },
      features,
    );
    expect(migrated.document.sections.drawing).toMatchObject({
      version: 3,
      data: { amount: 3, effectEnabled: false, future: { x: true } },
    });
    expect(migrated.notices).toHaveLength(2);
    expect(document.sections.drawing.version).toBe(1);
  });

  it('blocks missing migrations and newer sections without normalizing them', () => {
    expect(() =>
      preparePreset(
        presetEnvelope(),
        { ...codecs, drawing: { ...basicCodec, version: 2 } },
        features,
      ),
    ).toThrow(/Missing drawing migration/);
    const future = presetEnvelope();
    future.sections.sequencer.version = 2;
    expect(() => preparePreset(future, codecs, features)).toThrow(
      /Unsupported sequencer section version/,
    );
  });

  it('detects features from content even when requirements are undeclared', () => {
    const document = presetEnvelope();
    document.sections.drawing.data = { amount: 8 };
    expect(() => preparePreset(document, codecs, features)).toThrow(/large-amount/);
    const prepared = preparePreset(document, codecs, new Set(['large-amount']));
    expect(prepared.document.sections.drawing.requiredFeatures).toEqual(['large-amount']);
  });

  it('blocks unknown modes, required unknown sections, and declared unknown features', () => {
    const document = presetEnvelope();
    document.entryMode = 'future';
    expect(() => preparePreset(document, codecs, features)).toThrow(/workspace mode/);
    document.entryMode = 'config';
    document.sections.extra = { version: 1, requiredFeatures: ['future'], data: {} };
    expect(() => preparePreset(document, codecs, features)).toThrow(/extra section/);
    document.sections.extra.requiredFeatures = [];
    expect(() => preparePreset(document, codecs, features)).toThrow(/extra section/);
    delete document.sections.extra;
    document.sections.drawing.requiredFeatures = ['future'];
    expect(() => preparePreset(document, codecs, features)).toThrow(/unsupported feature/);
  });

  it('revalidates edits while keeping unknown fields stable over repeated saves', () => {
    const document = presetEnvelope();
    document.sections.drawing.data = { amount: 1, future: ['a', 'b'] };
    let prepared = preparePreset(document, codecs, features);
    prepared = updatePreparedPreset(prepared, { drawing: { amount: 4 } }, codecs, features);
    const first = serializePreset(prepared.document);
    prepared = updatePreparedPreset(prepared, { drawing: { amount: 4 } }, codecs, features);
    expect(serializePreset(prepared.document)).toBe(first);
    expect(prepared.document.sections.drawing.data).toEqual({ amount: 4, future: ['a', 'b'] });
    expect(() =>
      updatePreparedPreset(prepared, { drawing: { amount: -1 } }, codecs, features),
    ).toThrow(/between 0 and 10/);
    expect(prepared.sections.drawing).toEqual({ amount: 4 });
  });
});

describe('unknown-data retention', () => {
  it('retains nested unknown keys but respects explicit deletion of known values', () => {
    const original = {
      amount: 1,
      options: { enabled: true, unknown: 9 },
      target: { value: 2, future: true },
    };
    const previous = { amount: 1, options: { enabled: true }, target: { value: 2 } };
    const edited = { amount: 2, options: { enabled: false } };
    expect(mergePresetData(original, previous, edited)).toEqual({
      amount: 2,
      options: { enabled: false, unknown: 9 },
    });
    expect(original.target.future).toBe(true);
  });

  it('keeps lane/keyframe extension data with its ID across reorder and deletion', () => {
    const original = [
      { id: 'a', value: 1, future: 'A' },
      { id: 'b', value: 2, future: 'B' },
    ];
    const previous = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ];
    expect(
      mergePresetData(original, previous, [
        { id: 'b', value: 5 },
        { id: 'a', value: 3 },
      ]),
    ).toEqual([
      { id: 'b', value: 5, future: 'B' },
      { id: 'a', value: 3, future: 'A' },
    ]);
    expect(mergePresetData(original, previous, [{ id: 'b', value: 7 }])).toEqual([
      { id: 'b', value: 7, future: 'B' },
    ]);
    expect(mergePresetData(original, previous, [])).toEqual([]);
  });

  it('refuses ambiguous IDs and arrays whose decoder omitted future entries', () => {
    expect(() => mergePresetData([{ id: 'a' }, { id: 'a' }], [], [])).toThrow(/Duplicate/);
    expect(() => mergePresetData([{ id: 'future' }], [], [])).toThrow(/unsupported items/);
  });

  it('treats arrays without stable IDs as authored whole values', () => {
    expect(mergePresetData([1, 2, 3], [1, 2, 3], [3, 1])).toEqual([3, 1]);
    expect(
      mergePresetData([{ position: 0, extra: true }], [{ position: 0 }], [{ position: 1 }]),
    ).toEqual([{ position: 1 }]);
  });
});
