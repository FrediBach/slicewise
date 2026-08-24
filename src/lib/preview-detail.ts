export const PREVIEW_DETAIL_LEVELS = [0.5, 0.67, 0.83, 1] as const;

export type PreviewPerformance = {
  levelIndex: number;
  averageMs: number;
  samplesAtLevel: number;
};

export const initialPreviewPerformance = (): PreviewPerformance => ({
  levelIndex: 1,
  averageMs: 0,
  samplesAtLevel: 0,
});

export const previewDetail = (performance: PreviewPerformance): number =>
  PREVIEW_DETAIL_LEVELS[performance.levelIndex];

export function observePreviewPerformance(
  current: PreviewPerformance,
  renderMs: number,
): PreviewPerformance {
  if (!Number.isFinite(renderMs) || renderMs <= 0) return current;
  const averageMs = current.averageMs ? current.averageMs * 0.65 + renderMs * 0.35 : renderMs;
  const samplesAtLevel = current.samplesAtLevel + 1;
  if (samplesAtLevel < 4) return { ...current, averageMs, samplesAtLevel };

  let levelIndex = current.levelIndex;
  if (averageMs <= 38 && levelIndex < PREVIEW_DETAIL_LEVELS.length - 1) levelIndex++;
  else if (averageMs >= 65 && levelIndex > 0) levelIndex--;
  if (levelIndex === current.levelIndex) return { ...current, averageMs, samplesAtLevel };
  return { levelIndex, averageMs: renderMs, samplesAtLevel: 0 };
}

const normalizedDetail = (detail: number | undefined): number =>
  Math.min(1, Math.max(PREVIEW_DETAIL_LEVELS[0], detail ?? PREVIEW_DETAIL_LEVELS[1]));

export function previewLineCount(lines: number, detail?: number): number {
  return Math.min(lines, Math.max(12, Math.round(lines * normalizedDetail(detail))));
}

export function previewCurveQuality(quality: number, detail?: number): number {
  return Math.min(quality, Math.max(3, Math.round(quality * normalizedDetail(detail))));
}

export function previewMorphSteps(steps: number, detail?: number): number {
  const limit = Math.round(1 + normalizedDetail(detail) * 4);
  return Math.min(steps, Math.max(2, limit));
}
