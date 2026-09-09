import { describe, expect, it } from 'vitest';
import { presetEnvelope } from '../../test/fixtures/presets';
import {
  assertJsonValue,
  duplicatePreset,
  parsePreset,
  serializePreset,
  validatePresetDocument,
} from './document';
import { PRESET_LIMITS, type JsonValue } from './types';

describe('preset envelope codec', () => {
  it('round-trips all mode sections, disabled data, unknown properties, and precision deterministically', () => {
    const document = {
      ...presetEnvelope(),
      futureEnvelope: { thing: true },
      metadata: { ...presetEnvelope().metadata, futureCredit: 'Someone' },
    };
    document.sections.drawing.data = {
      disabled: false,
      amount: 0.12345678901234568,
      nested: { future: ['b', 'a'] },
    };
    document.sections.future = { version: 4, requiredFeatures: [], data: { enabled: false } };
    const text = serializePreset(document);
    expect(text.endsWith('\n')).toBe(true);
    expect(parsePreset(text)).toEqual(document);
    expect(serializePreset(parsePreset(text))).toBe(text);
    expect(serializePreset({ ...document, assets: {}, entryMode: 'config' })).toBe(text);
  });

  it('validates without mutating or sharing the original document', () => {
    const original = presetEnvelope();
    const document = validatePresetDocument(original);
    document.metadata.tags.push('new');
    document.sections.drawing.data = null;
    expect(original.metadata.tags).toEqual(['study']);
    expect(original.sections.drawing.data).toEqual({ amount: 1 });
  });

  it.each(['config', 'animation', 'sequencer', '3d'])('can carry the %s entry mode', (mode) => {
    const document = presetEnvelope();
    document.entryMode = mode;
    expect(parsePreset(serializePreset(document)).entryMode).toBe(mode);
  });

  it('reads a future envelope for inspection, but refuses to rewrite it', () => {
    const document = { ...presetEnvelope(), formatVersion: 2, entryMode: 'future' };
    expect(parsePreset(JSON.stringify(document))).toEqual(document);
    expect(() => serializePreset(document)).toThrow(/different application version/);
  });

  it('creates a detached copy with explicit identity and attribution', () => {
    const original = presetEnvelope();
    const copy = duplicatePreset(
      original,
      '08c32bc3-cb85-4dc3-8686-fabdb391701b',
      '2026-09-10T12:00:00.000Z',
      'Copy',
    );
    expect(copy.id).not.toBe(original.id);
    expect(copy.metadata).toMatchObject({
      name: 'Copy',
      derivedFrom: original.id,
      createdAt: '2026-09-10T12:00:00.000Z',
    });
    expect(original.metadata.name).toBe('Contour study');
  });

  it.each([
    [
      'wrong file type',
      (document: ReturnType<typeof presetEnvelope>) => ({ ...document, format: 'other' }),
    ],
    [
      'missing section',
      (document: ReturnType<typeof presetEnvelope>) => {
        delete document.sections.animation;
        return document;
      },
    ],
    [
      'invalid UUID',
      (document: ReturnType<typeof presetEnvelope>) => ({ ...document, id: '../file' }),
    ],
    [
      'invalid date',
      (document: ReturnType<typeof presetEnvelope>) => {
        document.metadata.createdAt = '2026-02-30T12:00:00.000Z';
        return document;
      },
    ],
    [
      'duplicate tags',
      (document: ReturnType<typeof presetEnvelope>) => {
        document.metadata.tags = ['x', 'x'];
        return document;
      },
    ],
    [
      'fractional version',
      (document: ReturnType<typeof presetEnvelope>) => {
        document.sections.drawing.version = 1.2;
        return document;
      },
    ],
    [
      'unknown storage',
      (document: ReturnType<typeof presetEnvelope>) => ({
        ...document,
        assets: { ['sha256-'.concat('0'.repeat(64))]: {} },
      }),
    ],
  ])('rejects %s', (_name, change) => {
    expect(() => validatePresetDocument(change(presetEnvelope()))).toThrow();
  });

  it('rejects malformed JSON and prototype-related keys at every depth', () => {
    expect(() => parsePreset('{')).toThrow(/valid JSON/);
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const text = JSON.stringify(presetEnvelope()).replace('"amount":1', `"nested":{"${key}":{}}`);
      expect(() => parsePreset(text)).toThrow(/Reserved property/);
    }
    expect({}).not.toHaveProperty('polluted');
  });

  it('rejects values JSON.stringify would silently drop or change', () => {
    for (const value of [undefined, Number.NaN, Infinity, new Date(), 1n, () => 1])
      expect(() => assertJsonValue({ value })).toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => assertJsonValue(circular)).toThrow(/Circular/);
    expect(() =>
      assertJsonValue({
        get sideEffect() {
          throw new Error('getter executed');
        },
      }),
    ).toThrow(/JSON data property/);
  });

  it('bounds deeply nested structures, strings, and parsed non-finite numbers', () => {
    let value: JsonValue = null;
    for (let i = 0; i <= PRESET_LIMITS.depth; i++) value = { nested: value };
    expect(() => assertJsonValue(value)).toThrow(/complexity/);
    expect(() => assertJsonValue('x'.repeat(PRESET_LIMITS.stringLength + 1))).toThrow(/too large/);
    expect(() =>
      parsePreset(JSON.stringify(presetEnvelope()).replace('"amount":1', '"amount":1e999')),
    ).toThrow(/finite JSON/);
  });
});
