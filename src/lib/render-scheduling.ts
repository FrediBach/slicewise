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
};

/**
 * Only the latest request may update the preview. Quick results stay out of
 * exact export state, but stale quick frames are discarded so an older design
 * cannot flash between the current preview and its final render.
 */
export function renderDisposition({
  responseId,
  latestRequestId,
  sameMesh,
  quick,
}: RenderDispositionInput): RenderDisposition {
  if (!sameMesh || responseId !== latestRequestId) return 'discard';
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
