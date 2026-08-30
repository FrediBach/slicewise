import { type ContourSettings } from './contour-engine';

export type RenderDisposition = 'commit' | 'preview' | 'capture' | 'discard';
export type RenderQuality = 'quick' | 'exact';
export type RenderHistoryPolicy = 'record' | 'ignore';
export type RenderPurpose = 'config' | 'animation-preview' | 'animation-export';

export type RenderRequestOptions = {
  settings: ContourSettings;
  quality: RenderQuality;
  history: RenderHistoryPolicy;
  purpose: RenderPurpose;
};

export type PreviewView = { zoom: number; panX: number; panY: number };

type PreviewBusyInput = {
  renderInFlight: boolean;
  renderQueued: boolean;
  generationInFlight: boolean;
  generationQueued: boolean;
};

type RenderDispositionInput = {
  responseId: number;
  latestRequestId: number;
  sameMesh: boolean;
  quality: RenderQuality;
  responsePurpose: RenderPurpose;
  latestPurpose: RenderPurpose;
  allowStaleQuickPreview?: boolean;
};

/** Detaches caller-owned settings and enforces purpose-specific invariants. */
export function createExplicitRenderSnapshot(
  options: RenderRequestOptions,
  quickPreviewDetail?: number,
): RenderRequestOptions {
  const snapshot = globalThis.structuredClone(options.settings);
  const quality = options.purpose === 'animation-export' ? 'exact' : options.quality;
  const history = options.purpose === 'config' ? options.history : 'ignore';
  if (options.purpose !== 'config') {
    snapshot.morphEnabled = false;
    snapshot.morphSecondEnabled = false;
    snapshot.morphTargets = {};
    snapshot.morphTargets2 = {};
  }
  if (quality === 'quick' && quickPreviewDetail !== undefined)
    snapshot.previewDetail = quickPreviewDetail;
  return { ...options, quality, history, settings: snapshot };
}

/** A queued exact render only upgrades later quick work for the same purpose. */
export function coalesceRenderQuality(
  incoming: RenderQuality,
  purpose: RenderPurpose,
  queued?: Pick<RenderRequestOptions, 'quality' | 'purpose'> | null,
): RenderQuality {
  return incoming === 'quick' && queued?.quality === 'exact' && queued.purpose === purpose
    ? 'exact'
    : incoming;
}

export function isConfigExportCurrent(
  committedConfigRequestId: number,
  latestConfigRequestId: number,
): boolean {
  return committedConfigRequestId > 0 && committedConfigRequestId === latestConfigRequestId;
}

/**
 * Exact results must always be current. During a direct manipulation gesture,
 * an older same-mesh quick result may provide transient feedback while the
 * latest request remains queued; it never replaces exact export state.
 */
export function renderDisposition({
  responseId,
  latestRequestId,
  sameMesh,
  quality,
  responsePurpose,
  latestPurpose,
  allowStaleQuickPreview = false,
}: RenderDispositionInput): RenderDisposition {
  const quick = quality === 'quick';
  if (!sameMesh || responseId > latestRequestId || responsePurpose !== latestPurpose)
    return 'discard';
  if (responseId !== latestRequestId)
    return quick && allowStaleQuickPreview && responsePurpose === 'config' ? 'preview' : 'discard';
  if (responsePurpose === 'animation-export') return quick ? 'discard' : 'capture';
  if (quick) return 'preview';
  return responsePurpose === 'config' ? 'commit' : 'preview';
}

export function isPreviewBusy({
  renderInFlight,
  renderQueued,
  generationInFlight,
  generationQueued,
}: PreviewBusyInput): boolean {
  return renderInFlight || renderQueued || generationInFlight || generationQueued;
}

export function previewViewTransform(
  rendered: PreviewView,
  current: PreviewView,
  width: number,
  height: number,
): [number, number, number] {
  const scale = current.zoom / rendered.zoom;
  const baseX = width / 2 + rendered.panX;
  const baseY = height / 2 + rendered.panY;
  const nextX = width / 2 + current.panX;
  const nextY = height / 2 + current.panY;
  return [scale, nextX - scale * baseX, nextY - scale * baseY];
}
