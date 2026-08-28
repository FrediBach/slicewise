import {
  clipRunToGlitchRectangle,
  translateGlitchRun,
  type ResolvedGlitchBlock,
} from './block-glitch';

export type WraparoundTearOrientation = 'horizontal' | 'vertical';

export interface WraparoundTearSettings {
  wraparoundTear: boolean;
  wraparoundTearOrientation: WraparoundTearOrientation | string;
  wraparoundTearPosition: number;
  wraparoundTearSize: number;
  wraparoundTearShift: number;
}

export interface ResolvedWraparoundTear {
  band: ResolvedGlitchBlock;
  period: number;
}

const EPSILON = 1e-8;
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** Resolve one full-width or full-height tear band inside the drawable artboard. */
export function resolveWraparoundTear(
  settings: WraparoundTearSettings,
  artboardWidth: number,
  artboardHeight: number,
  margin = 0,
): ResolvedWraparoundTear | null {
  if (!settings.wraparoundTear || artboardWidth <= 0 || artboardHeight <= 0) return null;
  const safeMargin = clamp(Number(margin) || 0, 0, Math.min(artboardWidth, artboardHeight) / 2);
  const drawableWidth = Math.max(EPSILON, artboardWidth - safeMargin * 2);
  const drawableHeight = Math.max(EPSILON, artboardHeight - safeMargin * 2);
  const orientation: WraparoundTearOrientation =
    settings.wraparoundTearOrientation === 'vertical' ? 'vertical' : 'horizontal';
  const position = clamp((Number(settings.wraparoundTearPosition) || 0) / 100, 0, 1);
  const size = clamp((Number(settings.wraparoundTearSize) || 0) / 100, 0.01, 1);
  const requestedShift = clamp(Number(settings.wraparoundTearShift) || 0, -200, 200);

  if (orientation === 'horizontal') {
    const bandHeight = drawableHeight * size;
    const top = safeMargin + (drawableHeight - bandHeight) * position;
    const normalizedShift = requestedShift % drawableWidth;
    return {
      band: {
        left: safeMargin,
        top,
        right: safeMargin + drawableWidth,
        bottom: top + bandHeight,
        dx: normalizedShift,
        dy: 0,
      },
      period: drawableWidth,
    };
  }

  const bandWidth = drawableWidth * size;
  const left = safeMargin + (drawableWidth - bandWidth) * position;
  const normalizedShift = requestedShift % drawableHeight;
  return {
    band: {
      left,
      top: safeMargin,
      right: left + bandWidth,
      bottom: safeMargin + drawableHeight,
      dx: 0,
      dy: normalizedShift,
    },
    period: drawableHeight,
  };
}

/** Shift the selected band and wrap overflow to its opposite drawable edge. */
export function applyWraparoundTear(
  runs: readonly number[][],
  tear: ResolvedWraparoundTear | null,
): number[][] {
  if (!tear) return runs.map((run) => run.slice());
  const { band, period } = tear;
  if (Math.abs(band.dx) <= EPSILON && Math.abs(band.dy) <= EPSILON)
    return runs.map((run) => run.slice());
  const baseRuns = runs.flatMap((run) => clipRunToGlitchRectangle(run, band, false));
  const shift = band.dx || band.dy;
  const wrappedOffset = shift > 0 ? -period : shift < 0 ? period : 0;
  const displacedRuns = runs.flatMap((run) =>
    clipRunToGlitchRectangle(run, band, true).flatMap((fragment) => {
      const translated = translateGlitchRun(fragment, band.dx, band.dy);
      const candidates = [translated];
      if (wrappedOffset)
        candidates.push(
          translateGlitchRun(translated, band.dx ? wrappedOffset : 0, band.dy ? wrappedOffset : 0),
        );
      return candidates.flatMap((candidate) => clipRunToGlitchRectangle(candidate, band, true));
    }),
  );
  return [...baseRuns, ...displacedRuns];
}
