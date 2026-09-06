import { describe, expect, it } from 'vitest';
import { clearMapLabelGaps, createMapAnnotations } from './mapAnnotations';

const options = {
  width: 120,
  height: 100,
  margin: 5,
  lineCount: 30,
  strokeWidth: 0.3,
  color: '#000000',
  backgroundColor: '#ffffff',
  title: 'terrain',
  map: { mapBuildings: 0, mapLandmarks: 0, mapRoads: 0, mapRivers: 0, mapLakes: 0, mapWoodland: 0 },
};
const runs = [
  [10, 20, 60, 20, 110, 20],
  [20, 45, 50, 45, 80, 45],
  [30, 70, 60, 70, 90, 70],
];

describe('map annotations', () => {
  it('uses scalar levels instead of perimeter and preserves labels when runs are reordered', () => {
    const first = createMapAnnotations(runs, { ...options, levels: [0.8, 0.2, 0.5] });
    const reordered = createMapAnnotations([...runs].reverse(), {
      ...options,
      levels: [0.5, 0.2, 0.8],
    });
    expect(first.altitudes).toEqual([360, 900, 1440]);
    expect(reordered.altitudes).toEqual(first.altitudes);
    expect(first.svg).toBe(createMapAnnotations(runs, { ...options, levels: [0.8, 0.2, 0.5] }).svg);
    expect(first.svg).not.toContain('<text');
    expect(first.runs.flat().every(Number.isFinite)).toBe(true);
  });

  it('omits invented elevations for line art and handles empty or tiny artwork', () => {
    expect(createMapAnnotations(runs, options).altitudes).toEqual([]);
    expect(createMapAnnotations([], options).runs).toEqual([]);
    expect(createMapAnnotations([[0, 0, NaN, 3, 10, 20]], options).runs).toEqual([]);
    expect(createMapAnnotations(runs, { ...options, width: 8, height: 8 }).masks).toEqual([]);
  });

  it('cuts identical pen-up gaps for horizontal and rotated labels', () => {
    const horizontal = clearMapLabelGaps(
      [0, 5, 20, 5],
      [{ x: 8, y: 3, width: 4, height: 4, angle: 0 }],
    );
    expect(horizontal).toHaveLength(2);
    expect(horizontal[0]).toEqual([0, 5, 7.35, 5]);
    expect(horizontal[1][0]).toBeCloseTo(12.65);
    const vertical = clearMapLabelGaps(
      [10, 0, 10, 20],
      [{ x: 12, y: 8, width: 4, height: 4, angle: Math.PI / 2 }],
    );
    expect(vertical).toHaveLength(2);
    expect(vertical[0][3]).toBeCloseTo(7.35);
    expect(vertical[1][1]).toBeCloseTo(12.65);
  });

  it('keeps labels inside the artboard and prevents overlapping padded boxes', () => {
    const map = createMapAnnotations(runs, { ...options, levels: [0.8, 0.2, 0.5] });
    for (const mask of map.masks) {
      expect(mask.angle).toBe(0);
      expect(mask.x).toBeGreaterThan(5);
      expect(mask.x + mask.width).toBeLessThan(115);
      expect(mask.y).toBeGreaterThan(5);
      expect(mask.y + mask.height).toBeLessThan(95);
      for (const other of map.masks)
        if (other !== mask)
          expect(
            mask.x < other.x + other.width &&
              mask.x + mask.width > other.x &&
              mask.y < other.y + other.height &&
              mask.y + mask.height > other.y,
          ).toBe(false);
    }
  });
});

it('subtracts overlapping corridors as a union and retains untouched runs', () => {
  const masks = [
    { x: 4, y: 2, width: 6, height: 6, angle: 0, padding: 0 },
    { x: 8, y: 2, width: 6, height: 6, angle: 0, padding: 0 },
  ];
  expect(clearMapLabelGaps([0, 5, 8, 5, 20, 5], masks)).toEqual([
    [0, 5, 4, 5],
    [14, 5, 20, 5],
  ]);
  expect(clearMapLabelGaps([0, 0, 20, 0], masks)).toEqual([[0, 0, 20, 0]]);
  expect(clearMapLabelGaps([5, 5, 7, 5], masks)).toEqual([]);
});
