export type PaperOrientation = 'portrait' | 'landscape';

/** Normalize any width/height pair into the requested visual orientation. */
export function orientPaperSize(
  size: readonly [number, number],
  orientation: PaperOrientation,
): readonly [number, number] {
  const shortEdge = Math.min(size[0], size[1]);
  const longEdge = Math.max(size[0], size[1]);
  return orientation === 'landscape' ? [longEdge, shortEdge] : [shortEdge, longEdge];
}

export function paperOrientationForSize(
  width: number,
  height: number,
  squareFallback: PaperOrientation = 'portrait',
): PaperOrientation {
  return width === height ? squareFallback : width > height ? 'landscape' : 'portrait';
}
