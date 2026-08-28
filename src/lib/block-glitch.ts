export type GlitchDirection = 'horizontal' | 'vertical' | 'both';

export interface BlockGlitchSettings {
  blockGlitch: boolean;
  blockGlitchCount: number;
  blockGlitchWidth: number;
  blockGlitchHeight: number;
  blockGlitchDisplacement: number;
  blockGlitchDirection: GlitchDirection | string;
  blockGlitchClearDestination: boolean;
  blockGlitchSeed: number;
}

export interface ResolvedGlitchBlock {
  left: number;
  top: number;
  right: number;
  bottom: number;
  dx: number;
  dy: number;
}

type Point = [x: number, y: number];
type Rectangle = Pick<ResolvedGlitchBlock, 'left' | 'top' | 'right' | 'bottom'>;

const EPSILON = 1e-8;
const MIN_FRAGMENT_LENGTH = 0.05;
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
const samePoint = (left: Point, right: Point): boolean =>
  Math.hypot(left[0] - right[0], left[1] - right[1]) <= EPSILON;

function randomGenerator(seed: number): () => number {
  let state = (Math.round(Number(seed) || 0) ^ 0x9e3779b9) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Resolve stable, artboard-relative processing regions from user settings. */
export function resolveGlitchBlocks(
  settings: BlockGlitchSettings,
  artboardWidth: number,
  artboardHeight: number,
  margin = 0,
): ResolvedGlitchBlock[] {
  if (!settings.blockGlitch || artboardWidth <= 0 || artboardHeight <= 0) return [];
  const safeMargin = clamp(Number(margin) || 0, 0, Math.min(artboardWidth, artboardHeight) / 2);
  const drawableWidth = Math.max(EPSILON, artboardWidth - safeMargin * 2);
  const drawableHeight = Math.max(EPSILON, artboardHeight - safeMargin * 2);
  const width = clamp((Number(settings.blockGlitchWidth) || 0) / 100, 0.02, 0.6) * drawableWidth;
  const height = clamp((Number(settings.blockGlitchHeight) || 0) / 100, 0.01, 0.4) * drawableHeight;
  const count = clamp(Math.round(Number(settings.blockGlitchCount) || 0), 1, 24);
  const displacement = clamp(Number(settings.blockGlitchDisplacement) || 0, 0, 60);
  const direction: GlitchDirection = ['horizontal', 'vertical', 'both'].includes(
    settings.blockGlitchDirection,
  )
    ? (settings.blockGlitchDirection as GlitchDirection)
    : 'horizontal';
  const random = randomGenerator(settings.blockGlitchSeed);
  const blocks: ResolvedGlitchBlock[] = [];

  for (let index = 0; index < count; index++) {
    const left = safeMargin + random() * Math.max(0, drawableWidth - width);
    const top = safeMargin + random() * Math.max(0, drawableHeight - height);
    const magnitude = displacement * (0.35 + random() * 0.65);
    let dx = 0;
    let dy = 0;
    if (direction === 'horizontal') dx = (random() < 0.5 ? -1 : 1) * magnitude;
    else if (direction === 'vertical') dy = (random() < 0.5 ? -1 : 1) * magnitude;
    else {
      const angle = random() * Math.PI * 2;
      dx = Math.cos(angle) * magnitude;
      dy = Math.sin(angle) * magnitude;
    }
    blocks.push({ left, top, right: left + width, bottom: top + height, dx, dy });
  }
  return blocks;
}

function segmentBreaks(a: Point, b: Point, rectangle: Rectangle): number[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const values = [0, 1];
  if (Math.abs(dx) > EPSILON) {
    values.push((rectangle.left - a[0]) / dx, (rectangle.right - a[0]) / dx);
  }
  if (Math.abs(dy) > EPSILON) {
    values.push((rectangle.top - a[1]) / dy, (rectangle.bottom - a[1]) / dy);
  }
  const normalized: number[] = [];
  for (const value of values)
    if (value >= -EPSILON && value <= 1 + EPSILON) normalized.push(clamp(value, 0, 1));
  normalized.sort((left, right) => left - right);
  const unique: number[] = [];
  for (const value of normalized)
    if (!unique.length || Math.abs(value - unique[unique.length - 1]) > EPSILON) unique.push(value);
  return unique;
}

function pointAt(a: Point, b: Point, position: number): Point {
  return [a[0] + (b[0] - a[0]) * position, a[1] + (b[1] - a[1]) * position];
}

function inside(point: Point, rectangle: Rectangle): boolean {
  return (
    point[0] >= rectangle.left - EPSILON &&
    point[0] <= rectangle.right + EPSILON &&
    point[1] >= rectangle.top - EPSILON &&
    point[1] <= rectangle.bottom + EPSILON
  );
}

function runLength(run: readonly number[]): number {
  let length = 0;
  for (let index = 2; index + 1 < run.length; index += 2)
    length += Math.hypot(run[index] - run[index - 2], run[index + 1] - run[index - 1]);
  return length;
}

function clipRun(run: readonly number[], rectangle: Rectangle, keepInside: boolean): number[][] {
  const result: number[][] = [];
  let current: number[] | null = null;
  const flush = (): void => {
    if (current && current.length >= 4 && runLength(current) >= MIN_FRAGMENT_LENGTH)
      result.push(current);
    current = null;
  };
  for (let index = 0; index + 3 < run.length; index += 2) {
    const a: Point = [run[index], run[index + 1]];
    const b: Point = [run[index + 2], run[index + 3]];
    const breaks = segmentBreaks(a, b, rectangle);
    for (let part = 0; part + 1 < breaks.length; part++) {
      const start = pointAt(a, b, breaks[part]);
      const end = pointAt(a, b, breaks[part + 1]);
      if (samePoint(start, end)) continue;
      if (inside(pointAt(start, end, 0.5), rectangle) !== keepInside) {
        flush();
        continue;
      }
      const last: Point | null = current ? [current.at(-2)!, current.at(-1)!] : null;
      if (!last || !samePoint(last, start)) {
        flush();
        current = [...start, ...end];
      } else current.push(...end);
    }
  }
  flush();
  return result;
}

function translateRun(run: readonly number[], dx: number, dy: number): number[] {
  const translated: number[] = [];
  for (let index = 0; index + 1 < run.length; index += 2)
    translated.push(run[index] + dx, run[index + 1] + dy);
  return translated;
}

/** Cut source blocks from the base artwork and add translated copies of their original contents. */
export function applyBlockGlitch(
  runs: readonly number[][],
  blocks: readonly ResolvedGlitchBlock[],
  clearDestination = false,
): number[][] {
  if (!blocks.length) return runs.map((run) => run.slice());
  let baseRuns = runs.map((run) => run.slice());
  for (const block of blocks) baseRuns = baseRuns.flatMap((run) => clipRun(run, block, false));
  if (clearDestination) {
    for (const block of blocks) {
      const destination = {
        left: block.left + block.dx,
        top: block.top + block.dy,
        right: block.right + block.dx,
        bottom: block.bottom + block.dy,
      };
      baseRuns = baseRuns.flatMap((run) => clipRun(run, destination, false));
    }
  }
  const displacedRuns = blocks.flatMap((block) =>
    runs.flatMap((run) =>
      clipRun(run, block, true).map((fragment) => translateRun(fragment, block.dx, block.dy)),
    ),
  );
  return [...baseRuns, ...displacedRuns];
}

/** Optimized cut-and-move path for adjacent slices whose union is one rectangle. */
export function applyContiguousSliceGlitch(
  runs: readonly number[][],
  slices: readonly ResolvedGlitchBlock[],
): number[][] {
  if (!slices.length) return runs.map((run) => run.slice());
  const region = { ...slices[0] };
  for (let index = 1; index < slices.length; index++) {
    region.left = Math.min(region.left, slices[index].left);
    region.top = Math.min(region.top, slices[index].top);
    region.right = Math.max(region.right, slices[index].right);
    region.bottom = Math.max(region.bottom, slices[index].bottom);
  }
  const baseRuns = runs.flatMap((run) => clipRun(run, region, false));
  const displacedRuns = slices.flatMap((slice) =>
    runs.flatMap((run) =>
      clipRun(run, slice, true).map((fragment) => translateRun(fragment, slice.dx, slice.dy)),
    ),
  );
  return [...baseRuns, ...displacedRuns];
}
