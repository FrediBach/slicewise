import { describe, expect, it } from 'vitest';
import { applyTileShuffle, resolveTileShuffle, type TileShuffleSettings } from './tile-shuffle';

const settings: TileShuffleSettings = {
  tileShuffle: true,
  tileShuffleRows: 3,
  tileShuffleColumns: 4,
  tileShuffleExtent: 60,
  tileShuffleAffected: 50,
  tileShuffleSeed: 4,
};

describe('tile shuffle', () => {
  it('resolves a deterministic subset of equal-size cells in a centered region', () => {
    const first = resolveTileShuffle(settings, 120, 100, 10);
    const second = resolveTileShuffle(settings, 120, 100, 10);

    expect(first).toEqual(second);
    expect(first).toHaveLength(6);
    for (const tile of first) {
      expect(tile.left).toBeGreaterThanOrEqual(30);
      expect(tile.right).toBeLessThanOrEqual(90);
      expect(tile.top).toBeGreaterThanOrEqual(26);
      expect(tile.bottom).toBeLessThanOrEqual(74);
      expect(tile.right - tile.left).toBeCloseTo(15);
      expect(tile.bottom - tile.top).toBeCloseTo(16);
      expect(Math.abs(tile.dx) + Math.abs(tile.dy)).toBeGreaterThan(0);
    }
  });

  it('maps every selected source to one unique selected destination', () => {
    const tiles = resolveTileShuffle({ ...settings, tileShuffleAffected: 100 }, 120, 100, 10);
    const sources = new Set(tiles.map((tile) => `${tile.left},${tile.top}`));
    const destinations = new Set(
      tiles.map((tile) => `${tile.left + tile.dx},${tile.top + tile.dy}`),
    );

    expect(tiles).toHaveLength(12);
    expect(destinations).toEqual(sources);
  });

  it('moves immutable tile contents into their permuted cells', () => {
    const tiles = [
      { left: 0, top: 0, right: 10, bottom: 10, dx: 10, dy: 0 },
      { left: 10, top: 0, right: 20, bottom: 10, dx: -10, dy: 0 },
    ];

    expect(
      applyTileShuffle(
        [
          [2, 5, 6, 5],
          [12, 5, 18, 5],
        ],
        tiles,
      ),
    ).toEqual([
      [12, 5, 16, 5],
      [2, 5, 8, 5],
    ]);
  });

  it('assigns geometry on a shared cell boundary only once', () => {
    const tiles = [
      { left: 0, top: 0, right: 10, bottom: 10, dx: 10, dy: 0 },
      { left: 10, top: 0, right: 20, bottom: 10, dx: -10, dy: 0 },
    ];

    expect(applyTileShuffle([[10, 2, 10, 8]], tiles)).toEqual([[20, 2, 20, 8]]);
  });

  it('selects at least two cells and caps dense grids', () => {
    expect(
      resolveTileShuffle(
        { ...settings, tileShuffleRows: 99, tileShuffleColumns: 99, tileShuffleAffected: 0 },
        100,
        100,
      ),
    ).toHaveLength(3);
  });

  it('is a cloning no-op when disabled', () => {
    const source = [[0, 0, 10, 10]];
    const result = applyTileShuffle(source, []);

    expect(resolveTileShuffle({ ...settings, tileShuffle: false }, 100, 100)).toEqual([]);
    expect(result).toEqual(source);
    expect(result[0]).not.toBe(source[0]);
  });
});
