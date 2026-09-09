import type { AppState } from '../app-state';
import type { AnimationProject } from '../animation-project';
import type { SequencerProject } from '../sequencer-project';
import type { ThreeDProject } from '../three-d-project';
import { renderSettingKeys } from '../render-settings';
import { proceduralSettingKeys } from '../procedural-source';
import type { PresetSectionName } from './types';

/** Persistence ownership, not yet a runtime capture/restore implementation. */
export type PresetOwner = PresetSectionName | 'asset' | 'transient' | 'legacy';

const sourceKeys = [
  ...proceduralSettingKeys,
  'name',
  'source',
  'upY',
  'svgSourceName',
  'svgDepth',
  'svgRounded',
  'svgRoundness',
  'svgMode',
  'svgCenterlinePruning',
  'tilingP',
  'tilingQ',
  'tilingDepth',
  'tilingDiskScale',
] as const satisfies readonly (keyof AppState)[];

const exportKeys = [
  'exportFormat',
  'gcodeProfile',
  'gcodeAutoRotate',
  'drawFeed',
  'travelFeed',
  'optimizeTravel',
  'mergeTolerance',
  'penUp',
  'penDown',
  'zFeed',
  'uunaExpressiveMotion',
] as const satisfies readonly (keyof AppState)[];

const transientKeys = [
  'mesh',
  'svg',
  'svgBytes',
  'toolpaths',
  'sequenceSource',
  'dragging',
  'previewDetail',
] as const satisfies readonly (keyof AppState)[];
const assetKeys = ['svgSource'] as const satisfies readonly (keyof AppState)[];
const legacyKeys = ['lens', 'lensAmount'] as const satisfies readonly (keyof AppState)[];

type ClassifiedKey =
  | (typeof renderSettingKeys)[number]
  | (typeof sourceKeys)[number]
  | (typeof exportKeys)[number]
  | (typeof transientKeys)[number]
  | (typeof assetKeys)[number]
  | (typeof legacyKeys)[number];
const exhaustive: Exclude<keyof AppState, ClassifiedKey> extends never ? true : never = true;
void exhaustive;

const sourceSet = new Set<string>(sourceKeys);
export const appStatePresetOwnership: Readonly<Record<keyof AppState, PresetOwner>> = Object.freeze(
  Object.fromEntries([
    ...renderSettingKeys.filter((key) => !sourceSet.has(key)).map((key) => [key, 'drawing']),
    ...sourceKeys.map((key) => [key, 'source']),
    ...exportKeys.map((key) => [key, 'export']),
    ...transientKeys.map((key) => [key, 'transient']),
    ...assetKeys.map((key) => [key, 'asset']),
    ...legacyKeys.map((key) => [key, 'legacy']),
  ]) as Record<keyof AppState, PresetOwner>,
);

// Whole nested structures belong to their mode. New top-level fields require an
// explicit decision; field-level schemas will additionally own nested validation.
export const animationPresetOwnership = {
  version: 'animation',
  baseSettings: 'animation',
  durationMs: 'animation',
  fps: 'animation',
  loopPreview: 'animation',
  export: 'animation',
  keyframes: 'animation',
} as const satisfies Record<keyof AnimationProject, PresetOwner>;

export const sequencerPresetOwnership = {
  version: 'sequencer',
  name: 'sequencer',
  tempo: 'sequencer',
  timeSignature: 'sequencer',
  swing: 'sequencer',
  seed: 'sequencer',
  resetBars: 'sequencer',
  harmony: 'sequencer',
  lanes: 'sequencer',
} as const satisfies Record<keyof SequencerProject, PresetOwner>;

export const threeDPresetOwnership = {
  version: 'threeD',
  sourceId: 'threeD',
  sizeMode: 'threeD',
  longestMm: 'threeD',
  sizeConfirmed: 'transient',
  rotation: 'threeD',
  position: 'threeD',
  onBed: 'threeD',
  buildVolumeMm: 'threeD',
  printerPresetId: 'threeD',
  treatment: 'threeD',
  radiusMm: 'threeD',
  profileToleranceMm: 'threeD',
  pathToleranceMm: 'threeD',
  resultWeldToleranceMm: 'threeD',
  selection: 'threeD',
  viewDirection: 'threeD',
} as const satisfies Record<keyof ThreeDProject, PresetOwner>;
