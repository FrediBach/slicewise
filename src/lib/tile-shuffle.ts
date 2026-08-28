import {
  clipRunToGlitchRectangle,
  translateGlitchRun,
  type ResolvedGlitchBlock,
} from './block-glitch';

export interface TileShuffleSettings {
  tileShuffle: boolean;
  tileShuffleRows: number;
  tileShuffleColumns: number;
  tileShuffleExtent: number;
  tileShuffleAffected: number;
  tileShuffleSeed: number;
}

const EPSILON = 1e-8;
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function randomGenerator(seed: number): () => number {
  let state = (Math.round(Number(seed) || 0) ^ 0x27d4eb2f) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Resolve a deterministic one-cycle permutation of selected equal-size grid cells. */
export function resolveTileShuffle(
  settings: TileShuffleSettings,
  artboardWidth: number,
  artboardHeight: number,
  margin = 0,
): ResolvedGlitchBlock[] {
  if (!settings.tileShuffle || artboardWidth <= 0 || artboardHeight <= 0) return [];
  const safeMargin = clamp(Number(margin) || 0, 0, Math.min(artboardWidth, artboardHeight) / 2);
  const drawableWidth = Math.max(EPSILON, artboardWidth - safeMargin * 2);
  const drawableHeight = Math.max(EPSILON, artboardHeight - safeMargin * 2);
  const rows = clamp(Math.round(Number(settings.tileShuffleRows) || 0), 2, 8);
  const columns = clamp(Math.round(Number(settings.tileShuffleColumns) || 0), 2, 8);
  const extent = clamp((Number(settings.tileShuffleExtent) || 0) / 100, 0.1, 1);
  const affected = clamp((Number(settings.tileShuffleAffected) || 0) / 100, 0.05, 1);
  const regionWidth = drawableWidth * extent;
  const regionHeight = drawableHeight * extent;
  const regionLeft = safeMargin + (drawableWidth - regionWidth) / 2;
  const regionTop = safeMargin + (drawableHeight - regionHeight) / 2;
  const tileWidth = regionWidth / columns;
  const tileHeight = regionHeight / rows;
  const tileCount = rows * columns;
  const selectedCount = clamp(Math.round(tileCount * affected), 2, tileCount);
  const random = randomGenerator(settings.tileShuffleSeed);
  const selected = Array.from({ length: tileCount }, (_, index) => ({
    index,
    selection: random(),
  }))
    .sort((left, right) => left.selection - right.selection || left.index - right.index)
    .slice(0, selectedCount)
    .map(({ index }) => index);

  for (let index = selected.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [selected[index], selected[target]] = [selected[target], selected[index]];
  }

  const blocks: ResolvedGlitchBlock[] = [];
  for (let index = 0; index < selected.length; index++) {
    const sourceIndex = selected[index];
    const targetIndex = selected[(index + 1) % selected.length];
    const sourceColumn = sourceIndex % columns;
    const sourceRow = Math.floor(sourceIndex / columns);
    const targetColumn = targetIndex % columns;
    const targetRow = Math.floor(targetIndex / columns);
    const left = regionLeft + sourceColumn * tileWidth;
    const top = regionTop + sourceRow * tileHeight;
    blocks.push({
      left,
      top,
      right: left + tileWidth,
      bottom: top + tileHeight,
      dx: (targetColumn - sourceColumn) * tileWidth,
      dy: (targetRow - sourceRow) * tileHeight,
    });
  }
  return blocks;
}

/** Move each selected tile's immutable source contents into its permuted destination cell. */
export function applyTileShuffle(
  runs: readonly number[][],
  tiles: readonly ResolvedGlitchBlock[],
): number[][] {
  if (!tiles.length) return runs.map((run) => run.slice());
  let baseRuns = runs.map((run) => run.slice());
  const shuffledRuns: number[][] = [];
  for (const tile of tiles) {
    shuffledRuns.push(
      ...baseRuns.flatMap((run) =>
        clipRunToGlitchRectangle(run, tile, true).map((fragment) =>
          translateGlitchRun(fragment, tile.dx, tile.dy),
        ),
      ),
    );
    baseRuns = baseRuns.flatMap((run) => clipRunToGlitchRectangle(run, tile, false));
  }
  return [...baseRuns, ...shuffledRuns];
}
