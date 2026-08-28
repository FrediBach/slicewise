import { describe, expect, it } from 'vitest';
import {
  cutYarnPolyline,
  humanizePolyline,
  polylineHash,
  selectYarnPolylines,
  sharpVertices,
  simplifyPolyline,
} from './polyline-styling';

describe('polyline styling', () => {
  it('preserves sharp corners while removing points on straight spans', () => {
    const source = [0, 0, 1, 0, 2, 0, 2, 1, 2, 2];
    const simplified = simplifyPolyline(source, 0.1);

    expect(simplified.run).toEqual([0, 0, 2, 0, 2, 2]);
    expect([...simplified.sharp]).toEqual([0, 1, 0]);
  });

  it('marks the repeated endpoint of a closed corner consistently', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10, 0, 0];
    const sharp = sharpVertices(square);

    expect([...sharp]).toEqual([1, 1, 1, 1, 1]);
  });

  it('humanizes deterministically, varies by salt, and keeps closed runs closed', () => {
    const square = [0, 0, 20, 0, 20, 20, 0, 20, 0, 0];
    const first = humanizePolyline(square, 70, 4);
    const repeated = humanizePolyline(square, 70, 4);
    const salted = humanizePolyline(square, 70, 5);

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(salted);
    expect(first.slice(-2)).toEqual(first.slice(0, 2));
    expect(first.every(Number.isFinite)).toBe(true);
    expect(humanizePolyline(square, 0)).toBe(square);
  });

  it('selects only eligible runs with stable density-derived cut counts', () => {
    const short = [0, 0, 5, 0];
    const longA = [0, 0, 30, 0];
    const longB = [0, 1, 30, 1];
    const selected = selectYarnPolylines([short, longA, longB], 250);

    expect(selected.has(short)).toBe(false);
    expect([...selected.values()].sort()).toEqual([2, 3]);
    expect(selectYarnPolylines([short, longA, longB], 250)).toEqual(selected);
  });

  it('cuts open and closed runs into deterministic finite curls', () => {
    const open = [0, 0, 20, 0, 40, 0, 60, 0];
    const closed = [0, 0, 30, 0, 30, 30, 0, 30, 0, 0];

    for (const [run, expectedPieces] of [
      [open, 3],
      [closed, 2],
    ] as const) {
      const seed = polylineHash(run);
      const pieces = cutYarnPolyline(run, seed, 100, 2);
      expect(pieces).toEqual(cutYarnPolyline(run, seed, 100, 2));
      expect(pieces).toHaveLength(expectedPieces);
      expect(pieces.every((piece) => piece.length >= 4 && piece.every(Number.isFinite))).toBe(true);
    }
  });
});
