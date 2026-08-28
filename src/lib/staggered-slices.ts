import { type ResolvedGlitchBlock } from './block-glitch';

export type StaggeredSliceOrientation = 'horizontal' | 'vertical';
export type StaggeredSlicePattern = 'ramp' | 'alternating' | 'seeded';

export interface StaggeredSliceSettings {
  staggeredSlices: boolean;
  staggeredSlicesCount: number;
  staggeredSlicesExtent: number;
  staggeredSlicesDisplacement: number;
  staggeredSlicesOrientation: StaggeredSliceOrientation | string;
  staggeredSlicesPattern: StaggeredSlicePattern | string;
  staggeredSlicesSeed: number;
}

const EPSILON = 1e-8;
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function randomGenerator(seed: number): () => number {
  let state = (Math.round(Number(seed) || 0) ^ 0xc2b2ae35) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Resolve contiguous strips inside a centered region with a structured displacement pattern. */
export function resolveStaggeredSlices(
  settings: StaggeredSliceSettings,
  artboardWidth: number,
  artboardHeight: number,
  margin = 0,
): ResolvedGlitchBlock[] {
  if (!settings.staggeredSlices || artboardWidth <= 0 || artboardHeight <= 0) return [];
  const safeMargin = clamp(Number(margin) || 0, 0, Math.min(artboardWidth, artboardHeight) / 2);
  const drawableWidth = Math.max(EPSILON, artboardWidth - safeMargin * 2);
  const drawableHeight = Math.max(EPSILON, artboardHeight - safeMargin * 2);
  const count = clamp(Math.round(Number(settings.staggeredSlicesCount) || 0), 2, 48);
  const extent = clamp((Number(settings.staggeredSlicesExtent) || 0) / 100, 0.1, 1);
  const displacement = clamp(Number(settings.staggeredSlicesDisplacement) || 0, 0, 60);
  const orientation: StaggeredSliceOrientation =
    settings.staggeredSlicesOrientation === 'vertical' ? 'vertical' : 'horizontal';
  const pattern: StaggeredSlicePattern = ['ramp', 'alternating', 'seeded'].includes(
    settings.staggeredSlicesPattern,
  )
    ? (settings.staggeredSlicesPattern as StaggeredSlicePattern)
    : 'ramp';
  const regionSize = (orientation === 'horizontal' ? drawableHeight : drawableWidth) * extent;
  const regionStart =
    safeMargin + ((orientation === 'horizontal' ? drawableHeight : drawableWidth) - regionSize) / 2;
  const stripSize = regionSize / count;
  const random = randomGenerator(settings.staggeredSlicesSeed);
  const slices: ResolvedGlitchBlock[] = [];

  for (let index = 0; index < count; index++) {
    let offset: number;
    if (pattern === 'ramp') offset = displacement * ((index / (count - 1)) * 2 - 1);
    else if (pattern === 'alternating') offset = displacement * (index % 2 ? 1 : -1);
    else offset = displacement * (0.35 + random() * 0.65) * (random() < 0.5 ? -1 : 1);

    if (orientation === 'horizontal') {
      const top = regionStart + index * stripSize;
      slices.push({
        left: safeMargin,
        top,
        right: safeMargin + drawableWidth,
        bottom: top + stripSize,
        dx: offset,
        dy: 0,
      });
    } else {
      const left = regionStart + index * stripSize;
      slices.push({
        left,
        top: safeMargin,
        right: left + stripSize,
        bottom: safeMargin + drawableHeight,
        dx: 0,
        dy: offset,
      });
    }
  }
  return slices;
}
