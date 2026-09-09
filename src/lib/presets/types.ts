/** The transport stays independent of DOM state and of any one mode's project. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export const PRESET_FORMAT = 'slicewise-preset';
export const PRESET_FORMAT_VERSION = 1;
export const PRESET_EXTENSION = '.slicewise-preset.json';
export const PRESET_SECTIONS = [
  'source',
  'drawing',
  'animation',
  'sequencer',
  'threeD',
  'export',
  'authoring',
] as const;
export type PresetSectionName = (typeof PRESET_SECTIONS)[number];

export interface PresetMetadata {
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  author?: string;
  license?: string;
  derivedFrom?: string;
}

export interface PresetSection {
  version: number;
  requiredFeatures: string[];
  data: JsonValue;
}

export interface PresetAsset {
  mediaType: string;
  name: string;
  byteLength: number;
  sha256: string;
  content: { kind: 'embedded'; encoding: 'base64'; data: string } | { kind: 'external' };
}

/** Unknown properties are retained by the codec, but never projected into runtime state. */
export interface PresetDocument {
  format: typeof PRESET_FORMAT;
  formatVersion: number;
  id: string;
  metadata: PresetMetadata;
  createdWith: { appVersion: string; build?: string };
  // A future mode remains readable as metadata, but cannot be applied.
  entryMode: string;
  sections: Record<string, PresetSection>;
  assets: Record<string, PresetAsset>;
  extensions?: JsonObject;
}

export const PRESET_LIMITS = Object.freeze({
  fileBytes: 96 * 1024 * 1024,
  assetBytes: 32 * 1024 * 1024,
  totalAssetBytes: 64 * 1024 * 1024,
  assets: 32,
  sections: 64,
  depth: 32,
  nodes: 500_000,
  stringLength: 1024 * 1024,
});

export class PresetError extends Error {
  constructor(
    public readonly code: 'invalid' | 'limit' | 'incompatible' | 'asset' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'PresetError';
  }
}
