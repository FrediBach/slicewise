'use strict';
import { generateGCode } from './gcode';
import { createColorGradient, createColorPair } from './colorPair';
import {
  type ContourMesh,
  type ContourResult,
  type ContourSettings,
  type ContourToolpathGroup,
  type GradientStop,
  type LineIndexColor,
} from './contour-engine';
import { GEN_DEFAULTS, type GeneratedMesh, type GenerativeParams } from './generativeMesh';
import { radialColumnDemo, ringTorus, sphereDemo, tetrapodDemo, torusKnot } from './demo-meshes';
import { parseOBJ, parsePLY, parseSTL, vertexNormals, weld } from './mesh';
import {
  initialPreviewPerformance,
  observePreviewPerformance,
  previewCurveQuality,
  previewDetail,
  previewLineCount,
  previewMorphSteps,
} from './preview-detail';
import { isPreviewBusy, previewViewTransform, renderDisposition } from './render-scheduling';

type RawMesh = {
  verts: Float32Array | Float64Array;
  tris: Uint32Array;
};

type RenderMesh = ContourMesh & {
  V: Float32Array;
  T: Uint32Array;
  N: Float32Array;
  lineArt?: { offsets: Uint32Array };
};
type NormalizedMesh = Omit<RenderMesh, 'N'> & { N?: Float32Array };

type RenderSettings = Omit<ContourSettings, 'documentTitle' | 'suppressBackground'>;
type AppState = RenderSettings &
  GenerativeParams & {
    mesh: RenderMesh | null;
    name: string;
    source: string;
    upY: boolean;
    svgSource: string | null;
    svgSourceName: string;
    svgDepth: number;
    svgRounded: boolean;
    svgRoundness: number;
    svgMode: 'extrude' | 'centerline';
    svgCenterlinePruning: number;
    exportFormat: string;
    gcodeProfile: string;
    drawFeed: number;
    travelFeed: number;
    optimizeTravel: boolean;
    mergeTolerance: number;
    penUp: number;
    penDown: number;
    zFeed: number;
    svg: string;
    svgBytes: number;
    toolpaths: ContourToolpathGroup[];
    dragging: boolean;
  };

type RenderRequest = {
  id: number;
  meshVersion: number;
  quick: boolean;
  settings: ContourSettings;
  queuedAt: number;
  dispatchedAt?: number;
};

type RenderWorkerMessage =
  | { type: 'result'; id: number; meshVersion: number; result: ContourResult }
  | { type: 'error'; id: number; meshVersion: number; message: string };

type GenerationRequest = { id: number; params: GenerativeParams };
type GenerationWorkerMessage =
  | {
      type: 'result';
      id: number;
      positions: ArrayBuffer;
      normals: ArrayBuffer;
      indices: ArrayBuffer;
      stats: GeneratedMesh['stats'];
    }
  | { type: 'error'; id: number; message: string };

type MorphChangeDetail = {
  id?: string;
  dimension?: number;
  active?: boolean;
  value?: unknown;
};

type RandomLockDetail = { id?: string; locked?: boolean };
type RandomizeGroupDetail = { ids?: string[]; title?: string };
type GradientChangeDetail = { stops: GradientStop[] };
type LineIndexColorsChangeDetail = { colors: LineIndexColor[] };
type ApplyParameterSnapshotDetail = {
  parameters?: ContourSettings;
  randomLocks?: string[];
  name?: string;
};
type CaptureParameterSnapshotDetail = {
  snapshot?: { parameters: ContourSettings; randomLocks: string[] };
};

function $<T extends HTMLElement = HTMLInputElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

const inputTarget = (event: Event): HTMLInputElement => event.currentTarget as HTMLInputElement;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const previewBackground = (
  settings: Pick<AppState, 'blueprint' | 'blueprintStyle' | 'chroma' | 'backgroundColor'>,
): string =>
  settings.blueprint
    ? settings.blueprintStyle === 'black'
      ? '#101417'
      : '#0b3f7a'
    : settings.chroma
      ? '#000000'
      : settings.backgroundColor;

/* =================================================================== app */
const state: AppState = {
  mesh: null,
  name: 'demo · torus knot',
  source: 'knot',
  upY: false,
  svgSource: null,
  svgSourceName: '',
  svgDepth: 12,
  svgRounded: false,
  svgRoundness: 25,
  svgMode: 'extrude',
  svgCenterlinePruning: 2,
  ...GEN_DEFAULTS,
  az: 35,
  el: 24,
  roll: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  lensFocalLength: 50,
  lensPerspective: 0,
  lensWarpExponent: 0,
  lensDistortion: 0,
  projectionWarpMode: 'none',
  mobiusDirection: 0,
  mobiusDisplacement: 0,
  mobiusRotation: 0,
  mobiusStrength: 100,
  lines: 40,
  gapEase: 'linear',
  easeStrength: 100,
  easeCycles: 1,
  easeCenter: 50,
  quality: 7,
  axis: 'up',
  cutAz: 0,
  cutEl: 90,
  waveCenterX: 0,
  waveCenterY: 0,
  waveCenterZ: 0,
  cylinderAzimuth: 0,
  cylinderElevation: 90,
  geodesicSeedAzimuth: 0,
  geodesicSeedElevation: 90,
  geodesicMode: 'single',
  geodesicSeedBAzimuth: 0,
  geodesicSeedBElevation: -90,
  curvatureMethod: 'gaussian',
  curvatureSmoothing: 2,
  curvatureRange: 98,
  curvatureContrast: 100,
  curvatureIncludeZero: true,
  divergence: 0,
  sliceLfo: false,
  sliceLfoAmplitude: 75,
  sliceLfoCycles: 2,
  sliceLfoAngle: 0,
  sliceLfoPhase: 0,
  sliceLfoWaveform: 'sine',
  sliceLfoModulation: false,
  sliceLfoModulationMode: 'amplitude',
  sliceLfoModulationDepth: 50,
  sliceLfoModulationCycles: 1,
  sliceLfoModulationPhase: 0,
  explodeAmount: 0,
  spiral: false,
  hide: true,
  sil: true,
  sw: 0.35,
  lineWeightMode: 'uniform',
  lineWeightInterval: 5,
  lineWeightAmount: 100,
  color: '#15181a',
  backgroundColor: '#ffffff',
  pw: 210,
  ph: 210,
  margin: 14,
  clipToArtboard: true,
  maskEnabled: false,
  maskOutline: false,
  maskRoundness: 100,
  maskScaleX: 100,
  maskScaleY: 100,
  maskOffsetX: 0,
  maskOffsetY: 0,
  maskLfo1Amplitude: 0,
  maskLfo1Cycles: 3,
  maskLfo1Phase: 0,
  maskLfo1Waveform: 0,
  maskLfo2Amplitude: 0,
  maskLfo2Cycles: 5,
  maskLfo2Phase: 90,
  maskLfo2Waveform: 0,
  bg: true,
  gradientEnabled: false,
  gradientColors: 6,
  gradientStops: [
    { position: 0, color: '#ef4444' },
    { position: 0.2, color: '#f59e0b' },
    { position: 0.4, color: '#84cc16' },
    { position: 0.6, color: '#06b6d4' },
    { position: 0.8, color: '#3b82f6' },
    { position: 1, color: '#8b5cf6' },
  ],
  lineIndexColorEnabled: false,
  lineIndexColors: [{ index: 1, color: '#ef4444', series: 'single', reverse: false }],
  halftone: false,
  halftoneSize: 2.4,
  halftoneContrast: 75,
  halftoneCycles: 2,
  chroma: false,
  chromaAmount: 1.5,
  humanizer: false,
  humanizerAmount: 30,
  yarnCurl: false,
  yarnCutPercent: 15,
  yarnCurlSize: 100,
  blueprint: false,
  blueprintStyle: 'blue',
  topographicMap: false,
  morphEnabled: false,
  morphSteps: 4,
  morphTargets: {},
  morphSecondEnabled: false,
  morphStepsY: 4,
  morphTargets2: {},
  exportFormat: 'svg',
  gcodeProfile: 'uunatek3',
  drawFeed: 3000,
  travelFeed: 6000,
  optimizeTravel: true,
  mergeTolerance: 0.15,
  penUp: 0,
  penDown: -3,
  zFeed: 2000,
  svg: '',
  svgBytes: 0,
  toolpaths: [],
  dragging: false,
};
const dynamicState = state as unknown as Record<string, unknown>;

if (typeof document !== 'undefined') {
  function fitBed(W: number, H: number): void {
    const wrap = $('bedwrap'),
      bed = $('bed');
    const style = getComputedStyle(wrap);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    // Keep the registration marks inside the clipped workspace as well as the
    // sheet itself. Reading computed padding also follows responsive CSS changes.
    const edgeRoom = 8;
    const availW = Math.max(120, wrap.clientWidth - horizontalPadding - edgeRoom);
    const availH = Math.max(120, wrap.clientHeight - verticalPadding - edgeRoom);
    const s = Math.min(availW / W, availH / H);
    bed.style.width = Math.round(W * s) + 'px';
    bed.style.height = Math.round(H * s) + 'px';
  }

  /* ------------------------------------------------ worker + smart redraw */
  const renderWorker = new Worker(new URL('./slicer-worker.ts', import.meta.url), {
    type: 'module',
  });
  let requestId = 0,
    appliedRequestId = 0,
    failedRequestId = 0;
  let queuedRender: RenderRequest | null = null,
    activeRender: RenderRequest | null = null,
    renderInFlight = false;
  let renderWaiters: Array<() => void> = [];
  let renderTimer = 0,
    lastDispatch = 0,
    meshVersion = 0;
  let previewPerformance = initialPreviewPerformance();

  function recordMeasure(name: string, start: number, end: number): void {
    try {
      performance.clearMeasures(name);
      performance.measure(name, { start, end });
    } catch {
      // Performance measurements are diagnostics and must not affect rendering.
    }
  }

  function measureNextPaint(request: RenderRequest): void {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const paintedAt = performance.now();
        recordMeasure('slicewise:render:end-to-paint', request.queuedAt, paintedAt);
        if (request.quick && request.meshVersion === meshVersion) {
          const startedAt = request.dispatchedAt ?? request.queuedAt;
          previewPerformance = observePreviewPerformance(previewPerformance, paintedAt - startedAt);
          if (queuedRender?.quick)
            queuedRender.settings.previewDetail = previewDetail(previewPerformance);
        }
      }),
    );
  }

  function settingsSnapshot(): ContourSettings {
    const {
      az,
      el,
      roll,
      zoom,
      panX,
      panY,
      lensFocalLength,
      lensPerspective,
      lensWarpExponent,
      lensDistortion,
      projectionWarpMode,
      mobiusDirection,
      mobiusDisplacement,
      mobiusRotation,
      mobiusStrength,
      lines,
      gapEase,
      easeStrength,
      easeCycles,
      easeCenter,
      quality,
      axis,
      cutAz,
      cutEl,
      waveCenterX,
      waveCenterY,
      waveCenterZ,
      cylinderAzimuth,
      cylinderElevation,
      geodesicSeedAzimuth,
      geodesicSeedElevation,
      geodesicMode,
      geodesicSeedBAzimuth,
      geodesicSeedBElevation,
      curvatureMethod,
      curvatureSmoothing,
      curvatureRange,
      curvatureContrast,
      curvatureIncludeZero,
      divergence,
      sliceLfo,
      sliceLfoAmplitude,
      sliceLfoCycles,
      sliceLfoAngle,
      sliceLfoPhase,
      sliceLfoWaveform,
      sliceLfoModulation,
      sliceLfoModulationMode,
      sliceLfoModulationDepth,
      sliceLfoModulationCycles,
      sliceLfoModulationPhase,
      explodeAmount,
      spiral,
      hide,
      sil,
      sw,
      lineWeightMode,
      lineWeightInterval,
      lineWeightAmount,
      color,
      backgroundColor,
      gradientEnabled,
      gradientColors,
      gradientStops,
      lineIndexColorEnabled,
      lineIndexColors,
      pw,
      ph,
      margin,
      clipToArtboard,
      maskEnabled,
      maskOutline,
      maskRoundness,
      maskScaleX,
      maskScaleY,
      maskOffsetX,
      maskOffsetY,
      maskLfo1Amplitude,
      maskLfo1Cycles,
      maskLfo1Phase,
      maskLfo1Waveform,
      maskLfo2Amplitude,
      maskLfo2Cycles,
      maskLfo2Phase,
      maskLfo2Waveform,
      bg,
      halftone,
      halftoneSize,
      halftoneContrast,
      halftoneCycles,
      chroma,
      chromaAmount,
      humanizer,
      humanizerAmount,
      yarnCurl,
      yarnCutPercent,
      yarnCurlSize,
      blueprint,
      blueprintStyle,
      topographicMap,
      morphEnabled,
      morphSteps,
      morphTargets,
      morphSecondEnabled,
      morphStepsY,
      morphTargets2,
    } = state;
    return {
      az,
      el,
      roll,
      zoom,
      panX,
      panY,
      lensFocalLength,
      lensPerspective,
      lensWarpExponent,
      lensDistortion,
      projectionWarpMode,
      mobiusDirection,
      mobiusDisplacement,
      mobiusRotation,
      mobiusStrength,
      lines,
      gapEase,
      easeStrength,
      easeCycles,
      easeCenter,
      quality,
      axis,
      cutAz,
      cutEl,
      waveCenterX,
      waveCenterY,
      waveCenterZ,
      cylinderAzimuth,
      cylinderElevation,
      geodesicSeedAzimuth,
      geodesicSeedElevation,
      geodesicMode,
      geodesicSeedBAzimuth,
      geodesicSeedBElevation,
      curvatureMethod,
      curvatureSmoothing,
      curvatureRange,
      curvatureContrast,
      curvatureIncludeZero,
      divergence,
      sliceLfo,
      sliceLfoAmplitude,
      sliceLfoCycles,
      sliceLfoAngle,
      sliceLfoPhase,
      sliceLfoWaveform,
      sliceLfoModulation,
      sliceLfoModulationMode,
      sliceLfoModulationDepth,
      sliceLfoModulationCycles,
      sliceLfoModulationPhase,
      explodeAmount,
      spiral,
      hide,
      sil,
      sw,
      lineWeightMode,
      lineWeightInterval,
      lineWeightAmount,
      color,
      backgroundColor,
      gradientEnabled,
      gradientColors,
      gradientStops,
      lineIndexColorEnabled,
      lineIndexColors,
      pw,
      ph,
      margin,
      clipToArtboard,
      maskEnabled,
      maskOutline,
      maskRoundness,
      maskScaleX,
      maskScaleY,
      maskOffsetX,
      maskOffsetY,
      maskLfo1Amplitude,
      maskLfo1Cycles,
      maskLfo1Phase,
      maskLfo1Waveform,
      maskLfo2Amplitude,
      maskLfo2Cycles,
      maskLfo2Phase,
      maskLfo2Waveform,
      bg,
      halftone,
      halftoneSize,
      halftoneContrast,
      halftoneCycles,
      chroma,
      chromaAmount,
      humanizer,
      humanizerAmount,
      yarnCurl,
      yarnCutPercent,
      yarnCurlSize,
      blueprint,
      blueprintStyle,
      topographicMap,
      documentTitle: state.name,
      morphEnabled,
      morphSteps,
      morphTargets: { ...morphTargets },
      morphSecondEnabled,
      morphStepsY,
      morphTargets2: { ...morphTargets2 },
    };
  }
  function throttleDelay(): number {
    const triangles = state.mesh ? state.mesh.T.length / 3 : 0;
    const detail = previewDetail(previewPerformance);
    const previewLines = previewLineCount(state.lines, detail);
    const visibilityCost = state.hide ? 1.55 : 1;
    const quality = previewCurveQuality(state.quality, detail);
    const curveCost = 1 + Math.max(0, quality - 1) * 0.055;
    const morphCost =
      state.morphEnabled && Object.keys(state.morphTargets).length
        ? previewMorphSteps(state.morphSteps, detail) *
          (state.morphSecondEnabled && Object.keys(state.morphTargets2).length
            ? previewMorphSteps(state.morphStepsY, detail)
            : 1)
        : 1;
    const score = triangles * previewLines * visibilityCost * curveCost * morphCost;
    let complexityDelay = 150;
    if (score < 450000) complexityDelay = 16;
    else if (score < 1500000) complexityDelay = 32;
    else if (score < 4000000) complexityDelay = 60;
    else if (score < 9000000) complexityDelay = 100;
    // Once measured, the device's end-to-painted-frame cost is more useful than
    // the conservative static estimate used for the first few frames.
    return previewPerformance.averageMs
      ? Math.min(180, Math.max(16, previewPerformance.averageMs * 1.1))
      : complexityDelay;
  }
  let previewView = { zoom: state.zoom, panX: state.panX, panY: state.panY };
  function installPreviewRoot(): void {
    const svg = $('bed').querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    root.dataset.previewRoot = '';
    while (svg.firstChild) root.appendChild(svg.firstChild);
    svg.appendChild(root);
  }
  function applyViewTransform(): void {
    const root = $('bed').querySelector<SVGGElement>('[data-preview-root]');
    if (!root) return;
    const [scale, tx, ty] = previewViewTransform(previewView, state, state.pw, state.ph);
    root.setAttribute('transform', `matrix(${scale} 0 0 ${scale} ${tx} ${ty})`);
  }
  function applyPreview(result: ContourResult, request: RenderRequest): void {
    fitBed(result.W, result.H);
    $('artboardDimensions').textContent = `${result.W} × ${result.H} MM`;
    $('bed').style.background = previewBackground(state);
    $('bed').innerHTML = result.svg;
    installPreviewRoot();
    previewView = {
      zoom: request.settings.zoom,
      panX: request.settings.panX,
      panY: request.settings.panY,
    };
    applyViewTransform();
    $('rPaths').textContent = result.paths.toLocaleString();
    $('rPts').textContent = Math.round(result.nodes).toLocaleString();
    updateExportSize();
    $('rMs').textContent = Math.round(result.ms) + ' ms';
  }
  function applyRender(result: ContourResult, request: RenderRequest): void {
    appliedRequestId = request.id;
    state.svg = result.svg;
    state.svgBytes = result.bytes;
    state.toolpaths = result.toolpaths || [];
    applyPreview(result, request);
  }
  function notifyRenderWaiters(): void {
    const waiters = renderWaiters;
    renderWaiters = [];
    for (const resolve of waiters) resolve();
  }
  async function waitForCurrentRender(): Promise<void> {
    for (;;) {
      if (!renderInFlight && !queuedRender && appliedRequestId === requestId) return;
      if (!renderInFlight && !queuedRender) redraw(false);
      const awaitedRequestId = requestId;
      await new Promise<void>((resolve) => renderWaiters.push(resolve));
      if (failedRequestId >= awaitedRequestId && appliedRequestId < awaitedRequestId) {
        throw new Error('The latest contour render could not be exported');
      }
    }
  }
  function dispatchRender(): void {
    if (renderInFlight || !queuedRender) return;
    const request = queuedRender;
    queuedRender = null;
    activeRender = request;
    renderInFlight = true;
    lastDispatch = performance.now();
    request.dispatchedAt = lastDispatch;
    recordMeasure('slicewise:render:queue', request.queuedAt, lastDispatch);
    syncPreviewBusy();
    renderWorker.postMessage({
      type: 'render',
      id: request.id,
      meshVersion: request.meshVersion,
      quick: request.quick,
      settings: request.settings,
    });
  }
  function scheduleRender(): void {
    if (renderInFlight || !queuedRender) return;
    clearTimeout(renderTimer);
    const wait = queuedRender.quick
      ? Math.max(0, throttleDelay() - (performance.now() - lastDispatch))
      : 0;
    if (wait > 1) renderTimer = setTimeout(dispatchRender, wait);
    else requestAnimationFrame(dispatchRender);
  }
  function redraw(quick: boolean): void {
    if (!state.mesh) return;
    if (!quick) scheduleParameterHistory();
    // Preserve a queued final-quality request; otherwise only the latest input
    // matters. This coalesces pointer and slider events while the worker is busy.
    const renderQuick = quick && queuedRender?.quick !== false;
    const settings = settingsSnapshot();
    if (renderQuick) settings.previewDetail = previewDetail(previewPerformance);
    queuedRender = {
      id: ++requestId,
      meshVersion,
      quick: renderQuick,
      settings,
      queuedAt: performance.now(),
    };
    syncPreviewBusy();
    scheduleRender();
  }
  function invalidateRenderState(): void {
    requestId++;
    if (!queuedRender) return;
    const settings = settingsSnapshot();
    if (queuedRender.quick) settings.previewDetail = previewDetail(previewPerformance);
    queuedRender = {
      ...queuedRender,
      id: requestId,
      settings,
      queuedAt: performance.now(),
    };
  }
  renderWorker.addEventListener('message', ({ data }: MessageEvent<RenderWorkerMessage>) => {
    const completedRequest = activeRender;
    activeRender = null;
    renderInFlight = false;
    if (completedRequest?.dispatchedAt !== undefined)
      recordMeasure(
        'slicewise:render:worker-roundtrip',
        completedRequest.dispatchedAt,
        performance.now(),
      );
    if (data.type === 'result' && completedRequest?.id === data.id) {
      const disposition = renderDisposition({
        responseId: data.id,
        latestRequestId: requestId,
        sameMesh: data.meshVersion === meshVersion,
        quick: data.result.quick,
        allowStaleQuickPreview: state.dragging,
      });
      if (disposition !== 'discard') {
        const applyStarted = performance.now();
        if (disposition === 'commit') applyRender(data.result, completedRequest);
        else applyPreview(data.result, completedRequest);
        recordMeasure('slicewise:render:dom-apply', applyStarted, performance.now());
        measureNextPaint(completedRequest);
      }
    } else if (data.meshVersion === meshVersion && data.type === 'error') {
      failedRequestId = data.id;
      showError(data.message);
    }
    notifyRenderWaiters();
    syncPreviewBusy();
    scheduleRender();
  });
  renderWorker.addEventListener('error', () => {
    clearTimeout(renderTimer);
    queuedRender = null;
    activeRender = null;
    renderInFlight = false;
    failedRequestId = requestId;
    notifyRenderWaiters();
    syncPreviewBusy();
    showError('The contour worker stopped unexpectedly — reload the page to restart it');
  });

  /* --------------------------------------------------------- load model */
  function sendMeshToWorker(mesh: RenderMesh): void {
    previewPerformance = initialPreviewPerformance();
    const V = mesh.V.slice(),
      T = mesh.T.slice(),
      N = mesh.N.slice();
    const offsets = mesh.lineArt?.offsets.slice();
    const transfer = [V.buffer, T.buffer, N.buffer];
    if (offsets) transfer.push(offsets.buffer);
    renderWorker.postMessage(
      {
        type: 'mesh',
        meshVersion: ++meshVersion,
        mesh: {
          V: V.buffer,
          T: T.buffer,
          N: N.buffer,
          lineArtOffsets: offsets?.buffer,
        },
      },
      transfer,
    );
  }
  function setMesh(raw: RawMesh, name: string): void {
    try {
      const m = weld(raw) as NormalizedMesh;
      if (state.upY) {
        // rotate Y-up data so Z points up
        const V = m.V;
        for (let i = 0; i < V.length; i += 3) {
          const y = V[i + 1],
            z = V[i + 2];
          V[i + 1] = -z;
          V[i + 2] = y;
        }
      }
      m.N = vertexNormals(m.V, m.T);
      state.mesh = m as RenderMesh;
      sendMeshToWorker(state.mesh);
      state.name = name;
      $('mName').textContent = name;
      $('mName').title = '';
      $('mTris').textContent = (m.T.length / 3).toLocaleString();
      $('mUnits').textContent = 'triangles';
      $('mErr').hidden = true;
      redraw(false);
    } catch (e) {
      showError(errorMessage(e));
    }
  }
  function setCenterlines(
    parsed: Awaited<ReturnType<NonNullable<typeof globalThis.slicewiseParseSVGCenterlines>>>,
    name: string,
  ): void {
    const count = parsed.points.length / 2;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < parsed.points.length; i += 2) {
      minX = Math.min(minX, parsed.points[i]);
      maxX = Math.max(maxX, parsed.points[i]);
      minY = Math.min(minY, parsed.points[i + 1]);
      maxY = Math.max(maxY, parsed.points[i + 1]);
    }
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    let radius = 0;
    for (let i = 0; i < parsed.points.length; i += 2)
      radius = Math.max(radius, Math.hypot(parsed.points[i] - cx, parsed.points[i + 1] - cy));
    if (!Number.isFinite(radius) || radius <= 0)
      throw new Error('The extracted SVG centreline has no measurable span');
    const V = new Float32Array(count * 3);
    for (let point = 0; point < count; point++) {
      V[point * 3] = (parsed.points[point * 2] - cx) / radius;
      V[point * 3 + 1] = -(parsed.points[point * 2 + 1] - cy) / radius;
    }
    state.mesh = {
      V,
      T: new Uint32Array(),
      N: new Float32Array(V.length),
      lineArt: { offsets: parsed.offsets },
    };
    rawCache = null;
    sendMeshToWorker(state.mesh);
    state.name = name;
    $('mName').textContent = name;
    $('mName').title = 'Scale-axis centreline extracted from filled SVG artwork';
    $('mTris').textContent = (parsed.offsets.length - 1).toLocaleString();
    $('mUnits').textContent = 'centreline paths';
    $('mErr').hidden = true;
    redraw(false);
  }
  function setCenterlineView(): void {
    state.az = -90;
    state.el = 90;
    state.roll = 0;
    for (const [id, value] of [
      ['az', state.az],
      ['el', state.el],
      ['rl', state.roll],
    ] as const) {
      $(id).value = String(value);
      $(id + 'N').value = String(value);
    }
  }
  function showError(msg: string): void {
    const el = $('mErr');
    el.hidden = false;
    el.textContent = msg;
  }

  let rawCache: RawMesh | null = null; // keep the parsed-but-unoriented mesh so "up axis" can flip live
  const demoCache = new Map<string, RawMesh>();
  type DemoDefinition = { name: string; create: () => RawMesh };
  const demos: Record<string, DemoDefinition> = {
    knot: { name: 'demo · torus knot', create: () => torusKnot() },
    ripple: { name: 'demo · ripple sphere', create: () => sphereDemo('ripple') },
    cube: { name: 'demo · rounded cube', create: () => sphereDemo('cube') },
    diamond: { name: 'demo · soft diamond', create: () => sphereDemo('diamond') },
    torus: { name: 'demo · ring torus', create: () => ringTorus() },
    twist: { name: 'demo · twisted bloom', create: () => radialColumnDemo('twist') },
    hourglass: { name: 'demo · hourglass', create: () => radialColumnDemo('hourglass') },
    tetrapod: { name: 'demo · tetrapod', create: () => tetrapodDemo() },
  };
  function loadDemo(id: string, announce = true): void {
    const demo = demos[id];
    if (!demo) return;
    if (!demoCache.has(id)) demoCache.set(id, demo.create());
    const raw = demoCache.get(id)!;
    rawCache = raw;
    state.source = id;
    state.svgSource = null;
    state.svgSourceName = '';
    cancelGeneration();
    syncSourceControls();
    state.upY = false;
    $('upZ').setAttribute('aria-pressed', 'true');
    $('upY').setAttribute('aria-pressed', 'false');
    setMesh(raw, demo.name);
    if (announce) toast('Loaded ' + demo.name.replace('demo · ', ''));
  }
  function loadFile(file: File): void {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let raw: RawMesh;
        if (ext === 'svg') {
          const text = new TextDecoder().decode(new Uint8Array(reader.result as ArrayBuffer));
          state.svgSource = text;
          state.svgSourceName = file.name;
          state.source = 'upload';
          cancelGeneration();
          $('demo').value = 'upload';
          state.upY = false;
          $('upZ').setAttribute('aria-pressed', 'true');
          $('upY').setAttribute('aria-pressed', 'false');
          syncSourceControls();
          if (state.svgMode === 'centerline') {
            const centerlines = await globalThis.slicewiseParseSVGCenterlines!(
              text,
              state.svgCenterlinePruning,
            );
            setCenterlineView();
            setCenterlines(centerlines, file.name);
            toast('Loaded ' + file.name + ' as a centreline');
            return;
          }
          raw = await globalThis.slicewiseParseSVG!(
            text,
            state.svgDepth,
            state.svgRounded,
            state.svgRoundness,
          );
        } else if (ext === 'stl') raw = parseSTL(reader.result as ArrayBuffer);
        else if (ext === 'obj')
          raw = parseOBJ(new TextDecoder().decode(new Uint8Array(reader.result as ArrayBuffer)));
        else if (ext === 'ply') raw = parsePLY(reader.result as ArrayBuffer);
        else throw new Error('Unsupported format: .' + ext + ' — use STL, OBJ, PLY or SVG');
        if (!raw.tris.length) throw new Error('No triangles found in ' + file.name);
        if (ext !== 'svg') {
          state.svgSource = null;
          state.svgSourceName = '';
        }
        rawCache = raw;
        state.source = 'upload';
        cancelGeneration();
        $('demo').value = 'upload';
        // OBJ and PLY usually ship Y-up; STL is almost always Z-up
        const guessY = ext === 'obj' || ext === 'ply';
        state.upY = guessY;
        $('upZ').setAttribute('aria-pressed', String(!guessY));
        $('upY').setAttribute('aria-pressed', String(guessY));
        syncSourceControls();
        setMesh(raw, file.name);
        toast('Loaded ' + file.name);
      } catch (e) {
        showError(errorMessage(e));
      }
    };
    reader.onerror = () =>
      showError("Could not read that file — check it isn't open in another program");
    reader.readAsArrayBuffer(file);
  }

  const generativeWorker = new Worker(new URL('./generative-mesh-worker.ts', import.meta.url), {
    type: 'module',
  });
  const generativeKeys: Array<keyof Omit<GenerativeParams, 'genField'>> = [
    'genSeed',
    'genBlend',
    'genFreq',
    'genAniso',
    'genIso',
    'genTwist',
    'genNoise',
    'genRes',
  ];
  let generationId = 0,
    generationInFlight = false,
    queuedGeneration: GenerationRequest | null = null,
    generationTimer = 0;
  function syncPreviewBusy(): void {
    const busy = isPreviewBusy({
      renderInFlight,
      renderQueued: Boolean(queuedRender),
      generationInFlight,
      generationQueued: Boolean(queuedGeneration),
    });
    const wrap = $('bedwrap');
    wrap.classList.toggle('busy', busy);
    wrap.setAttribute('aria-busy', String(busy));
    const statusDot = $('previewStatusDot');
    statusDot.classList.toggle('is-rendering', busy);
    $('previewStatusText').textContent = busy ? 'Rendering preview' : 'Preview ready';
  }
  function cancelGeneration(): void {
    clearTimeout(generationTimer);
    queuedGeneration = null;
    generationId++;
    setGenerativeBusy(false);
  }
  function generativeParams(): GenerativeParams {
    return Object.fromEntries(
      ['genField', ...generativeKeys].map((key) => [key, dynamicState[key]]),
    ) as unknown as GenerativeParams;
  }
  function setGenerativeBusy(busy: boolean): void {
    $('generativeControls').closest('.generative-controls')?.classList.toggle('is-building', busy);
    syncPreviewBusy();
    $('mName').textContent =
      busy && state.source === 'generative'
        ? `generative · ${state.genField} · building…`
        : state.name;
  }
  function dispatchGeneration(): void {
    if (generationInFlight || !queuedGeneration) return;
    const request = queuedGeneration;
    queuedGeneration = null;
    generationInFlight = true;
    setGenerativeBusy(true);
    generativeWorker.postMessage({ type: 'generate', ...request });
  }
  function queueGeneration(delay = 100): void {
    if (state.source !== 'generative') return;
    queuedGeneration = { id: ++generationId, params: generativeParams() };
    syncPreviewBusy();
    clearTimeout(generationTimer);
    if (generationInFlight) return;
    generationTimer = setTimeout(dispatchGeneration, delay);
  }
  function loadGenerative(announce = true): void {
    state.source = 'generative';
    state.svgSource = null;
    state.svgSourceName = '';
    state.upY = false;
    $('upZ').setAttribute('aria-pressed', 'true');
    $('upY').setAttribute('aria-pressed', 'false');
    syncSourceControls();
    queueGeneration(0);
    if (announce) toast('Generating mesh');
  }
  generativeWorker.addEventListener(
    'message',
    ({ data }: MessageEvent<GenerationWorkerMessage>) => {
      generationInFlight = false;
      if (data.type === 'error' && data.id === generationId && state.source === 'generative')
        showError(data.message);
      if (data.type === 'result' && data.id === generationId && state.source === 'generative') {
        rawCache = { verts: new Float32Array(data.positions), tris: new Uint32Array(data.indices) };
        setMesh(rawCache, `generative · ${state.genField}`);
        $('mName').title = `Generated in ${Math.round(data.stats.ms)} ms`;
      }
      if (queuedGeneration) dispatchGeneration();
      else setGenerativeBusy(false);
    },
  );
  generativeWorker.addEventListener('error', () => {
    generationInFlight = false;
    queuedGeneration = null;
    setGenerativeBusy(false);
    if (state.source === 'generative')
      showError('The mesh generator stopped unexpectedly — reload the page to restart it');
  });

  /* -------------------------------------------------------------- wiring */
  const morphKeyById = new Map<string, string>();
  function bindPair(id: string, key: string, after: () => void = () => {}): void {
    morphKeyById.set(id, key);
    const s = $(id),
      n = $(id + 'N');
    const apply = (v: string, from: 's' | 'n'): void => {
      const next = clamp(parseFloat(v), parseFloat(n.min), parseFloat(n.max));
      if (Number.isNaN(next)) return;
      dynamicState[key] = next;
      if (from !== 's') s.value = String(clamp(next, parseFloat(s.min), parseFloat(s.max)));
      if (from !== 'n') n.value = String(next);
      if (after) after();
      redraw(true);
    };
    s.addEventListener('input', (e) => apply(inputTarget(e).value, 's'));
    n.addEventListener('input', (e) => apply(inputTarget(e).value, 'n'));
    s.addEventListener('change', () => redraw(false));
    n.addEventListener('change', () => redraw(false));
  }
  function bindExportPair(id: string, key: string): void {
    const slider = $(id),
      number = $(id + 'N');
    const apply = (value: string, from: 's' | 'n'): void => {
      const next = clamp(parseFloat(value), parseFloat(number.min), parseFloat(number.max));
      if (Number.isNaN(next)) return;
      dynamicState[key] = next;
      if (from !== 's') slider.value = String(next);
      if (from !== 'n') number.value = String(next);
      updateExportSize();
    };
    slider.addEventListener('input', (event) => apply(inputTarget(event).value, 's'));
    number.addEventListener('input', (event) => apply(inputTarget(event).value, 'n'));
  }
  bindPair('az', 'az');
  bindPair('el', 'el');
  bindPair('rl', 'roll');
  bindPair('zoom', 'zoom');
  bindPair('panX', 'panX');
  bindPair('panY', 'panY');
  bindPair('lensFocalLength', 'lensFocalLength');
  bindPair('lensPerspective', 'lensPerspective');
  bindPair('lensWarpExponent', 'lensWarpExponent');
  bindPair('mobiusDirection', 'mobiusDirection');
  bindPair('mobiusDisplacement', 'mobiusDisplacement');
  bindPair('mobiusRotation', 'mobiusRotation');
  bindPair('mobiusStrength', 'mobiusStrength');
  bindPair('lensDistortion', 'lensDistortion');
  bindPair('lines', 'lines');
  bindPair('easeStrength', 'easeStrength');
  bindPair('easeCycles', 'easeCycles');
  bindPair('easeCenter', 'easeCenter');
  bindPair('quality', 'quality');
  bindPair('sw', 'sw');
  bindPair('lineWeightInterval', 'lineWeightInterval');
  bindPair('lineWeightAmount', 'lineWeightAmount');
  bindPair('margin', 'margin');
  bindPair('maskRoundness', 'maskRoundness');
  bindPair('maskScaleX', 'maskScaleX');
  bindPair('maskScaleY', 'maskScaleY');
  bindPair('maskOffsetX', 'maskOffsetX');
  bindPair('maskOffsetY', 'maskOffsetY');
  bindPair('maskLfo1Amplitude', 'maskLfo1Amplitude');
  bindPair('maskLfo1Cycles', 'maskLfo1Cycles');
  bindPair('maskLfo1Phase', 'maskLfo1Phase');
  bindPair('maskLfo1Waveform', 'maskLfo1Waveform');
  bindPair('maskLfo2Amplitude', 'maskLfo2Amplitude');
  bindPair('maskLfo2Cycles', 'maskLfo2Cycles');
  bindPair('maskLfo2Phase', 'maskLfo2Phase');
  bindPair('maskLfo2Waveform', 'maskLfo2Waveform');
  bindPair('chromaAmount', 'chromaAmount');
  bindPair('humanizerAmount', 'humanizerAmount');
  bindPair('yarnCutPercent', 'yarnCutPercent');
  bindPair('yarnCurlSize', 'yarnCurlSize');
  bindPair('halftoneSize', 'halftoneSize');
  bindPair('halftoneContrast', 'halftoneContrast');
  bindPair('halftoneCycles', 'halftoneCycles');
  bindPair('gradientColors', 'gradientColors');
  bindPair('cutAz', 'cutAz', activateCustomAxis);
  bindPair('cutEl', 'cutEl', activateCustomAxis);
  bindPair('waveCenterX', 'waveCenterX');
  bindPair('waveCenterY', 'waveCenterY');
  bindPair('waveCenterZ', 'waveCenterZ');
  bindPair('cylinderAzimuth', 'cylinderAzimuth');
  bindPair('cylinderElevation', 'cylinderElevation');
  bindPair('geodesicSeedAzimuth', 'geodesicSeedAzimuth');
  bindPair('geodesicSeedElevation', 'geodesicSeedElevation');
  bindPair('geodesicSeedBAzimuth', 'geodesicSeedBAzimuth');
  bindPair('geodesicSeedBElevation', 'geodesicSeedBElevation');
  bindPair('curvatureSmoothing', 'curvatureSmoothing');
  bindPair('curvatureRange', 'curvatureRange');
  bindPair('curvatureContrast', 'curvatureContrast');
  bindPair('divergence', 'divergence', syncSliceConstruction);
  bindPair('sliceLfoAmplitude', 'sliceLfoAmplitude');
  bindPair('sliceLfoCycles', 'sliceLfoCycles');
  bindPair('sliceLfoAngle', 'sliceLfoAngle');
  bindPair('sliceLfoPhase', 'sliceLfoPhase');
  bindPair('sliceLfoModulationDepth', 'sliceLfoModulationDepth');
  bindPair('sliceLfoModulationCycles', 'sliceLfoModulationCycles');
  bindPair('sliceLfoModulationPhase', 'sliceLfoModulationPhase');
  bindPair('explodeAmount', 'explodeAmount', syncSliceConstruction);
  bindPair('morphSteps', 'morphSteps');
  bindPair('morphStepsY', 'morphStepsY');
  bindExportPair('drawFeed', 'drawFeed');
  bindExportPair('travelFeed', 'travelFeed');
  bindExportPair('mergeTolerance', 'mergeTolerance');
  bindExportPair('penUp', 'penUp');
  bindExportPair('penDown', 'penDown');
  bindExportPair('zFeed', 'zFeed');
  morphKeyById.set('color', 'color');

  function syncProjectionWarpControls(): void {
    const kleinEnabled = state.projectionWarpMode === 'klein-poincare';
    const mobiusEnabled = state.projectionWarpMode === 'mobius';
    for (const id of ['lensWarpExponent']) {
      $(id).disabled = !kleinEnabled;
      $(id + 'N').disabled = !kleinEnabled;
      $(id + 'Control').classList.toggle('is-disabled', !kleinEnabled);
    }
    for (const id of [
      'mobiusDirection',
      'mobiusDisplacement',
      'mobiusRotation',
      'mobiusStrength',
    ]) {
      $(id).disabled = !mobiusEnabled;
      $(id + 'N').disabled = !mobiusEnabled;
      $(id + 'Control').classList.toggle('is-disabled', !mobiusEnabled);
    }
  }
  $('projectionWarpMode').addEventListener('change', (event) => {
    state.projectionWarpMode = inputTarget(event).value as ContourSettings['projectionWarpMode'];
    syncProjectionWarpControls();
    redraw(false);
  });
  syncProjectionWarpControls();

  function bindGenerativePair(id: string, key: keyof Omit<GenerativeParams, 'genField'>): void {
    const slider = $(id),
      number = $(id + 'N');
    const apply = (value: string, from: 's' | 'n', final = false): void => {
      let next = clamp(parseFloat(value), parseFloat(number.min), parseFloat(number.max));
      if (Number.isNaN(next)) return;
      if (id === 'genSeed' || id === 'genRes') next = Math.round(next);
      state[key] = next;
      if (from !== 's') slider.value = String(next);
      if (from !== 'n') number.value = String(next);
      queueGeneration(final ? 0 : 110);
    };
    slider.addEventListener('input', (event) => apply(inputTarget(event).value, 's'));
    number.addEventListener('input', (event) => apply(inputTarget(event).value, 'n'));
    slider.addEventListener('change', (event) => apply(inputTarget(event).value, 's', true));
    number.addEventListener('change', (event) => apply(inputTarget(event).value, 'n', true));
  }
  for (const key of generativeKeys) bindGenerativePair(key, key);
  $('genField').addEventListener('change', (event) => {
    state.genField = inputTarget(event).value as GenerativeParams['genField'];
    queueGeneration(0);
  });

  document.addEventListener('morphchange', (event) => {
    const customEvent = event as CustomEvent<MorphChangeDetail>;
    const { id, dimension = 1, active, value } = customEvent.detail || {};
    if (!id) return;
    const key = morphKeyById.get(id);
    if (!key) return;
    const targets = dimension === 2 ? state.morphTargets2 : state.morphTargets;
    if (active && key === 'color' && /^#[0-9a-f]{6}$/i.test(String(value)))
      targets[key] = String(value);
    else if (active && Number.isFinite(Number(value))) targets[key] = Number(value);
    else delete targets[key];
    redraw(false);
  });
  function syncMorphControls(): void {
    $('morphSettings').classList.toggle('is-disabled', !state.morphEnabled);
    $('morphSteps').disabled = !state.morphEnabled;
    $('morphStepsN').disabled = !state.morphEnabled;
    $('morphSecondEnabled').disabled = !state.morphEnabled;
    const secondActive = state.morphEnabled && state.morphSecondEnabled;
    $('morphSecondSettings').classList.toggle('is-disabled', !secondActive);
    $('morphStepsY').disabled = !secondActive;
    $('morphStepsYN').disabled = !secondActive;
  }
  $('morphEnabled').addEventListener('change', (event) => {
    state.morphEnabled = inputTarget(event).checked;
    syncMorphControls();
    redraw(false);
  });
  $('morphSecondEnabled').addEventListener('change', (event) => {
    state.morphSecondEnabled = inputTarget(event).checked;
    if (!state.morphSecondEnabled) state.morphTargets2 = {};
    document.dispatchEvent(
      new CustomEvent('morphseconddimension', { detail: { enabled: state.morphSecondEnabled } }),
    );
    syncMorphControls();
    redraw(false);
  });
  syncMorphControls();

  async function rebuildSVG(): Promise<void> {
    if (!state.svgSource) return;
    const source = state.svgSource,
      name = state.svgSourceName;
    try {
      if (state.svgMode === 'centerline') {
        const centerlines = await globalThis.slicewiseParseSVGCenterlines!(
          source,
          state.svgCenterlinePruning,
        );
        if (source !== state.svgSource) return;
        setCenterlines(centerlines, name);
        return;
      }
      const raw = await globalThis.slicewiseParseSVG!(
        source,
        state.svgDepth,
        state.svgRounded,
        state.svgRoundness,
      );
      if (source !== state.svgSource) return;
      rawCache = raw;
      setMesh(rawCache, name);
    } catch (e) {
      showError(errorMessage(e));
    }
  }
  let svgRebuildTimer = 0;
  function bindSVGPair(id: string, key: string): void {
    const slider = $(id),
      number = $(id + 'N');
    const apply = (value: string, from: 's' | 'n', final = false): void => {
      const next = clamp(parseFloat(value), parseFloat(number.min), parseFloat(number.max));
      if (Number.isNaN(next)) return;
      dynamicState[key] = next;
      if (from !== 's') slider.value = String(next);
      if (from !== 'n') number.value = String(next);
      if (!state.svgSource) return;
      clearTimeout(svgRebuildTimer);
      if (final) rebuildSVG();
      else svgRebuildTimer = setTimeout(rebuildSVG, 90);
    };
    slider.addEventListener('input', (event) => apply(inputTarget(event).value, 's'));
    number.addEventListener('input', (event) => apply(inputTarget(event).value, 'n'));
    slider.addEventListener('change', (event) => apply(inputTarget(event).value, 's', true));
    number.addEventListener('change', (event) => apply(inputTarget(event).value, 'n', true));
  }
  bindSVGPair('svgDepth', 'svgDepth');
  bindSVGPair('svgRoundness', 'svgRoundness');
  bindSVGPair('svgCenterlinePruning', 'svgCenterlinePruning');
  function syncSVGControls(): void {
    const active = Boolean(state.svgSource);
    $('svgExtrusion').hidden = !active;
    const centerline = state.svgMode === 'centerline';
    $('svgExtrusionControls').hidden = centerline;
    $('svgCenterlineControls').hidden = !centerline;
    const roundnessActive = active && !centerline && state.svgRounded;
    $('svgRoundness').disabled = !roundnessActive;
    $('svgRoundnessN').disabled = !roundnessActive;
    $('svgRoundnessControl').classList.toggle('is-disabled', !roundnessActive);
  }
  function syncSourceControls(): void {
    $('generativeControls').hidden = state.source !== 'generative';
    syncSVGControls();
  }
  $('svgRounded').addEventListener('change', (event) => {
    state.svgRounded = inputTarget(event).checked;
    syncSVGControls();
    rebuildSVG();
  });
  $('svgMode').addEventListener('change', (event) => {
    state.svgMode = inputTarget(event).value === 'centerline' ? 'centerline' : 'extrude';
    if (state.svgMode === 'centerline') setCenterlineView();
    syncSVGControls();
    rebuildSVG();
  });

  type GCodeProfile = {
    drawFeed: number;
    travelFeed: number;
    penUp: number;
    penDown: number;
    zFeed: number;
    note: string;
  };
  type GCodeNumericKey = Exclude<keyof GCodeProfile, 'note'>;
  const gcodeProfiles: Record<string, GCodeProfile> = {
    uunatek3: {
      drawFeed: 3000,
      travelFeed: 6000,
      penUp: 0,
      penDown: -3,
      zFeed: 2000,
      note: 'UUNA TEK rear-left origin with 3 mm pen drop. Set the machine origin at the sheet’s rear-left corner before plotting.',
    },
    generic: {
      drawFeed: 1200,
      travelFeed: 3000,
      penUp: 5,
      penDown: 0,
      zFeed: 600,
      note: 'Generic bottom-left origin. Confirm Z heights, speeds, and origin for your machine before plotting.',
    },
  };
  function setExportPair(id: string, key: GCodeNumericKey, value: number): void {
    dynamicState[key] = value;
    $(id).value = String(value);
    $(id + 'N').value = String(value);
  }
  $('gcodeProfile').addEventListener('change', (event) => {
    state.gcodeProfile = inputTarget(event).value;
    const profile = gcodeProfiles[state.gcodeProfile];
    for (const key of ['drawFeed', 'travelFeed', 'penUp', 'penDown', 'zFeed'] as GCodeNumericKey[])
      setExportPair(key, key, profile[key]);
    $('gcodeProfileNote').textContent = profile.note;
    updateExportSize();
  });

  $('exportFormat').addEventListener('change', (event) => {
    state.exportFormat = inputTarget(event).value;
    const gcode = state.exportFormat === 'gcode';
    $('gcodeControls').hidden = !gcode;
    $('exportLabel').textContent = gcode ? 'Export G-code' : 'Export SVG';
    $('copy').setAttribute('aria-label', gcode ? 'Copy G-code' : 'Copy SVG markup');
    updateExportSize();
  });
  function syncTravelOptimization(): void {
    $('mergeTolerance').disabled = !state.optimizeTravel;
    $('mergeToleranceN').disabled = !state.optimizeTravel;
    $('mergeToleranceControl').classList.toggle('is-disabled', !state.optimizeTravel);
  }
  $('optimizeTravel').addEventListener('change', (event) => {
    state.optimizeTravel = inputTarget(event).checked;
    syncTravelOptimization();
    updateExportSize();
  });
  syncTravelOptimization();

  const curvedSliceField = (): boolean =>
    state.axis === 'spherical' || state.axis === 'cylindrical';
  const intrinsicSliceField = (): boolean =>
    state.axis === 'geodesic' || state.axis === 'curvature';
  const nonPlanarSliceField = (): boolean => curvedSliceField() || intrinsicSliceField();
  const multiSourceGeodesic = (): boolean =>
    state.axis === 'geodesic' && state.geodesicMode !== 'single';
  const fixedGeodesicSpacing = (): boolean =>
    state.axis === 'geodesic' &&
    (state.geodesicMode === 'difference' || state.geodesicMode === 'voronoi');
  function syncSliceFieldControls(): void {
    const curved = curvedSliceField();
    const intrinsic = intrinsicSliceField();
    const nonPlanar = curved || intrinsic;
    $('customAxis').hidden = state.axis !== 'custom';
    $('wavefrontControls').hidden = !curved;
    $('cylinderAxisControls').hidden = state.axis !== 'cylindrical';
    $('geodesicControls').hidden = state.axis !== 'geodesic';
    $('curvatureControls').hidden = state.axis !== 'curvature';
    $('geodesicSecondSeedControls').hidden = !multiSourceGeodesic();
    for (const id of ['divergence']) {
      $(id).disabled = nonPlanar;
      $(id + 'N').disabled = nonPlanar;
      $(id + 'Control').classList.toggle('is-disabled', nonPlanar);
    }
    $('sliceLfo').disabled = nonPlanar;
    $('sliceLfo').closest('.checkbox-control')?.classList.toggle('is-disabled', nonPlanar);
    $('explodeAmount').disabled = intrinsic;
    $('explodeAmountN').disabled = intrinsic;
    $('explodeAmountControl').classList.toggle('is-disabled', intrinsic);
    const voronoi = state.axis === 'geodesic' && state.geodesicMode === 'voronoi';
    $('lines').disabled = voronoi;
    $('linesN').disabled = voronoi;
    $('linesControl').classList.toggle('is-disabled', voronoi);
    syncEaseCenter();
    syncSliceLfoControls();
    syncSliceConstruction();
  }
  $('axis').addEventListener('change', (e) => {
    state.axis = inputTarget(e).value;
    syncSliceFieldControls();
    redraw(false);
  });
  $('geodesicMode').addEventListener('change', (event) => {
    state.geodesicMode = inputTarget(event).value as ContourSettings['geodesicMode'];
    syncSliceFieldControls();
    redraw(false);
  });
  $('curvatureMethod').addEventListener('change', (event) => {
    state.curvatureMethod = inputTarget(event).value as ContourSettings['curvatureMethod'];
    redraw(false);
  });
  $('curvatureIncludeZero').addEventListener('change', (event) => {
    state.curvatureIncludeZero = inputTarget(event).checked;
    redraw(false);
  });
  function syncEaseCenter(): void {
    const spacingDisabled = fixedGeodesicSpacing();
    $('gapEase').disabled = spacingDisabled;
    $('gapEaseControl').classList.toggle('is-disabled', spacingDisabled);
    for (const id of ['easeStrength', 'easeCycles']) {
      $(id).disabled = spacingDisabled;
      $(id + 'N').disabled = spacingDisabled;
      $(id + 'Control').classList.toggle('is-disabled', spacingDisabled);
    }
    const centerEnabled =
      !spacingDisabled && (state.gapEase.endsWith('-in-out') || state.gapEase.endsWith('-out-in'));
    $('easeCenter').disabled = !centerEnabled;
    $('easeCenterN').disabled = !centerEnabled;
    $('easeCenterControl').classList.toggle('is-disabled', !centerEnabled);
  }
  $('gapEase').addEventListener('change', (e) => {
    state.gapEase = inputTarget(e).value;
    syncEaseCenter();
    redraw(false);
  });
  function syncSliceConstruction(): void {
    const spiralBlocked =
      nonPlanarSliceField() ||
      state.divergence > 0 ||
      state.sliceLfo ||
      state.explodeAmount > 0 ||
      state.lineWeightMode !== 'uniform';
    if (spiralBlocked && state.spiral) {
      state.spiral = false;
      $('spiral').checked = false;
    }
    $('spiral').disabled = spiralBlocked;
    $('spiral').closest('.checkbox-control')?.classList.toggle('is-disabled', spiralBlocked);
  }
  function syncSliceLfoControls(): void {
    const disabled = nonPlanarSliceField() || !state.sliceLfo;
    for (const id of ['sliceLfoAmplitude', 'sliceLfoCycles', 'sliceLfoAngle', 'sliceLfoPhase']) {
      $(id).disabled = disabled;
      $(id + 'N').disabled = disabled;
      $(id + 'Control').classList.toggle('is-disabled', disabled);
    }
    $('sliceLfoWaveform').disabled = disabled;
    $('sliceLfoWaveformControl').classList.toggle('is-disabled', disabled);
    $('sliceLfoModulation').disabled = disabled;
    $('sliceLfoModulation').closest('.checkbox-control')?.classList.toggle('is-disabled', disabled);
    const modulationDisabled = disabled || !state.sliceLfoModulation;
    for (const id of [
      'sliceLfoModulationDepth',
      'sliceLfoModulationCycles',
      'sliceLfoModulationPhase',
    ]) {
      $(id).disabled = modulationDisabled;
      $(id + 'N').disabled = modulationDisabled;
      $(id + 'Control').classList.toggle('is-disabled', modulationDisabled);
    }
    $('sliceLfoModulationMode').disabled = modulationDisabled;
    $('sliceLfoModulationModeControl').classList.toggle('is-disabled', modulationDisabled);
  }
  $('sliceLfo').addEventListener('change', (event) => {
    state.sliceLfo = inputTarget(event).checked;
    syncSliceLfoControls();
    syncSliceConstruction();
    redraw(false);
  });
  $('sliceLfoWaveform').addEventListener('change', (event) => {
    state.sliceLfoWaveform = inputTarget(event).value;
    redraw(false);
  });
  $('sliceLfoModulation').addEventListener('change', (event) => {
    state.sliceLfoModulation = inputTarget(event).checked;
    syncSliceLfoControls();
    redraw(false);
  });
  $('sliceLfoModulationMode').addEventListener('change', (event) => {
    state.sliceLfoModulationMode = inputTarget(event).value;
    redraw(false);
  });
  $('spiral').addEventListener('change', (e) => {
    state.spiral = inputTarget(e).checked;
    redraw(false);
  });
  syncSliceFieldControls();
  syncSliceLfoControls();
  syncSliceConstruction();
  function syncLineWeightControls(): void {
    const enabled = state.lineWeightMode !== 'uniform';
    const intervalEnabled = state.lineWeightMode === 'index' || state.lineWeightMode === 'wave';
    for (const id of ['lineWeightInterval', 'lineWeightAmount']) {
      const controlEnabled = id === 'lineWeightInterval' ? intervalEnabled : enabled;
      $(id).disabled = !controlEnabled;
      $(id + 'N').disabled = !controlEnabled;
      $(id + 'Control').classList.toggle('is-disabled', !controlEnabled);
    }
  }
  $('lineWeightMode').addEventListener('change', (event) => {
    state.lineWeightMode = inputTarget(event).value;
    syncLineWeightControls();
    syncSliceConstruction();
    redraw(false);
  });
  syncLineWeightControls();
  $('hide').addEventListener('change', (e) => {
    state.hide = inputTarget(e).checked;
    redraw(false);
  });
  $('sil').addEventListener('change', (e) => {
    state.sil = inputTarget(e).checked;
    redraw(false);
  });
  $('bg').addEventListener('change', (e) => {
    state.bg = inputTarget(e).checked;
    redraw(false);
  });
  $('clipToArtboard').addEventListener('change', (e) => {
    state.clipToArtboard = inputTarget(e).checked;
    redraw(false);
  });
  const maskControlIds = [
    'maskRoundness',
    'maskScaleX',
    'maskScaleY',
    'maskOffsetX',
    'maskOffsetY',
    'maskLfo1Amplitude',
    'maskLfo1Cycles',
    'maskLfo1Phase',
    'maskLfo1Waveform',
    'maskLfo2Amplitude',
    'maskLfo2Cycles',
    'maskLfo2Phase',
    'maskLfo2Waveform',
  ] as const;
  function syncMaskControls(): void {
    $('maskOutline').disabled = !state.maskEnabled;
    $('maskOutline')
      .closest('.checkbox-control')
      ?.classList.toggle('is-disabled', !state.maskEnabled);
    for (const id of maskControlIds) {
      $(id).disabled = !state.maskEnabled;
      $(id + 'N').disabled = !state.maskEnabled;
      $(id + 'Control').classList.toggle('is-disabled', !state.maskEnabled);
    }
  }
  $('maskEnabled').addEventListener('change', (event) => {
    state.maskEnabled = inputTarget(event).checked;
    syncMaskControls();
    redraw(false);
  });
  $('maskOutline').addEventListener('change', (event) => {
    state.maskOutline = inputTarget(event).checked;
    redraw(false);
  });
  syncMaskControls();
  function syncHalftoneControls(): void {
    for (const id of ['halftoneSize', 'halftoneContrast', 'halftoneCycles']) {
      $(id).disabled = !state.halftone;
      $(id + 'N').disabled = !state.halftone;
      $(id + 'Control').classList.toggle('is-disabled', !state.halftone);
    }
  }
  function syncChromaAmount(): void {
    $('chromaAmount').disabled = !state.chroma;
    $('chromaAmountN').disabled = !state.chroma;
    $('chromaAmountControl').classList.toggle('is-disabled', !state.chroma);
  }
  function syncHumanizerControls(): void {
    $('humanizerAmount').disabled = !state.humanizer;
    $('humanizerAmountN').disabled = !state.humanizer;
    $('humanizerAmountControl').classList.toggle('is-disabled', !state.humanizer);
  }
  function syncYarnCurlControls(): void {
    for (const id of ['yarnCutPercent', 'yarnCurlSize']) {
      $(id).disabled = !state.yarnCurl;
      $(id + 'N').disabled = !state.yarnCurl;
      $(id + 'Control').classList.toggle('is-disabled', !state.yarnCurl);
    }
  }
  function syncBlueprintControls(): void {
    $('blueprintStyle').disabled = !state.blueprint;
    $('blueprintStyleControl').classList.toggle('is-disabled', !state.blueprint);
  }
  $('halftone').addEventListener('change', (e) => {
    state.halftone = inputTarget(e).checked;
    syncHalftoneControls();
    redraw(false);
  });
  $('chroma').addEventListener('change', (e) => {
    state.chroma = inputTarget(e).checked;
    syncChromaAmount();
    redraw(false);
  });
  $('humanizer').addEventListener('change', (e) => {
    state.humanizer = inputTarget(e).checked;
    syncHumanizerControls();
    redraw(false);
  });
  $('yarnCurl').addEventListener('change', (e) => {
    state.yarnCurl = inputTarget(e).checked;
    syncYarnCurlControls();
    redraw(false);
  });
  $('gradientEnabled').addEventListener('change', (e) => {
    state.gradientEnabled = inputTarget(e).checked;
    $('gradientEditor').classList.toggle('enabled', state.gradientEnabled);
    redraw(false);
  });
  $('lineIndexColorEnabled').addEventListener('change', (e) => {
    state.lineIndexColorEnabled = inputTarget(e).checked;
    $('lineIndexColorEditor').classList.toggle('enabled', state.lineIndexColorEnabled);
    redraw(false);
  });
  $('blueprint').addEventListener('change', (e) => {
    state.blueprint = inputTarget(e).checked;
    syncBlueprintControls();
    redraw(false);
  });
  $('topographicMap').addEventListener('change', (e) => {
    state.topographicMap = inputTarget(e).checked;
    redraw(false);
  });
  $('blueprintStyle').addEventListener('change', (e) => {
    state.blueprintStyle = inputTarget(e).value;
    redraw(false);
  });
  $('gradientEditor').addEventListener('gradientchange', (e) => {
    state.gradientStops = (e as CustomEvent<GradientChangeDetail>).detail.stops;
    scheduleParameterHistory();
    if (state.gradientEnabled) redraw(true);
  });
  $('lineIndexColorEditor').addEventListener('lineindexcolorschange', (e) => {
    state.lineIndexColors = (e as CustomEvent<LineIndexColorsChangeDetail>).detail.colors;
    scheduleParameterHistory();
    if (state.lineIndexColorEnabled) redraw(true);
  });
  $('color').addEventListener('input', (e) => {
    const value = inputTarget(e).value;
    setInk(value, true);
    $('colorHex').value = value;
  });
  $('color').addEventListener('change', () => redraw(false));
  $('colorHex').addEventListener('input', (e) => {
    const v = inputTarget(e).value.trim();
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) {
      const full = v.length === 4 ? '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3] : v;
      $('color').value = full;
      setInk(v, true);
    }
  });
  $('colorHex').addEventListener('change', () => redraw(false));
  function setInk(v: string, quick: boolean): void {
    state.color = v;
    $('swatch').style.background = v;
    redraw(quick);
  }
  $('backgroundColor').addEventListener('input', (e) => {
    const value = inputTarget(e).value;
    setBackgroundColor(value, true);
    $('backgroundColorHex').value = value;
  });
  $('backgroundColor').addEventListener('change', () => redraw(false));
  $('backgroundColorHex').addEventListener('input', (e) => {
    const v = inputTarget(e).value.trim();
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) {
      const full = v.length === 4 ? '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3] : v;
      $('backgroundColor').value = full;
      setBackgroundColor(full, true);
    }
  });
  $('backgroundColorHex').addEventListener('change', () => redraw(false));
  function setBackgroundColor(v: string, quick: boolean): void {
    state.backgroundColor = v;
    $('backgroundSwatch').style.background = v;
    if (!state.blueprint && !state.chroma) $('bed').style.background = v;
    redraw(quick);
  }
  function activateCustomAxis(): void {
    state.axis = 'custom';
    $('axis').value = 'custom';
    $('customAxis').hidden = false;
  }
  const paperSizes: Record<string, readonly [number, number]> = {
    a6: [105, 148],
    a5: [148, 210],
    a4: [210, 297],
    a3: [297, 420],
    a2: [420, 594],
    a1: [594, 841],
    a0: [841, 1189],
    letter: [216, 279],
    legal: [216, 356],
    tabloid: [279, 432],
  };
  function syncPaperPreset(): void {
    const match = Object.entries(paperSizes).find(
      ([, size]) => size[0] === state.pw && size[1] === state.ph,
    );
    $('paperPreset').value = match?.[0] || 'custom';
  }
  $('paperPreset').addEventListener('change', (e) => {
    const size = paperSizes[inputTarget(e).value];
    if (!size) return;
    [state.pw, state.ph] = size;
    $('pw').value = String(state.pw);
    $('ph').value = String(state.ph);
    redraw(false);
  });
  for (const id of ['pw', 'ph'] as const)
    $(id).addEventListener('input', (e) => {
      const v = clamp(parseFloat(inputTarget(e).value) || 10, 10, 2000);
      state[id] = v;
      syncPaperPreset();
      redraw(true);
    });
  for (const id of ['pw', 'ph']) $(id).addEventListener('change', () => redraw(false));
  $('upZ').addEventListener('click', () => setUp(false));
  $('upY').addEventListener('click', () => setUp(true));
  function setUp(y: boolean): void {
    if (state.upY === y) return;
    state.upY = y;
    $('upZ').setAttribute('aria-pressed', String(!y));
    $('upY').setAttribute('aria-pressed', String(y));
    if (rawCache) setMesh(rawCache, state.name);
  }

  /* file input + drag and drop */
  $('demo').addEventListener('change', (e) =>
    inputTarget(e).value === 'generative' ? loadGenerative() : loadDemo(inputTarget(e).value),
  );
  $('file').addEventListener('change', (e) => {
    const file = inputTarget(e).files?.[0];
    if (file) loadFile(file);
  });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === 'dragleave' && (e as DragEvent).relatedTarget) return;
      drop.classList.remove('over');
    }),
  );
  document.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  /* orbit by dragging the sheet */
  (function orbit() {
    const bed = $<HTMLElement>('bed');
    let sx = 0,
      sy = 0,
      az0 = 0,
      el0 = 0,
      ro0 = 0,
      panX0 = 0,
      panY0 = 0,
      mode = 'orbit',
      id: number | null = null;
    let spaceDown = false;
    let wheelEnd = 0;
    const isEditable = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName));
    const setSpaceDown = (active: boolean): void => {
      spaceDown = active;
      bed.classList.toggle('space-pan', active && !state.dragging);
    };
    const syncPair = (id: string, value: number): void => {
      $(id).value = String(value);
      $(id + 'N').value = String(value);
    };
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || isEditable(e.target)) return;
      e.preventDefault();
      setSpaceDown(true);
    });
    document.addEventListener('keyup', (e) => {
      if (e.code !== 'Space') return;
      setSpaceDown(false);
    });
    window.addEventListener('blur', () => setSpaceDown(false));
    bed.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      bed.setPointerCapture(id);
      sx = e.clientX;
      sy = e.clientY;
      az0 = state.az;
      el0 = state.el;
      ro0 = state.roll;
      panX0 = state.panX;
      panY0 = state.panY;
      mode = spaceDown ? 'pan' : e.shiftKey ? 'roll' : 'orbit';
      state.dragging = true;
      bed.classList.remove('space-pan');
      bed.classList.add('dragging', `dragging-${mode}`);
    });
    bed.addEventListener('pointermove', (e) => {
      if (!state.dragging) return;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      if (mode === 'pan') {
        state.panX = clamp(
          Math.round((panX0 + (dx * state.pw) / bed.clientWidth) * 10) / 10,
          -2000,
          2000,
        );
        state.panY = clamp(
          Math.round((panY0 + (dy * state.ph) / bed.clientHeight) * 10) / 10,
          -2000,
          2000,
        );
        syncPair('panX', state.panX);
        syncPair('panY', state.panY);
        invalidateRenderState();
        applyViewTransform();
      } else if (mode === 'roll') {
        state.roll = clamp(Math.round(ro0 + dx * 0.5), -180, 180);
        $('rl').value = String(state.roll);
        $('rlN').value = String(state.roll);
      } else {
        let a = az0 - dx * 0.45;
        a = ((((a + 180) % 360) + 360) % 360) - 180;
        state.az = Math.round(a);
        let e = el0 + dy * 0.45;
        e = ((((e + 180) % 360) + 360) % 360) - 180;
        state.el = Math.round(e);
        $('az').value = String(state.az);
        $('azN').value = String(state.az);
        $('el').value = String(state.el);
        $('elN').value = String(state.el);
      }
      if (mode !== 'pan') redraw(true);
    });
    const end = (): void => {
      if (!state.dragging) return;
      state.dragging = false;
      bed.classList.remove('dragging', 'dragging-pan', 'dragging-roll', 'dragging-orbit');
      bed.classList.toggle('space-pan', spaceDown);
      redraw(false);
    };
    bed.addEventListener('pointerup', end);
    bed.addEventListener('pointercancel', end);
    bed.addEventListener('dblclick', (e) => {
      e.preventDefault();
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
      syncPair('zoom', state.zoom);
      syncPair('panX', state.panX);
      syncPair('panY', state.panY);
      applyViewTransform();
      redraw(false);
    });
    bed.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const z = clamp(state.zoom * (e.deltaY > 0 ? 0.94 : 1.06), 0.2, 3);
        state.zoom = Math.round(z * 100) / 100;
        $('zoom').value = String(state.zoom);
        $('zoomN').value = String(state.zoom);
        invalidateRenderState();
        applyViewTransform();
        clearTimeout(wheelEnd);
        wheelEnd = setTimeout(() => redraw(false), 140);
      },
      { passive: false },
    );
  })();

  /* ------------------------------------------------ parameter history */
  const historyPairs: ReadonlyArray<readonly [string, keyof ContourSettings]> = [
    ['az', 'az'],
    ['el', 'el'],
    ['rl', 'roll'],
    ['zoom', 'zoom'],
    ['panX', 'panX'],
    ['panY', 'panY'],
    ['lensFocalLength', 'lensFocalLength'],
    ['lensPerspective', 'lensPerspective'],
    ['lensWarpExponent', 'lensWarpExponent'],
    ['mobiusDirection', 'mobiusDirection'],
    ['mobiusDisplacement', 'mobiusDisplacement'],
    ['mobiusRotation', 'mobiusRotation'],
    ['mobiusStrength', 'mobiusStrength'],
    ['lensDistortion', 'lensDistortion'],
    ['lines', 'lines'],
    ['quality', 'quality'],
    ['easeStrength', 'easeStrength'],
    ['easeCycles', 'easeCycles'],
    ['easeCenter', 'easeCenter'],
    ['cutAz', 'cutAz'],
    ['cutEl', 'cutEl'],
    ['waveCenterX', 'waveCenterX'],
    ['waveCenterY', 'waveCenterY'],
    ['waveCenterZ', 'waveCenterZ'],
    ['cylinderAzimuth', 'cylinderAzimuth'],
    ['cylinderElevation', 'cylinderElevation'],
    ['geodesicSeedAzimuth', 'geodesicSeedAzimuth'],
    ['geodesicSeedElevation', 'geodesicSeedElevation'],
    ['geodesicSeedBAzimuth', 'geodesicSeedBAzimuth'],
    ['geodesicSeedBElevation', 'geodesicSeedBElevation'],
    ['curvatureSmoothing', 'curvatureSmoothing'],
    ['curvatureRange', 'curvatureRange'],
    ['curvatureContrast', 'curvatureContrast'],
    ['divergence', 'divergence'],
    ['sliceLfoAmplitude', 'sliceLfoAmplitude'],
    ['sliceLfoCycles', 'sliceLfoCycles'],
    ['sliceLfoAngle', 'sliceLfoAngle'],
    ['sliceLfoPhase', 'sliceLfoPhase'],
    ['sliceLfoModulationDepth', 'sliceLfoModulationDepth'],
    ['sliceLfoModulationCycles', 'sliceLfoModulationCycles'],
    ['sliceLfoModulationPhase', 'sliceLfoModulationPhase'],
    ['explodeAmount', 'explodeAmount'],
    ['sw', 'sw'],
    ['lineWeightInterval', 'lineWeightInterval'],
    ['lineWeightAmount', 'lineWeightAmount'],
    ['gradientColors', 'gradientColors'],
    ['margin', 'margin'],
    ['maskRoundness', 'maskRoundness'],
    ['maskScaleX', 'maskScaleX'],
    ['maskScaleY', 'maskScaleY'],
    ['maskOffsetX', 'maskOffsetX'],
    ['maskOffsetY', 'maskOffsetY'],
    ['maskLfo1Amplitude', 'maskLfo1Amplitude'],
    ['maskLfo1Cycles', 'maskLfo1Cycles'],
    ['maskLfo1Phase', 'maskLfo1Phase'],
    ['maskLfo1Waveform', 'maskLfo1Waveform'],
    ['maskLfo2Amplitude', 'maskLfo2Amplitude'],
    ['maskLfo2Cycles', 'maskLfo2Cycles'],
    ['maskLfo2Phase', 'maskLfo2Phase'],
    ['maskLfo2Waveform', 'maskLfo2Waveform'],
    ['halftoneSize', 'halftoneSize'],
    ['halftoneContrast', 'halftoneContrast'],
    ['halftoneCycles', 'halftoneCycles'],
    ['chromaAmount', 'chromaAmount'],
    ['humanizerAmount', 'humanizerAmount'],
    ['yarnCutPercent', 'yarnCutPercent'],
    ['yarnCurlSize', 'yarnCurlSize'],
    ['morphSteps', 'morphSteps'],
    ['morphStepsY', 'morphStepsY'],
  ];
  const historySelects: Array<keyof ContourSettings> = [
    'projectionWarpMode',
    'gapEase',
    'axis',
    'geodesicMode',
    'curvatureMethod',
    'sliceLfoWaveform',
    'sliceLfoModulationMode',
    'lineWeightMode',
    'blueprintStyle',
  ];
  const historyChecks: Array<keyof ContourSettings> = [
    'spiral',
    'sliceLfo',
    'sliceLfoModulation',
    'curvatureIncludeZero',
    'hide',
    'sil',
    'bg',
    'clipToArtboard',
    'maskEnabled',
    'maskOutline',
    'gradientEnabled',
    'lineIndexColorEnabled',
    'halftone',
    'chroma',
    'humanizer',
    'yarnCurl',
    'blueprint',
    'topographicMap',
    'morphEnabled',
    'morphSecondEnabled',
  ];
  const parameterHistory: ContourSettings[] = [];
  let parameterHistoryIndex = -1,
    parameterHistoryTimer = 0,
    restoringParameters = false;
  function cloneParameterSnapshot(): ContourSettings {
    return structuredClone(settingsSnapshot());
  }
  function sameParameterSnapshot(a: ContourSettings, b: ContourSettings): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function updateHistoryButtons(): void {
    $('undo').disabled = parameterHistoryIndex <= 0;
    $('redo').disabled =
      parameterHistoryIndex < 0 || parameterHistoryIndex >= parameterHistory.length - 1;
  }
  function commitParameterHistory(): void {
    clearTimeout(parameterHistoryTimer);
    if (restoringParameters) return;
    const snapshot = cloneParameterSnapshot();
    if (
      parameterHistoryIndex >= 0 &&
      sameParameterSnapshot(parameterHistory[parameterHistoryIndex], snapshot)
    )
      return;
    parameterHistory.splice(parameterHistoryIndex + 1);
    parameterHistory.push(snapshot);
    if (parameterHistory.length > 100) parameterHistory.shift();
    parameterHistoryIndex = parameterHistory.length - 1;
    updateHistoryButtons();
  }
  function scheduleParameterHistory(): void {
    if (restoringParameters) return;
    clearTimeout(parameterHistoryTimer);
    parameterHistoryTimer = setTimeout(commitParameterHistory, 180);
  }
  function restoreParameterSnapshot(snapshot: ContourSettings): void {
    restoringParameters = true;
    clearTimeout(parameterHistoryTimer);
    const restored = structuredClone(snapshot);
    restored.lineIndexColorEnabled = restored.lineIndexColorEnabled ?? false;
    restored.lineIndexColors = restored.lineIndexColors?.length
      ? restored.lineIndexColors
      : [{ index: 1, color: '#ef4444', series: 'single', reverse: false }];
    restored.lensFocalLength = Number.isFinite(restored.lensFocalLength)
      ? restored.lensFocalLength
      : 50;
    restored.lensPerspective = Number.isFinite(restored.lensPerspective)
      ? restored.lensPerspective
      : 0;
    restored.lensWarpExponent = Number.isFinite(restored.lensWarpExponent)
      ? restored.lensWarpExponent
      : 0;
    restored.projectionWarpMode = ['none', 'klein-poincare', 'mobius'].includes(
      String(restored.projectionWarpMode),
    )
      ? restored.projectionWarpMode
      : restored.lensWarpExponent !== 0
        ? 'klein-poincare'
        : 'none';
    restored.mobiusDirection = Number.isFinite(restored.mobiusDirection)
      ? restored.mobiusDirection
      : 0;
    restored.mobiusDisplacement = Number.isFinite(restored.mobiusDisplacement)
      ? restored.mobiusDisplacement
      : 0;
    restored.mobiusRotation = Number.isFinite(restored.mobiusRotation)
      ? restored.mobiusRotation
      : 0;
    restored.mobiusStrength = Number.isFinite(restored.mobiusStrength)
      ? restored.mobiusStrength
      : 100;
    restored.waveCenterX = Number.isFinite(restored.waveCenterX) ? restored.waveCenterX : 0;
    restored.waveCenterY = Number.isFinite(restored.waveCenterY) ? restored.waveCenterY : 0;
    restored.waveCenterZ = Number.isFinite(restored.waveCenterZ) ? restored.waveCenterZ : 0;
    restored.cylinderAzimuth = Number.isFinite(restored.cylinderAzimuth)
      ? restored.cylinderAzimuth
      : 0;
    restored.cylinderElevation = Number.isFinite(restored.cylinderElevation)
      ? restored.cylinderElevation
      : 90;
    restored.geodesicSeedAzimuth = Number.isFinite(restored.geodesicSeedAzimuth)
      ? restored.geodesicSeedAzimuth
      : 0;
    restored.geodesicSeedElevation = Number.isFinite(restored.geodesicSeedElevation)
      ? restored.geodesicSeedElevation
      : 90;
    restored.geodesicMode = ['single', 'nearest', 'difference', 'voronoi'].includes(
      String(restored.geodesicMode),
    )
      ? restored.geodesicMode
      : 'single';
    restored.geodesicSeedBAzimuth = Number.isFinite(restored.geodesicSeedBAzimuth)
      ? restored.geodesicSeedBAzimuth
      : 0;
    restored.geodesicSeedBElevation = Number.isFinite(restored.geodesicSeedBElevation)
      ? restored.geodesicSeedBElevation
      : -90;
    restored.curvatureMethod = ['gaussian', 'mean'].includes(String(restored.curvatureMethod))
      ? restored.curvatureMethod
      : 'gaussian';
    restored.curvatureSmoothing = Number.isFinite(restored.curvatureSmoothing)
      ? restored.curvatureSmoothing
      : 2;
    restored.curvatureRange = Number.isFinite(restored.curvatureRange)
      ? restored.curvatureRange
      : 98;
    restored.curvatureContrast = Number.isFinite(restored.curvatureContrast)
      ? restored.curvatureContrast
      : 100;
    restored.curvatureIncludeZero = restored.curvatureIncludeZero !== false;
    restored.explodeAmount = Number.isFinite(restored.explodeAmount) ? restored.explodeAmount : 0;
    if (!Number.isFinite(restored.lensDistortion)) {
      const legacyCurve: Readonly<Record<string, number>> = {
        clean: 0,
        wide: -0.18,
        fisheye: -0.4,
        tele: 0.16,
      };
      restored.lensDistortion = clamp(
        ((legacyCurve[restored.lens || 'clean'] || 0) * (restored.lensAmount ?? 100)) / 0.4,
        -100,
        100,
      );
    }
    Object.assign(state, restored);
    for (const [id, key] of historyPairs) {
      $(id).value = String(dynamicState[key]);
      $(id + 'N').value = String(dynamicState[key]);
    }
    for (const id of historySelects) $(id).value = String(dynamicState[id]);
    for (const id of historyChecks) $(id).checked = Boolean(dynamicState[id]);
    $('color').value = state.color;
    $('colorHex').value = state.color;
    $('swatch').style.background = state.color;
    $('backgroundColor').value = state.backgroundColor;
    $('backgroundColorHex').value = state.backgroundColor;
    $('backgroundSwatch').style.background = state.backgroundColor;
    $('bed').style.background = previewBackground(state);
    $('pw').value = String(state.pw);
    $('ph').value = String(state.ph);
    syncPaperPreset();
    syncSliceFieldControls();
    $('gradientEditor').classList.toggle('enabled', state.gradientEnabled);
    $('lineIndexColorEditor').classList.toggle('enabled', state.lineIndexColorEnabled);
    syncEaseCenter();
    syncProjectionWarpControls();
    syncSliceConstruction();
    syncSliceLfoControls();
    syncLineWeightControls();
    syncMaskControls();
    syncHalftoneControls();
    syncChromaAmount();
    syncHumanizerControls();
    syncYarnCurlControls();
    syncBlueprintControls();
    syncMorphControls();
    const morphTargetsById: Record<string, string | number> = {},
      morphTargets2ById: Record<string, string | number> = {};
    for (const [id, key] of morphKeyById) {
      if (Object.hasOwn(state.morphTargets, key)) morphTargetsById[id] = state.morphTargets[key];
      if (Object.hasOwn(state.morphTargets2, key)) morphTargets2ById[id] = state.morphTargets2[key];
    }
    document.dispatchEvent(
      new CustomEvent('restoreparameters', {
        detail: {
          morphTargetsById,
          morphTargets2ById,
          gradientStops: state.gradientStops,
          lineIndexColors: state.lineIndexColors,
        },
      }),
    );
    redraw(false);
    restoringParameters = false;
    updateHistoryButtons();
  }
  function moveParameterHistory(offset: number): void {
    commitParameterHistory();
    const next = clamp(parameterHistoryIndex + offset, 0, parameterHistory.length - 1);
    if (next === parameterHistoryIndex) return;
    parameterHistoryIndex = next;
    restoreParameterSnapshot(parameterHistory[parameterHistoryIndex]);
    toast(offset < 0 ? 'Parameters undone' : 'Parameters redone');
  }
  $('undo').addEventListener('click', () => moveParameterHistory(-1));
  $('redo').addEventListener('click', () => moveParameterHistory(1));
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const undo = key === 'z' && !event.shiftKey;
    const redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
    if (!undo && !redo) return;
    event.preventDefault();
    moveParameterHistory(undo ? -1 : 1);
  });

  /* ------------------------------------------------------ randomization */
  function randomIn(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
  function randomInt(min: number, max: number): number {
    return Math.floor(randomIn(min, max + 1));
  }
  function randomItem<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }
  function normalizePairValue(id: string, value: number): number {
    const number = $(id + 'N');
    const step = parseFloat(number.step) || 1;
    const precision = (String(number.step).split('.')[1] || '').length;
    return Number((Math.round(value / step) * step).toFixed(precision));
  }
  function setPairValue(id: string, key: string, value: number): number {
    const slider = $(id),
      number = $(id + 'N');
    const next = normalizePairValue(id, value);
    dynamicState[key] = next;
    slider.value = String(next);
    number.value = String(next);
    return next;
  }
  function setCheckbox(id: string, key: string, value: boolean): void {
    dynamicState[key] = value;
    $(id).checked = value;
  }
  const randomLocks = new Set<string>();
  let randomizationScope: Set<string> | null = null;
  const shouldRandomize = (id: string): boolean =>
    !randomLocks.has(id) && (!randomizationScope || randomizationScope.has(id));
  document.addEventListener('randomlockchange', (event) => {
    const { id, locked } = (event as CustomEvent<RandomLockDetail>).detail || {};
    if (!id) return;
    if (locked) randomLocks.add(id);
    else randomLocks.delete(id);
  });
  document.addEventListener('captureparametersnapshot', (event) => {
    const detail = (event as CustomEvent<CaptureParameterSnapshotDetail>).detail;
    if (!detail) return;
    detail.snapshot = {
      parameters: cloneParameterSnapshot(),
      randomLocks: Array.from(randomLocks).sort(),
    };
  });
  document.addEventListener('applyparametersnapshot', (event) => {
    const {
      parameters,
      randomLocks: locks,
      name,
    } = (event as CustomEvent<ApplyParameterSnapshotDetail>).detail || {};
    if (!parameters || !Array.isArray(locks)) return;
    commitParameterHistory();
    restoreParameterSnapshot(parameters);
    const migratedLocks = locks.includes('lens')
      ? [
          ...locks.filter((id) => id !== 'lens'),
          'lensFocalLength',
          'lensPerspective',
          'lensWarpExponent',
          'lensDistortion',
          'projectionWarpMode',
          'mobiusDirection',
          'mobiusDisplacement',
          'mobiusRotation',
          'mobiusStrength',
        ]
      : locks;
    document.dispatchEvent(new CustomEvent('randomlockbulk', { detail: { locks: migratedLocks } }));
    document.dispatchEvent(new CustomEvent('randomlockrestore'));
    commitParameterHistory();
    toast(name ? `Snapshot “${name}” restored` : 'Snapshot restored');
  });
  function randomizePair(id: string, key: string, makeValue: () => number): void {
    if (!shouldRandomize(id)) return;
    setPairValue(id, key, makeValue());
    for (const [dimension, targets] of [
      [1, state.morphTargets],
      [2, state.morphTargets2],
    ] as const) {
      if (!Object.hasOwn(targets, key)) continue;
      const target = normalizePairValue(id, makeValue());
      targets[key] = target;
      document.dispatchEvent(
        new CustomEvent('randomizemorph', { detail: { id, dimension, value: target } }),
      );
    }
  }
  function randomizeColor(id: string, key: string, colors: readonly string[]): void {
    if (!shouldRandomize(id)) return;
    const value = randomItem(colors);
    dynamicState[key] = value;
    $(id).value = value;
    $(id + 'Hex').value = value;
    $(id === 'color' ? 'swatch' : 'backgroundSwatch').style.background = value;
    if (key === 'backgroundColor') $('bed').style.background = value;
    for (const [dimension, targets] of [
      [1, state.morphTargets],
      [2, state.morphTargets2],
    ] as const) {
      if (!Object.hasOwn(targets, key)) continue;
      const target = randomItem(colors);
      targets[key] = target;
      document.dispatchEvent(
        new CustomEvent('randomizemorph', { detail: { id, dimension, value: target } }),
      );
    }
  }
  function randomizeSelect(id: string, key: string, values: readonly string[]): void {
    if (!shouldRandomize(id)) return;
    const value = randomItem(values);
    dynamicState[key] = value;
    $(id).value = value;
  }
  function randomizeCheckbox(id: string, key: string, probability: number): void {
    if (shouldRandomize(id)) setCheckbox(id, key, Math.random() < probability);
  }

  function randomizeParameters(scope?: readonly string[], groupTitle?: string): void {
    randomizationScope = scope ? new Set(scope) : null;
    // Keep the loaded source and physical sheet size stable; randomize the
    // creative choices that shape the contour study.
    randomizePair('az', 'az', () => randomInt(-180, 180));
    randomizePair('el', 'el', () => randomInt(-70, 70));
    randomizePair('rl', 'roll', () => randomInt(-35, 35));
    randomizePair('zoom', 'zoom', () => randomIn(0.72, 1.28));
    randomizePair('panX', 'panX', () => randomIn(-state.pw * 0.15, state.pw * 0.15));
    randomizePair('panY', 'panY', () => randomIn(-state.ph * 0.15, state.ph * 0.15));

    randomizePair('lensFocalLength', 'lensFocalLength', () => randomInt(16, 135));
    randomizePair('lensPerspective', 'lensPerspective', () => randomInt(0, 100));
    randomizeSelect('projectionWarpMode', 'projectionWarpMode', [
      'none',
      'none',
      'klein-poincare',
      'mobius',
    ]);
    randomizePair('lensWarpExponent', 'lensWarpExponent', () => randomInt(0, 100));
    randomizePair('mobiusDirection', 'mobiusDirection', () => randomInt(-180, 180));
    randomizePair('mobiusDisplacement', 'mobiusDisplacement', () => randomInt(10, 82));
    randomizePair('mobiusRotation', 'mobiusRotation', () => randomInt(-180, 180));
    randomizePair('mobiusStrength', 'mobiusStrength', () => randomInt(35, 100));
    randomizePair('lensDistortion', 'lensDistortion', () => randomInt(-70, 55));
    syncProjectionWarpControls();

    randomizePair('lines', 'lines', () => randomInt(22, 84));
    randomizePair('quality', 'quality', () => randomInt(5, 9));
    randomizeSelect('gapEase', 'gapEase', [
      'linear',
      'sine-in',
      'sine-out',
      'sine-in-out',
      'sine-out-in',
      'ease-in',
      'ease-out',
      'ease-in-out',
      'ease-out-in',
      'cubic-in',
      'cubic-out',
      'cubic-in-out',
      'cubic-out-in',
    ]);
    randomizePair('easeStrength', 'easeStrength', () => randomInt(55, 185));
    randomizePair('easeCycles', 'easeCycles', () => randomItem([1, 1, 1, 2, 2, 3]));
    randomizePair('easeCenter', 'easeCenter', () => randomInt(25, 75));
    syncEaseCenter();

    randomizeSelect('axis', 'axis', [
      'up',
      'up',
      'cam',
      'x',
      'y',
      'custom',
      'spherical',
      'cylindrical',
      'geodesic',
      'curvature',
    ]);
    randomizePair('cutAz', 'cutAz', () => randomInt(-180, 180));
    randomizePair('cutEl', 'cutEl', () => randomInt(-80, 80));
    randomizePair('waveCenterX', 'waveCenterX', () => randomInt(-70, 70));
    randomizePair('waveCenterY', 'waveCenterY', () => randomInt(-70, 70));
    randomizePair('waveCenterZ', 'waveCenterZ', () => randomInt(-70, 70));
    randomizePair('cylinderAzimuth', 'cylinderAzimuth', () => randomInt(-180, 180));
    randomizePair('cylinderElevation', 'cylinderElevation', () => randomInt(-80, 80));
    randomizePair('geodesicSeedAzimuth', 'geodesicSeedAzimuth', () => randomInt(-180, 180));
    randomizePair('geodesicSeedElevation', 'geodesicSeedElevation', () => randomInt(-80, 80));
    randomizeSelect('geodesicMode', 'geodesicMode', ['single', 'nearest', 'difference', 'voronoi']);
    randomizePair('geodesicSeedBAzimuth', 'geodesicSeedBAzimuth', () => randomInt(-180, 180));
    randomizePair('geodesicSeedBElevation', 'geodesicSeedBElevation', () => randomInt(-80, 80));
    randomizeSelect('curvatureMethod', 'curvatureMethod', ['gaussian', 'mean']);
    randomizePair('curvatureSmoothing', 'curvatureSmoothing', () => randomInt(0, 8));
    randomizePair('curvatureRange', 'curvatureRange', () => randomInt(90, 100));
    randomizePair('curvatureContrast', 'curvatureContrast', () => randomInt(65, 160));
    randomizeCheckbox('curvatureIncludeZero', 'curvatureIncludeZero', 0.75);
    randomizePair('divergence', 'divergence', () => (Math.random() < 0.6 ? 0 : randomInt(15, 110)));
    randomizePair('sliceLfoAmplitude', 'sliceLfoAmplitude', () => randomInt(35, 180));
    randomizePair('sliceLfoCycles', 'sliceLfoCycles', () => randomIn(0.75, 5));
    randomizePair('sliceLfoAngle', 'sliceLfoAngle', () => randomInt(0, 180));
    randomizePair('sliceLfoPhase', 'sliceLfoPhase', () => randomInt(0, 359));
    randomizePair('sliceLfoModulationDepth', 'sliceLfoModulationDepth', () => randomInt(20, 85));
    randomizePair('sliceLfoModulationCycles', 'sliceLfoModulationCycles', () => randomIn(0.5, 4));
    randomizePair('sliceLfoModulationPhase', 'sliceLfoModulationPhase', () => randomInt(0, 359));
    randomizePair('explodeAmount', 'explodeAmount', () =>
      Math.random() < 0.7 ? 0 : randomInt(20, 160),
    );
    randomizeCheckbox('sliceLfo', 'sliceLfo', 0.28);
    randomizeCheckbox('sliceLfoModulation', 'sliceLfoModulation', 0.45);
    randomizeSelect('sliceLfoWaveform', 'sliceLfoWaveform', ['sine', 'sine', 'triangle']);
    randomizeSelect('sliceLfoModulationMode', 'sliceLfoModulationMode', [
      'amplitude',
      'amplitude',
      'frequency',
    ]);
    $('sliceLfo').checked = state.sliceLfo;
    $('sliceLfoModulation').checked = state.sliceLfoModulation;
    syncSliceFieldControls();
    syncSliceLfoControls();
    syncSliceConstruction();
    randomizeCheckbox('spiral', 'spiral', 0.22);
    if (
      shouldRandomize('spiral') &&
      (nonPlanarSliceField() || state.divergence > 0 || state.sliceLfo)
    ) {
      state.spiral = false;
      $('spiral').checked = false;
    }
    randomizeCheckbox('hide', 'hide', 0.82);
    randomizeCheckbox('sil', 'sil', 0.78);

    randomizePair('sw', 'sw', () => randomIn(0.15, 0.7));
    randomizeSelect('lineWeightMode', 'lineWeightMode', [
      'uniform',
      'uniform',
      'index',
      'wave',
      'center',
    ]);
    randomizePair('lineWeightInterval', 'lineWeightInterval', () => randomInt(3, 10));
    randomizePair('lineWeightAmount', 'lineWeightAmount', () => randomInt(50, 200));
    syncLineWeightControls();
    syncSliceConstruction();
    randomizePair('margin', 'margin', () => randomInt(8, 24));
    randomizeCheckbox('maskEnabled', 'maskEnabled', 0.32);
    randomizeCheckbox('maskOutline', 'maskOutline', 0.45);
    randomizePair('maskRoundness', 'maskRoundness', () => randomInt(0, 100));
    randomizePair('maskScaleX', 'maskScaleX', () => randomInt(55, 100));
    randomizePair('maskScaleY', 'maskScaleY', () => randomInt(55, 100));
    randomizePair('maskOffsetX', 'maskOffsetX', () => randomInt(-35, 35));
    randomizePair('maskOffsetY', 'maskOffsetY', () => randomInt(-35, 35));
    randomizePair('maskLfo1Amplitude', 'maskLfo1Amplitude', () => randomInt(0, 28));
    randomizePair('maskLfo1Cycles', 'maskLfo1Cycles', () => randomIn(1, 8));
    randomizePair('maskLfo1Phase', 'maskLfo1Phase', () => randomInt(0, 359));
    randomizePair('maskLfo1Waveform', 'maskLfo1Waveform', () => randomInt(0, 100));
    randomizePair('maskLfo2Amplitude', 'maskLfo2Amplitude', () => randomInt(0, 22));
    randomizePair('maskLfo2Cycles', 'maskLfo2Cycles', () => randomIn(1, 10));
    randomizePair('maskLfo2Phase', 'maskLfo2Phase', () => randomInt(0, 359));
    randomizePair('maskLfo2Waveform', 'maskLfo2Waveform', () => randomInt(0, 100));
    $('maskEnabled').checked = state.maskEnabled;
    $('maskOutline').checked = state.maskOutline;
    syncMaskControls();
    const colorPair = createColorPair();
    const reverseColors = Math.random() < 0.5;
    const useBlackAndWhite = Math.random() < 0.1;
    const inks = [useBlackAndWhite ? '#000000' : reverseColors ? colorPair.b.hex : colorPair.a.hex];
    const papers = [
      useBlackAndWhite ? '#ffffff' : reverseColors ? colorPair.a.hex : colorPair.b.hex,
    ];
    randomizeColor('color', 'color', inks);
    randomizeColor('backgroundColor', 'backgroundColor', papers);

    const effectChances = {
      gradientEnabled: 0.24,
      halftone: 0.22,
      chroma: 0.18,
      humanizer: 0.3,
      yarnCurl: 0.25,
      blueprint: 0.16,
      topographicMap: 0.18,
    } satisfies Partial<Record<keyof AppState, number>>;
    for (const [id, chance] of Object.entries(effectChances) as Array<
      [keyof typeof effectChances, number]
    >) {
      if (shouldRandomize(id)) state[id] = Math.random() < chance;
    }
    $('gradientEnabled').checked = state.gradientEnabled;
    $('gradientEditor').classList.toggle('enabled', state.gradientEnabled);
    $('lineIndexColorEnabled').checked = state.lineIndexColorEnabled;
    $('lineIndexColorEditor').classList.toggle('enabled', state.lineIndexColorEnabled);
    randomizePair('gradientColors', 'gradientColors', () => randomInt(3, 10));
    if (state.gradientEnabled && shouldRandomize('gradientColors')) {
      state.gradientStops = createColorGradient(state.color, {
        count: randomInt(3, 5),
      });
      document.dispatchEvent(
        new CustomEvent('setgradient', {
          detail: { gradientStops: state.gradientStops },
        }),
      );
    }
    $('halftone').checked = state.halftone;
    randomizePair('halftoneSize', 'halftoneSize', () => randomIn(1.2, 4.8));
    randomizePair('halftoneContrast', 'halftoneContrast', () => randomInt(55, 100));
    randomizePair('halftoneCycles', 'halftoneCycles', () => randomInt(1, 5));
    syncHalftoneControls();
    $('chroma').checked = state.chroma;
    randomizePair('chromaAmount', 'chromaAmount', () => randomIn(0.6, 3.2));
    syncChromaAmount();
    $('humanizer').checked = state.humanizer;
    randomizePair('humanizerAmount', 'humanizerAmount', () => randomInt(18, 58));
    syncHumanizerControls();
    $('yarnCurl').checked = state.yarnCurl;
    randomizePair('yarnCutPercent', 'yarnCutPercent', () => randomInt(5, 300));
    randomizePair('yarnCurlSize', 'yarnCurlSize', () => randomInt(65, 175));
    syncYarnCurlControls();
    $('blueprint').checked = state.blueprint;
    if (shouldRandomize('blueprint')) {
      state.blueprintStyle = randomItem(['blue', 'blue', 'blue', 'black']);
      $('blueprintStyle').value = state.blueprintStyle;
    }
    syncBlueprintControls();
    $('topographicMap').checked = state.topographicMap;

    redraw(false);
    toast(groupTitle ? `${groupTitle} parameters randomized` : 'Parameters randomized');
    randomizationScope = null;
  }
  $('randomize').addEventListener('click', () => randomizeParameters());
  document.addEventListener('randomizegroup', (event) => {
    const { ids, title } = (event as CustomEvent<RandomizeGroupDetail>).detail || {};
    if (!Array.isArray(ids) || ids.length === 0) return;
    randomizeParameters(ids, title);
  });

  /* export */
  function currentGCode(): string {
    return generateGCode(
      state.toolpaths,
      { width: state.pw, height: state.ph },
      {
        name: state.name,
        drawFeed: state.drawFeed,
        travelFeed: state.travelFeed,
        penUp: state.penUp,
        penDown: state.penDown,
        zFeed: state.zFeed,
        machine: state.gcodeProfile === 'uunatek3' ? 'UUNA TEK 3.0 A3' : 'Generic Z-axis plotter',
        origin: state.gcodeProfile === 'uunatek3' ? 'rear-left' : 'bottom-left',
        clipToArtboard: state.clipToArtboard,
        optimizeTravel: state.optimizeTravel,
        mergeTolerance: state.mergeTolerance,
        effects: {
          halftone: state.halftone,
          chroma: state.chroma,
          humanizer: state.humanizer,
          yarnCurl: state.yarnCurl,
          blueprint: state.blueprint,
          topographicMap: state.topographicMap,
        },
      },
    );
  }
  type CurrentExport = { content: string; extension: 'svg' | 'gcode'; type: string };
  function currentExport(): CurrentExport {
    if (state.exportFormat === 'gcode')
      return { content: currentGCode(), extension: 'gcode', type: 'text/x-gcode' };
    return { content: state.svg, extension: 'svg', type: 'image/svg+xml' };
  }
  function updateExportSize(): void {
    if (!state.svg) return;
    const bytes =
      state.exportFormat === 'gcode'
        ? new TextEncoder().encode(currentGCode()).byteLength
        : state.svgBytes;
    $('rSize').textContent = (bytes / 1024).toFixed(1) + ' kB';
  }
  $('save').addEventListener('click', async () => {
    try {
      await waitForCurrentRender();
      const exported = currentExport();
      if (!exported.content) return;
      const base =
        state.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^\w-]+/g, '-')
          .replace(/^-|-$/g, '') || 'contours';
      const blob = new Blob([exported.content], { type: exported.type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = base + '-contours.' + exported.extension;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Saved ' + a.download);
    } catch (error) {
      toast(errorMessage(error));
    }
  });
  $('copy').addEventListener('click', async () => {
    try {
      await waitForCurrentRender();
      const exported = currentExport();
      await navigator.clipboard.writeText(exported.content);
      toast(exported.extension === 'svg' ? 'SVG markup copied' : 'G-code copied');
    } catch (error) {
      if (failedRequestId === requestId) toast(errorMessage(error));
      else toast('Copy blocked — use Export ' + (state.exportFormat === 'svg' ? 'SVG' : 'G-code'));
    }
  });
  let toastT = 0;
  function toast(msg: string): void {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1900);
  }

  /* boot with the demo knot so the tool works before anything is uploaded */
  commitParameterHistory();
  loadDemo('knot', false);
  window.addEventListener('resize', () => redraw(true));
}
