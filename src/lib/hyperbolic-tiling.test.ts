import { describe, expect, it } from 'vitest';
import {
  fundamentalPolygonRadius,
  generateHyperbolicTiling,
  isHyperbolicPair,
  poincareGeodesic,
} from './hyperbolic-tiling';

describe('hyperbolic tiling generation', () => {
  it('accepts only valid hyperbolic Schläfli pairs', () => {
    expect(isHyperbolicPair(3, 7)).toBe(true);
    expect(isHyperbolicPair(4, 5)).toBe(true);
    expect(isHyperbolicPair(7, 3)).toBe(true);
    expect(isHyperbolicPair(3, 6)).toBe(false);
    expect(isHyperbolicPair(4, 4)).toBe(false);
    expect(() => fundamentalPolygonRadius(6, 3)).toThrow(/not hyperbolic/);
  });

  it.each([
    [3, 7],
    [4, 5],
    [7, 3],
  ])('keeps {%i,%i} vertices finite and strictly inside the disk', (p, q) => {
    const tiling = generateHyperbolicTiling({ p, q, depth: 3 });
    expect(tiling.edges.length).toBeGreaterThan(p);
    for (const [a, b] of tiling.edges) {
      expect(Math.hypot(...a)).toBeLessThan(1);
      expect(Math.hypot(...b)).toBeLessThan(1);
    }
    expect(Array.from(tiling.points).every(Number.isFinite)).toBe(true);
    expect(tiling.offsets.at(-1)).toBe(tiling.points.length / 2);
  });

  it('constructs circular geodesics orthogonal to the unit-disk boundary', () => {
    const radius = fundamentalPolygonRadius(7, 3);
    const a: [number, number] = [0, radius];
    const angle = Math.PI / 2 + (Math.PI * 2) / 7;
    const b: [number, number] = [radius * Math.cos(angle), radius * Math.sin(angle)];
    const geodesic = poincareGeodesic(a, b);
    expect(geodesic.kind).toBe('circle');
    if (geodesic.kind === 'circle') {
      const centerDistanceSquared = geodesic.center[0] ** 2 + geodesic.center[1] ** 2;
      expect(centerDistanceSquared - geodesic.radius ** 2).toBeCloseTo(1, 10);
    }
  });

  it('is deterministic, bounded, and emits no reversed duplicate edges', () => {
    const options = { p: 4, q: 5, depth: 6, maxEdges: 180 };
    const first = generateHyperbolicTiling(options);
    const second = generateHyperbolicTiling(options);
    expect(first.edges).toHaveLength(180);
    expect(first.truncated).toBe(true);
    expect(first.points).toEqual(second.points);
    expect(first.offsets).toEqual(second.offsets);
    const keys = first.edges.map(([a, b]) => {
      const ka = `${a[0].toFixed(7)},${a[1].toFixed(7)}`;
      const kb = `${b[0].toFixed(7)},${b[1].toFixed(7)}`;
      return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps every permitted high-order pair finite at maximum UI depth', () => {
    for (let p = 3; p <= 12; p++)
      for (let q = 3; q <= 12; q++) {
        if (!isHyperbolicPair(p, q)) continue;
        const tiling = generateHyperbolicTiling({ p, q, depth: 6, maxEdges: 12_000 });
        expect(tiling.edges.length, `{${p},${q}}`).toBeLessThanOrEqual(12_000);
        expect(Array.from(tiling.points).every(Number.isFinite), `{${p},${q}}`).toBe(true);
      }
  });
});
