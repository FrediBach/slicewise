export type RenderDisposition = 'commit' | 'preview' | 'discard';

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
  quick: boolean;
  allowStaleQuickPreview?: boolean;
};

/**
 * Exact results must always be current. During a direct manipulation gesture,
 * an older same-mesh quick result may provide transient feedback while the
 * latest request remains queued; it never replaces exact export state.
 */
export function renderDisposition({
  responseId,
  latestRequestId,
  sameMesh,
  quick,
  allowStaleQuickPreview = false,
}: RenderDispositionInput): RenderDisposition {
  if (!sameMesh || responseId > latestRequestId) return 'discard';
  if (responseId !== latestRequestId)
    return quick && allowStaleQuickPreview ? 'preview' : 'discard';
  if (quick) return 'preview';
  return 'commit';
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
