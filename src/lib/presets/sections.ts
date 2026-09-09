import { assertJsonValue, isJsonObject, validatePresetDocument } from './document';
import {
  PRESET_FORMAT_VERSION,
  PRESET_SECTIONS,
  PresetError,
  type JsonValue,
  type PresetDocument,
  type PresetSection,
} from './types';

/** A decoder must validate bounds/discriminants and return ONLY fields it owns. */
export interface PresetSectionCodec {
  version: number;
  migrations: Readonly<Record<number, (data: JsonValue) => JsonValue>>;
  decode(data: JsonValue): { data: JsonValue; requiredFeatures: readonly string[] };
}

export interface PreparedPreset {
  document: PresetDocument;
  /** Supported projections only. No opaque fields can leak into runtime assignment. */
  sections: Record<string, JsonValue>;
  notices: string[];
}

/**
 * No runtime mutations. All standard sections must have codecs before any full
 * preset can be applied, even when their workspace is currently inactive.
 */
export function preparePreset(
  input: PresetDocument,
  codecs: Readonly<Record<string, PresetSectionCodec>>,
  supportedFeatures: ReadonlySet<string>,
): PreparedPreset {
  const document = validatePresetDocument(input);
  if (document.formatVersion !== PRESET_FORMAT_VERSION)
    throw new PresetError(
      'incompatible',
      `Unsupported preset envelope version ${document.formatVersion}.`,
    );
  if (!['config', 'animation', 'sequencer', '3d'].includes(document.entryMode))
    throw new PresetError('incompatible', `Unsupported workspace mode ${document.entryMode}.`);
  const sections: Record<string, JsonValue> = {};
  const notices: string[] = [];
  for (const [name, section] of Object.entries(document.sections)) {
    const codec = Object.hasOwn(codecs, name) ? codecs[name] : undefined;
    if (!codec) {
      if (
        PRESET_SECTIONS.some((required) => required === name) ||
        section.requiredFeatures.length ||
        section.data !== null
      )
        throw new PresetError('incompatible', `The ${name} section is not supported.`);
      notices.push(`Preserved uninitialized unfamiliar section ${name} without applying it.`);
      continue;
    }
    if (
      !Number.isSafeInteger(codec.version) ||
      codec.version < 1 ||
      section.version > codec.version
    )
      throw new PresetError(
        'incompatible',
        `Unsupported ${name} section version ${section.version}.`,
      );
    let data = structuredClone(section.data);
    let version = section.version;
    while (version < codec.version) {
      const migrate = Object.hasOwn(codec.migrations, version)
        ? codec.migrations[version]
        : undefined;
      if (!migrate)
        throw new PresetError('incompatible', `Missing ${name} migration from version ${version}.`);
      data = migrate(data);
      assertJsonValue(data);
      notices.push(`Migrated ${name} from version ${version} to ${version + 1}.`);
      version++;
    }
    const decoded = codec.decode(structuredClone(data));
    assertJsonValue(decoded.data);
    const requirements = new Set([...section.requiredFeatures, ...decoded.requiredFeatures]);
    for (const feature of requirements)
      if (!supportedFeatures.has(feature))
        throw new PresetError('incompatible', `${name} requires unsupported feature ${feature}.`);
    // Preserve opaque fields around the migrated section, not just decoded values.
    document.sections[name] = {
      ...section,
      version,
      data,
      requiredFeatures: [...requirements].sort(),
    };
    sections[name] = structuredClone(decoded.data);
  }
  return { document: validatePresetDocument(document), sections, notices };
}

function indexedArray(values: JsonValue[]): Map<string, JsonValue> | null {
  if (
    !values.every(
      (value) => isJsonObject(value) && typeof value.id === 'string' && value.id.length > 0,
    )
  )
    return null;
  const result = new Map<string, JsonValue>();
  for (const value of values) {
    const id = (value as { id: string }).id;
    if (result.has(id)) throw new PresetError('invalid', `Duplicate array item ID ${id}.`);
    result.set(id, value);
  }
  return result;
}

/**
 * Compare with the previous supported projection to distinguish unknown fields
 * from known fields the user deleted. Arrays with IDs merge by identity, not index.
 * Unidentified arrays are whole values; their order and edits remain authoritative.
 */
export function mergePresetData(
  original: JsonValue,
  previous: JsonValue,
  edited: JsonValue,
): JsonValue {
  assertJsonValue(original);
  assertJsonValue(previous);
  assertJsonValue(edited);
  function merge(raw: JsonValue, before: JsonValue, after: JsonValue): JsonValue {
    if (isJsonObject(raw) && isJsonObject(before) && isJsonObject(after)) {
      const result = structuredClone(raw);
      for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) delete result[key];
      for (const [key, value] of Object.entries(after))
        result[key] =
          Object.hasOwn(before, key) && Object.hasOwn(raw, key)
            ? merge(raw[key], before[key], value)
            : structuredClone(value);
      return result;
    }
    if (Array.isArray(raw) && Array.isArray(before) && Array.isArray(after)) {
      const rawById = indexedArray(raw);
      const beforeById = indexedArray(before);
      const afterById = indexedArray(after);
      if (rawById && beforeById && afterById) {
        // A decoder must not filter unidentified future array members silently.
        if ([...rawById.keys()].some((id) => !beforeById.has(id)))
          throw new PresetError(
            'incompatible',
            'Cannot edit an array containing unsupported items.',
          );
        return after.map((value) => {
          const id = (value as { id: string }).id;
          return rawById.has(id) && beforeById.has(id)
            ? merge(rawById.get(id)!, beforeById.get(id)!, value)
            : structuredClone(value);
        });
      }
    }
    return structuredClone(after);
  }
  return merge(original, previous, edited);
}

/** Revalidate edits and feature requirements before retaining unknown fields. */
export function updatePreparedPreset(
  prepared: PreparedPreset,
  edits: Readonly<Record<string, JsonValue>>,
  codecs: Readonly<Record<string, PresetSectionCodec>>,
  supportedFeatures: ReadonlySet<string>,
): PreparedPreset {
  const document = structuredClone(prepared.document);
  for (const [name, edited] of Object.entries(edits)) {
    if (!Object.hasOwn(prepared.sections, name) || !Object.hasOwn(codecs, name))
      throw new PresetError('incompatible', `Cannot edit unsupported section ${name}.`);
    const section: PresetSection = document.sections[name];
    section.data = mergePresetData(section.data, prepared.sections[name], edited);
  }
  return preparePreset(document, codecs, supportedFeatures);
}
