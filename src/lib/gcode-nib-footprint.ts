import type { ContourToolpathGroup } from './contour-engine';

export type BroadNibSpacingAnalysis = {
  nearbyRunPairs: number;
  minimumSampledSpacing: number | null;
};

type Sample = { x: number; y: number; run: number };

/**
 * Conservatively sample final 2D runs at half a nib width and find nearby distinct runs.
 * This is guidance for a physical broad tool, not a collision-proof geometric offset.
 */
export function analyzeBroadNibSpacing(
  groups: readonly ContourToolpathGroup[],
  nibWidth: number,
): BroadNibSpacingAnalysis {
  if (!Number.isFinite(nibWidth) || nibWidth <= 0)
    return { nearbyRunPairs: 0, minimumSampledSpacing: null };
  const step = Math.max(0.05, nibWidth / 2);
  const cells = new Map<string, Sample[]>();
  const nearbyPairs = new Set<string>();
  let minimum = Infinity;
  let runIndex = 0;
  const addSample = (sample: Sample): void => {
    const cellX = Math.floor(sample.x / nibWidth);
    const cellY = Math.floor(sample.y / nibWidth);
    for (let offsetX = -1; offsetX <= 1; offsetX += 1)
      for (let offsetY = -1; offsetY <= 1; offsetY += 1)
        for (const other of cells.get(`${cellX + offsetX}:${cellY + offsetY}`) || []) {
          if (other.run === sample.run) continue;
          const spacing = Math.hypot(sample.x - other.x, sample.y - other.y);
          minimum = Math.min(minimum, spacing);
          if (spacing < nibWidth) {
            const low = Math.min(other.run, sample.run);
            const high = Math.max(other.run, sample.run);
            nearbyPairs.add(`${low}:${high}`);
          }
        }
    const key = `${cellX}:${cellY}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(sample);
    else cells.set(key, [sample]);
  };

  for (const group of groups)
    for (const run of group.runs) {
      for (let index = 0; index + 3 < run.length; index += 2) {
        const x0 = run[index];
        const y0 = run[index + 1];
        const x1 = run[index + 2];
        const y1 = run[index + 3];
        const length = Math.hypot(x1 - x0, y1 - y0);
        const pieces = Math.max(1, Math.ceil(length / step));
        for (let piece = index === 0 ? 0 : 1; piece <= pieces; piece += 1) {
          const t = piece / pieces;
          addSample({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, run: runIndex });
        }
      }
      runIndex += 1;
    }

  return {
    nearbyRunPairs: nearbyPairs.size,
    minimumSampledSpacing: Number.isFinite(minimum) ? minimum : null,
  };
}
