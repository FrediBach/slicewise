import { type ResolvedGlitchBlock } from './block-glitch';

export type ScanBandOrientation = 'horizontal' | 'vertical';

export interface ScanBandGlitchSettings {
  scanBandGlitch: boolean;
  scanBandGlitchCount: number;
  scanBandGlitchThickness: number;
  scanBandGlitchDisplacement: number;
  scanBandGlitchDensity: number;
  scanBandGlitchOrientation: ScanBandOrientation | string;
  scanBandGlitchSeed: number;
}

type Candidate = ResolvedGlitchBlock & { selection: number };

const EPSILON = 1e-8;
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function randomGenerator(seed: number): () => number {
  let state = (Math.round(Number(seed) || 0) ^ 0x85ebca6b) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Resolve regularly spaced, deterministically selected scan bands. */
export function resolveScanBands(
  settings: ScanBandGlitchSettings,
  artboardWidth: number,
  artboardHeight: number,
  margin = 0,
): ResolvedGlitchBlock[] {
  if (!settings.scanBandGlitch || artboardWidth <= 0 || artboardHeight <= 0) return [];
  const safeMargin = clamp(Number(margin) || 0, 0, Math.min(artboardWidth, artboardHeight) / 2);
  const drawableWidth = Math.max(EPSILON, artboardWidth - safeMargin * 2);
  const drawableHeight = Math.max(EPSILON, artboardHeight - safeMargin * 2);
  const count = clamp(Math.round(Number(settings.scanBandGlitchCount) || 0), 2, 64);
  const thickness = clamp((Number(settings.scanBandGlitchThickness) || 0) / 100, 0.05, 1);
  const displacement = clamp(Number(settings.scanBandGlitchDisplacement) || 0, 0, 40);
  const density = clamp((Number(settings.scanBandGlitchDensity) || 0) / 100, 0.01, 1);
  const orientation: ScanBandOrientation =
    settings.scanBandGlitchOrientation === 'vertical' ? 'vertical' : 'horizontal';
  const cellSize = (orientation === 'horizontal' ? drawableHeight : drawableWidth) / count;
  const bandSize = cellSize * thickness;
  const random = randomGenerator(settings.scanBandGlitchSeed);
  const candidates: Candidate[] = [];

  for (let index = 0; index < count; index++) {
    const selection = random();
    const magnitude = displacement * (0.35 + random() * 0.65);
    const signedDisplacement = (random() < 0.5 ? -1 : 1) * magnitude;
    if (orientation === 'horizontal') {
      const top = safeMargin + index * cellSize + (cellSize - bandSize) / 2;
      candidates.push({
        left: safeMargin,
        top,
        right: safeMargin + drawableWidth,
        bottom: top + bandSize,
        dx: signedDisplacement,
        dy: 0,
        selection,
      });
    } else {
      const left = safeMargin + index * cellSize + (cellSize - bandSize) / 2;
      candidates.push({
        left,
        top: safeMargin,
        right: left + bandSize,
        bottom: safeMargin + drawableHeight,
        dx: 0,
        dy: signedDisplacement,
        selection,
      });
    }
  }

  let selected = candidates.filter((candidate) => candidate.selection < density);
  if (!selected.length) {
    let best = candidates[0];
    for (let index = 1; index < candidates.length; index++)
      if (candidates[index].selection < best.selection) best = candidates[index];
    selected = [best];
  }
  return selected.map((candidate) => ({
    left: candidate.left,
    top: candidate.top,
    right: candidate.right,
    bottom: candidate.bottom,
    dx: candidate.dx,
    dy: candidate.dy,
  }));
}
