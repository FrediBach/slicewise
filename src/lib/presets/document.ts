import {
  PRESET_FORMAT,
  PRESET_FORMAT_VERSION,
  PRESET_LIMITS,
  PRESET_SECTIONS,
  PresetError,
  type JsonObject,
  type JsonValue,
  type PresetDocument,
} from './types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(path: string, message: string): never {
  throw new PresetError('invalid', `${path}: ${message}`);
}

/** Also guards programmatically constructed documents before serialization or merging. */
export function assertJsonValue(value: unknown): asserts value is JsonValue {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(current: unknown, path: string[], depth: number): void {
    if (++nodes > PRESET_LIMITS.nodes || depth > PRESET_LIMITS.depth)
      throw new PresetError('limit', 'Preset structure exceeds the supported complexity.');
    if (current === null || typeof current === 'boolean') return;
    if (typeof current === 'number' && Number.isFinite(current)) return;
    if (typeof current === 'string') {
      const assetPayload =
        path.length === 4 && path[0] === 'assets' && path[2] === 'content' && path[3] === 'data';
      const maximum = assetPayload
        ? 4 * Math.ceil(PRESET_LIMITS.assetBytes / 3)
        : PRESET_LIMITS.stringLength;
      if (current.length > maximum)
        throw new PresetError('limit', `${path.join('.')}: string is too large.`);
      return;
    }
    if (typeof current !== 'object' || current === null)
      invalid(path.join('.') || 'preset', 'Expected finite JSON data.');
    const prototype = Object.getPrototypeOf(current);
    if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null)
      invalid(path.join('.'), 'Expected a plain JSON object.');
    if (ancestors.has(current)) invalid(path.join('.'), 'Circular data is not supported.');
    if (Object.getOwnPropertySymbols(current).length)
      invalid(path.join('.'), 'Symbol keys are not JSON.');
    ancestors.add(current);
    if (Array.isArray(current)) {
      if (current.length > PRESET_LIMITS.nodes - nodes)
        throw new PresetError('limit', 'Preset array exceeds the supported complexity.');
      if (Object.getOwnPropertyNames(current).length !== current.length + 1)
        invalid(path.join('.'), 'Expected a dense JSON array without extra properties.');
      for (let i = 0; i < current.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(i));
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          invalid(path.join('.'), 'Expected a JSON array data item.');
        visit(descriptor.value, [...path, String(i)], depth + 1);
      }
    } else {
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
        if (forbiddenKeys.has(key)) invalid([...path, key].join('.'), 'Reserved property name.');
        if (key.length > 256) invalid(path.join('.'), 'Property name is too long.');
        if (!('value' in descriptor) || !descriptor.enumerable)
          invalid([...path, key].join('.'), 'Expected a JSON data property.');
        visit(descriptor.value, [...path, key], depth + 1);
      }
    }
    ancestors.delete(current);
  }
  visit(value, [], 0);
}

function record(value: JsonValue | undefined, path: string): JsonObject {
  if (!isJsonObject(value)) invalid(path, 'Expected an object.');
  return value;
}

function string(value: JsonValue | undefined, path: string, max: number, nonempty = true): string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim()))
    invalid(path, 'Expected a bounded string.');
  return value;
}

function positiveInteger(value: JsonValue | undefined, path: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    invalid(path, 'Expected a positive integer.');
}

function strings(value: JsonValue | undefined, path: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) invalid(path, 'Expected a bounded string list.');
  const entries = value.map((item) => string(item, path, 128));
  if (new Set(entries).size !== entries.length) invalid(path, 'Duplicate entries.');
  return entries;
}

function timestamp(value: JsonValue | undefined, path: string): void {
  const text = string(value, path, 24);
  const date = new Date(text);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== text)
    invalid(path, 'Expected an ISO UTC timestamp including milliseconds.');
}

/** Structural validation only. Mode-specific validation is mandatory before application. */
export function validatePresetDocument(value: unknown): PresetDocument {
  assertJsonValue(value);
  const root = record(value, 'preset');
  if (root.format !== PRESET_FORMAT) invalid('format', 'This is not a Slicewise preset.');
  positiveInteger(root.formatVersion, 'formatVersion');
  if (!uuid.test(string(root.id, 'id', 36))) invalid('id', 'Expected a UUID.');
  const metadata = record(root.metadata, 'metadata');
  string(metadata.name, 'metadata.name', 200);
  string(metadata.description, 'metadata.description', 16_384, false);
  strings(metadata.tags, 'metadata.tags', 64);
  timestamp(metadata.createdAt, 'metadata.createdAt');
  timestamp(metadata.updatedAt, 'metadata.updatedAt');
  for (const field of ['author', 'license'] as const)
    if (metadata[field] !== undefined) string(metadata[field], `metadata.${field}`, 1024);
  if (
    metadata.derivedFrom !== undefined &&
    !uuid.test(string(metadata.derivedFrom, 'metadata.derivedFrom', 36))
  )
    invalid('metadata.derivedFrom', 'Expected a UUID.');
  const createdWith = record(root.createdWith, 'createdWith');
  string(createdWith.appVersion, 'createdWith.appVersion', 128);
  if (createdWith.build !== undefined) string(createdWith.build, 'createdWith.build', 128);
  if (!identifier.test(string(root.entryMode, 'entryMode', 128)))
    invalid('entryMode', 'Invalid mode ID.');
  const sections = record(root.sections, 'sections');
  if (Object.keys(sections).length > PRESET_LIMITS.sections)
    throw new PresetError('limit', 'Too many preset sections.');
  for (const name of PRESET_SECTIONS)
    if (!Object.hasOwn(sections, name)) invalid('sections', `Missing ${name} section.`);
  for (const [name, candidate] of Object.entries(sections)) {
    if (!identifier.test(name)) invalid('sections', 'Invalid section ID.');
    const section = record(candidate, `sections.${name}`);
    positiveInteger(section.version, `sections.${name}.version`);
    for (const feature of strings(
      section.requiredFeatures,
      `sections.${name}.requiredFeatures`,
      128,
    ))
      if (!identifier.test(feature))
        invalid(`sections.${name}.requiredFeatures`, 'Invalid feature ID.');
    if (!Object.hasOwn(section, 'data')) invalid(`sections.${name}`, 'Missing section data.');
  }
  const assets = record(root.assets, 'assets');
  if (Object.keys(assets).length > PRESET_LIMITS.assets)
    throw new PresetError('limit', 'Too many preset assets.');
  let totalBytes = 0;
  for (const [id, candidate] of Object.entries(assets)) {
    if (!/^sha256-[a-f0-9]{64}$/.test(id)) invalid('assets', 'Asset IDs must be content hashes.');
    const asset = record(candidate, `assets.${id}`);
    string(asset.name, `assets.${id}.name`, 255);
    const mediaType = string(asset.mediaType, `assets.${id}.mediaType`, 128);
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(mediaType))
      invalid(`assets.${id}.mediaType`, 'Expected a MIME type.');
    if (typeof asset.sha256 !== 'string' || id !== `sha256-${asset.sha256}`)
      invalid(`assets.${id}.sha256`, 'Hash and asset ID disagree.');
    const size = asset.byteLength;
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)
      invalid(`assets.${id}.byteLength`, 'Expected a byte count.');
    totalBytes += size;
    if (size > PRESET_LIMITS.assetBytes || totalBytes > PRESET_LIMITS.totalAssetBytes)
      throw new PresetError('limit', 'Preset assets exceed the supported size.');
    const content = record(asset.content, `assets.${id}.content`);
    if (content.kind === 'embedded') {
      if (content.encoding !== 'base64' || typeof content.data !== 'string')
        invalid(`assets.${id}.content`, 'Expected base64 content.');
      if (content.data.length !== 4 * Math.ceil(size / 3))
        invalid(`assets.${id}.content.data`, 'Encoded length does not match the declared size.');
    } else if (content.kind !== 'external')
      invalid(`assets.${id}.content.kind`, 'Unsupported asset storage.');
  }
  if (root.extensions !== undefined) record(root.extensions, 'extensions');
  return structuredClone(root) as unknown as PresetDocument;
}

export function parsePreset(text: string): PresetDocument {
  if (
    text.length > PRESET_LIMITS.fileBytes ||
    new TextEncoder().encode(text).byteLength > PRESET_LIMITS.fileBytes
  )
    throw new PresetError('limit', 'Preset file exceeds 96 MiB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PresetError('invalid', 'Preset is not valid JSON.');
  }
  return validatePresetDocument(value);
}

function sorted(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sorted);
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sorted(value[key])]),
  );
}

export function serializePreset(document: PresetDocument): string {
  const validated = validatePresetDocument(document);
  // Future envelopes may be inspected/copied byte-for-byte, but not rewritten.
  if (validated.formatVersion !== PRESET_FORMAT_VERSION)
    throw new PresetError(
      'incompatible',
      'This preset envelope requires a different application version.',
    );
  const text = `${JSON.stringify(sorted(validated as unknown as JsonValue), null, 2)}\n`;
  if (new TextEncoder().encode(text).byteLength > PRESET_LIMITS.fileBytes)
    throw new PresetError('limit', 'Serialized preset exceeds 96 MiB.');
  return text;
}

export function duplicatePreset(
  document: PresetDocument,
  id: string,
  now: string,
  name: string,
): PresetDocument {
  return validatePresetDocument({
    ...document,
    id,
    metadata: {
      ...document.metadata,
      name,
      createdAt: now,
      updatedAt: now,
      derivedFrom: document.id,
    },
  });
}
