import { createInitialAppState, type AppState } from '../app-state';
import type { AnimationProject, AnimationParameterDescriptor } from '../animation-project';
import { validateAnimationProject } from '../animation-validation';
import {
  createMelodicLane,
  createDrumLane,
  SEQUENCER_PROJECT_VERSION,
  type SequencerProject,
} from '../sequencer-project';
import { restoreStoredSequencerProject } from '../sequencer-storage';
import type { ThreeDProject, WorkspaceMode } from '../three-d-project';
import type { ContourSettings } from '../contour-engine';
import { isHyperbolicPair } from '../hyperbolic-tiling';
import { appStatePresetOwnership } from './inventory';
import { preparePreset, type PreparedPreset, type PresetSectionCodec } from './sections';
import { PresetError, type JsonValue, type JsonObject, type PresetDocument } from './types';
import {
  readSchema,
  number,
  string,
  boolean,
  color,
  choice,
  object,
  array,
  variant,
  type ValueSchema,
} from './schema';

export interface ControlConstraint {
  min?: number;
  max?: number;
  options?: string[];
}
export interface PresetSchemaContext {
  controls: Record<string, ControlConstraint>;
  animationParameters: readonly AnimationParameterDescriptor[];
  sourceIds: string[];
  profileIds: string[];
  randomLockIds: string[];
}
export interface ThreeDPresentation {
  style: 'Studio' | 'Inspect' | 'Print';
  orthographic: boolean;
  camera: {
    position: number[];
    target: number[];
    zoom: number;
    frameRadius: number;
    fittingVolume: boolean;
  } | null;
}
export const defaultThreeDPresentation = (): ThreeDPresentation => ({
  style: 'Studio',
  orthographic: false,
  camera: null,
});
export interface PresetWorkspace {
  source: { settings: Partial<AppState>; assetId: string | null; generatorRevision: 1 };
  drawing: {
    settings: Partial<AppState>;
    paperPreset: string;
    paperOrientation: 'portrait' | 'landscape';
  };
  animation: { project: AnimationProject | null };
  sequencer: { project: SequencerProject; exportBars: number };
  threeD: {
    project: Omit<ThreeDProject, 'sourceId' | 'sizeConfirmed'> | null;
    presentation: ThreeDPresentation;
  };
  export: { settings: Partial<AppState> };
  authoring: { randomLocks: string[] };
}
export type ReadyWorkspace = PreparedPreset & { workspace: PresetWorkspace; mode: WorkspaceMode };
const defaults = createInitialAppState();
const derivedSettings = new Set(['proceduralSource', 'proceduralUpY']);
export function ownedSettings(
  state: Partial<AppState>,
  owner: 'source' | 'drawing' | 'export',
): JsonObject {
  return Object.fromEntries(
    Object.entries(appStatePresetOwnership)
      .filter(([key, value]) => value === owner && !derivedSettings.has(key))
      .map(([key]) => [key, structuredClone(state[key] ?? defaults[key])]),
  ) as JsonObject;
}

const strictObject = (properties: Record<string, ValueSchema>): ValueSchema => ({
  ...object(properties),
  additionalProperties: false,
});
const triple = (min: number, max: number) => array(number(min, max), 3, 3);
const optionalProject = (value: unknown, schema: ValueSchema, path: string): JsonValue =>
  value === null ? null : readSchema(schema, value, path);
const expressive = object({
  enabled: boolean,
  penAngle: number(15, 90),
  tiltDirection: number(0, 359),
  tipCompensation: boolean,
  contactZ: number(-100, 100),
  maximumPressDepth: number(0, 20),
  mode: choice('constant', 'tapered', 'modulated', 'curvature'),
  leadIn: number(0.5, 50),
  leadOut: number(0.5, 50),
  modulationDepth: number(0, 1),
  modulationPeriod: number(2, 200),
  modulationPhase: number(0, 359),
  curvatureRelief: number(0, 1),
  preserveStrokeDirection: boolean,
  nibWidth: number(0, 50),
  lineWeightPressure: boolean,
  surfaceCompensation: variant('mode', {
    off: object({ mode: choice('off') }),
    plane: object({
      mode: choice('plane'),
      originOffset: number(-100, 100),
      xOffset: number(-100, 100),
      yOffset: number(-100, 100),
      width: number(1, 5000),
      height: number(1, 5000),
    }),
  }),
});

function baseSchemas(context: PresetSchemaContext): Record<string, ValueSchema> {
  const result: Record<string, ValueSchema> = {};
  const complex: Record<string, ValueSchema> = {
    svgSlicePaths: array(array(number(-1e6, 1e6), 40_000, 4), 20_000),
    gradientStops: array(strictObject({ position: number(0, 1), color }), 64, 2),
    lineIndexColors: array(
      strictObject({
        index: number(1, 1_000_000, true),
        color,
        series: choice('single', 'even', 'odd', 'prime', 'fibonacci', 'tribonacci'),
        reverse: boolean,
      }),
      1000,
      1,
    ),
    uunaExpressiveMotion: expressive,
  };
  for (const [key, owner] of Object.entries(appStatePresetOwnership)) {
    if (
      !['source', 'drawing', 'export'].includes(owner) ||
      derivedSettings.has(key) ||
      key.startsWith('morphTargets')
    )
      continue;
    const value = defaults[key];
    if (complex[key]) result[key] = complex[key];
    else if (typeof value === 'boolean') result[key] = boolean;
    else if (typeof value === 'number') {
      const bounds = context.controls[key];
      if (!bounds || !Number.isFinite(bounds.min) || !Number.isFinite(bounds.max))
        throw new Error(`Missing preset bounds for ${key}`);
      result[key] = number(bounds.min!, bounds.max!);
    } else if (typeof value === 'string') {
      if (key === 'source') result[key] = choice(...context.sourceIds);
      else if (key === 'gcodeProfile') result[key] = choice(...context.profileIds);
      else if (key === 'name' || key === 'svgSourceName') result[key] = string(255);
      else if (value.startsWith('#')) result[key] = color;
      else if (context.controls[key]?.options?.length)
        result[key] = choice(...context.controls[key].options!);
      else throw new Error(`Missing preset choices for ${key}`);
    } else throw new Error(`Missing preset schema for ${key}`);
  }
  const morphProperties = Object.fromEntries(
    context.animationParameters.map((parameter) => [
      parameter.settingKey,
      result[parameter.settingKey],
    ]),
  );
  const morphSchema: ValueSchema = {
    ...object(morphProperties, Object.keys(morphProperties)),
    additionalProperties: false,
  };
  result.morphTargets = morphSchema;
  result.morphTargets2 = morphSchema;
  return result;
}

/** Nested sequencer unions are projected explicitly; the existing validator owns musical bounds. */
function projectLike(template: unknown, input: unknown): JsonValue {
  if (template === null || typeof template !== 'object') return input as JsonValue;
  return Object.fromEntries(
    Object.keys(template).map((key) => [key, projectLike(template[key], input[key])]),
  ) as JsonObject;
}
function sequencerProject(value: unknown): JsonValue {
  const validated = restoreStoredSequencerProject(value);
  if (!validated || validated.version !== (value as SequencerProject)?.version)
    throw new PresetError('invalid', 'Invalid sequencer project.');
  readSchema(
    choice(4, 8, 16),
    validated.timeSignature.denominator,
    'sequencer.timeSignature.denominator',
  );
  readSchema(choice(0, 1, 2, 4, 8, 16), validated.resetBars, 'sequencer.resetBars');
  const probability = (p: JsonObject): JsonValue => {
    if (p.mode !== 'off')
      readSchema(choice(1, 2, 4, 8), p.holdCycles, 'sequencer.probability.holdCycles');
    const keys =
      p.mode === 'off'
        ? ['mode']
        : p.mode === 'fixed'
          ? ['mode', 'chance', 'variation', 'holdCycles']
          : [
              'mode',
              'source',
              'minimum',
              'maximum',
              'curve',
              'inverted',
              'variation',
              'holdCycles',
            ];
    return Object.fromEntries(keys.map((key) => [key, p[key]]));
  };
  const lanes = validated.lanes.map((lane) => {
    if (lane.timing.mode === 'fit')
      readSchema(choice(1, 2, 4), lane.timing.cycleBars, 'sequencer.timing.cycleBars');
    if (lane.variation.target !== 'off')
      readSchema(number(0, 24), lane.variation.amount, 'sequencer.variation.amount');
    if (lane.kind === 'melodic') {
      readSchema(choice(1, 2, 3), lane.melody.octaveRange, 'sequencer.melody.octaveRange');
      readSchema(choice(1, 2, 3, 4), lane.melody.polyphony, 'sequencer.melody.polyphony');
    }
    const template = lane.kind === 'drum' ? createDrumLane(lane.id) : createMelodicLane(lane.id);
    const projected = projectLike(template, lane) as JsonObject;
    projected.timing =
      lane.timing.mode === 'grid'
        ? { mode: 'grid', subdivision: lane.timing.subdivision }
        : { mode: 'fit', cycleBars: lane.timing.cycleBars };
    projected.probability = probability(lane.probability as unknown as JsonObject);
    projected.variation =
      lane.variation.target === 'off'
        ? { target: 'off' }
        : {
            target: lane.variation.target,
            amount: lane.variation.amount,
            probability: probability(lane.variation.probability as unknown as JsonObject),
          };
    return projected;
  });
  return {
    version: SEQUENCER_PROJECT_VERSION,
    name: validated.name,
    tempo: validated.tempo,
    timeSignature: {
      numerator: validated.timeSignature.numerator,
      denominator: validated.timeSignature.denominator,
    },
    swing: validated.swing,
    seed: validated.seed,
    resetBars: validated.resetBars,
    harmony: { root: validated.harmony.root, scale: validated.harmony.scale },
    lanes,
  };
}

export function createWorkspaceCodecs(
  context: PresetSchemaContext,
): Record<string, PresetSectionCodec> {
  const settings = baseSchemas(context);
  const ownerSchema = (owner: string) =>
    object(
      Object.fromEntries(
        Object.keys(settings)
          .filter((key) => appStatePresetOwnership[key] === owner)
          .map((key) => [key, settings[key]]),
      ),
    );
  const snapshotSchema = object(
    {
      ...settings,
      documentTitle: string(255),
      proceduralSource: choice('generative', 'terrain'),
      proceduralUpY: boolean,
    },
    ['proceduralSource', 'proceduralUpY'],
  );
  // Animation's base is a render snapshot, not an export/source-operation snapshot.
  for (const key of Object.keys(snapshotSchema.properties!))
    if (
      appStatePresetOwnership[key] === 'export' ||
      [
        'source',
        'name',
        'upY',
        'svgSourceName',
        'svgDepth',
        'svgRounded',
        'svgRoundness',
        'svgMode',
        'svgCenterlinePruning',
      ].includes(key)
    )
      delete snapshotSchema.properties![key];
  const animationSchema = object({
    version: choice(1),
    baseSettings: snapshotSchema,
    durationMs: number(100, 3_600_000, true),
    fps: number(1, 120, true),
    loopPreview: boolean,
    export: object({
      width: number(2, 7680, true),
      height: number(2, 7680, true),
      bitrate: number(1, 100_000_000, true),
    }),
    keyframes: array(
      object({
        id: string(128, '\\S'),
        timeMs: number(0, 3_600_000, true),
        easingToNext: choice('linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'),
        values: {
          ...object(
            Object.fromEntries(
              context.animationParameters.map(({ settingKey }) => [
                settingKey,
                settings[settingKey],
              ]),
            ),
          ),
          additionalProperties: false,
        },
      }),
      2000,
      1,
      true,
    ),
  });
  const project3d = object(
    {
      version: choice(1),
      sizeMode: choice('longest', 'mm', 'cm', 'in'),
      longestMm: number(0.1, 2000),
      rotation: triple(-180, 180),
      position: triple(-2000, 2000),
      onBed: boolean,
      buildVolumeMm: triple(1, 2000),
      printerPresetId: string(128),
      treatment: choice('off', 'inset', 'emboss'),
      radiusMm: number(0, 10),
      profileToleranceMm: number(0.001, 1),
      pathToleranceMm: number(0, 1),
      resultWeldToleranceMm: number(0, 1),
      viewDirection: triple(-1, 1),
      selection: variant('mode', {
        all: object({ mode: choice('all') }),
        range: object({
          mode: choice('range'),
          first: number(0, 199, true),
          last: number(0, 199, true),
        }),
        every: object({
          mode: choice('every'),
          step: number(1, 32, true),
          offset: number(0, 31, true),
        }),
      }),
    },
    ['printerPresetId'],
  );
  const presentation = object({
    style: choice('Studio', 'Inspect', 'Print'),
    orthographic: boolean,
  });
  const codec = (decode: (value: JsonObject) => JsonValue): PresetSectionCodec => ({
    version: 1,
    migrations: {},
    decode: (value) => {
      readSchema(object({}), value);
      return { data: decode(value as JsonObject), requiredFeatures: [] };
    },
  });
  return {
    source: codec((value) => ({
      ...(readSchema(
        object({ settings: ownerSchema('source'), generatorRevision: choice(1) }),
        value,
      ) as JsonObject),
      assetId:
        value.assetId === null
          ? null
          : readSchema(string(71, '^sha256-[a-f0-9]{64}$'), value.assetId),
    })),
    drawing: codec((value) =>
      readSchema(
        object({
          settings: ownerSchema('drawing'),
          paperPreset: choice(
            'custom',
            'a6',
            'a5',
            'a4',
            'a3',
            'a2',
            'a1',
            'a0',
            'letter',
            'legal',
            'tabloid',
          ),
          paperOrientation: choice('portrait', 'landscape'),
        }),
        value,
      ),
    ),
    animation: codec((value) => {
      const project = optionalProject(value.project, animationSchema, 'animation.project');
      if (project && !validateAnimationProject(project, context.animationParameters).valid)
        throw new PresetError('invalid', 'Invalid animation timing or keyframe values.');
      return { project };
    }),
    sequencer: codec((value) => ({
      project: sequencerProject(value.project),
      exportBars: readSchema(choice(1, 2, 4, 8, 16, 32), value.exportBars),
    })),
    threeD: codec((value) => {
      const camera = (value.presentation as JsonObject)?.camera;
      return {
        project: optionalProject(value.project, project3d, 'threeD.project'),
        presentation: {
          ...(readSchema(presentation, value.presentation) as JsonObject),
          camera: optionalProject(
            camera,
            object({
              position: triple(-1e7, 1e7),
              target: triple(-1e7, 1e7),
              zoom: number(0.001, 10000),
              frameRadius: number(0.001, 1e7),
              fittingVolume: boolean,
            }),
            'threeD.camera',
          ),
        },
      };
    }),
    export: codec((value) => readSchema(object({ settings: ownerSchema('export') }), value)),
    authoring: codec((value) =>
      readSchema(object({ randomLocks: array(choice(...context.randomLockIds), 1000) }), value),
    ),
  };
}

export function prepareWorkspace(
  document: PresetDocument,
  context: PresetSchemaContext,
): ReadyWorkspace {
  const prepared = preparePreset(document, createWorkspaceCodecs(context), new Set());
  const workspace = prepared.sections as unknown as PresetWorkspace;
  if (workspace.source.generatorRevision !== 1)
    throw new PresetError('incompatible', 'Unsupported source generator revision.');
  if (
    workspace.source.settings.source === 'upload' &&
    (!workspace.source.assetId || !document.assets[workspace.source.assetId])
  )
    throw new PresetError('asset', 'The uploaded source asset is missing.');
  const source = workspace.source.settings;
  if (!isHyperbolicPair(source.tilingP!, source.tilingQ!))
    throw new PresetError('invalid', 'Invalid hyperbolic tiling pair.');
  const paths = workspace.drawing.settings.svgSlicePaths!;
  if (
    paths.some((path) => path.length % 2 !== 0) ||
    paths.reduce((sum, path) => sum + path.length / 2, 0) > 20_000
  )
    throw new PresetError('invalid', 'Invalid SVG slice paths.');
  if (document.entryMode === 'animation' && !workspace.animation.project)
    throw new PresetError('invalid', 'Animation mode requires a project.');
  const project = workspace.threeD.project;
  if (document.entryMode === '3d' && !project)
    throw new PresetError('invalid', '3D mode requires a project.');
  if (
    project &&
    (Math.hypot(...project.viewDirection) < 1e-6 ||
      (project.selection.mode === 'range' && project.selection.first > project.selection.last) ||
      (project.selection.mode === 'every' && project.selection.offset >= project.selection.step))
  )
    throw new PresetError('invalid', 'Invalid 3D slice selection or view direction.');
  if (source.source !== 'upload' && workspace.source.assetId !== null)
    throw new PresetError('invalid', 'A recipe source must not reference an uploaded asset.');
  return { ...prepared, workspace, mode: document.entryMode as WorkspaceMode };
}

export function renderSettingsForPreset(state: Partial<AppState>): ContourSettings {
  const settings: JsonObject = {
    ...ownedSettings(state, 'drawing'),
    ...ownedSettings(state, 'source'),
    documentTitle: (state as ContourSettings).documentTitle ?? state.name ?? '',
  };
  for (const key of [
    'source',
    'name',
    'upY',
    'svgSourceName',
    'svgDepth',
    'svgRounded',
    'svgRoundness',
    'svgMode',
    'svgCenterlinePruning',
  ])
    delete settings[key];
  const source = state.proceduralSource ?? state.source;
  if (source === 'generative' || source === 'terrain') settings.proceduralSource = source;
  settings.proceduralUpY = state.proceduralUpY ?? state.upY ?? false;
  return settings as unknown as ContourSettings;
}
