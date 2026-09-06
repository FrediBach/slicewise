import { describe, expect, it } from 'vitest';
import { refineContourSegments } from './contour-refinement';

describe('normal-guided contour refinement', () => {
  const circle = () => {
    const pts: number[] = [],
      segs: number[] = [],
      tangents: number[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      pts.push(Math.cos(angle), Math.sin(angle), 0.8);
      tangents.push(-Math.sin(angle), Math.cos(angle), 0);
      segs.push(i, (i + 1) % 8);
    }
    return { pts, segs, tangents };
  };

  it('rounds sparse closed loops while retaining endpoints and the slice plane', () => {
    const { pts, segs, tangents } = circle();
    const original = pts.slice();
    const refined = refineContourSegments(pts, segs, tangents, 1, 0.0001);
    expect(pts.slice(0, original.length)).toEqual(original);
    expect(refined.length).toBeGreaterThan(segs.length);
    const degree = new Map<number, number>();
    let maxRadialError = 0;
    for (let i = 0; i < refined.length; i += 2) {
      const a = refined[i],
        b = refined[i + 1];
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
      const radius = Math.hypot(
        (pts[a * 3] + pts[b * 3]) / 2,
        (pts[a * 3 + 1] + pts[b * 3 + 1]) / 2,
      );
      maxRadialError = Math.max(maxRadialError, Math.abs(radius - 1));
    }
    // The original octagon's chord error is over 0.07.
    expect(maxRadialError).toBeLessThan(0.004);
    expect([...degree.values()].every((value) => value === 2)).toBe(true);
    for (let i = 2; i < pts.length; i += 3) expect(pts[i]).toBeCloseTo(0.8, 12);
    const repeated = circle();
    expect(
      refineContourSegments(repeated.pts, repeated.segs, repeated.tangents, 1, 0.0001),
    ).toEqual(refined);
    expect(repeated.pts).toEqual(pts);
  });

  it('leaves straight, densely sampled, degenerate, and disabled spans alone', () => {
    for (const tangents of [
      [1, 0, 0, 1, 0, 0],
      [1, 0.05, 0, 1, -0.05, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 1, 0],
    ]) {
      const pts = [0, 0, 0, 1, 0, 0];
      expect(refineContourSegments(pts, [0, 1], tangents, 1, 0.0001)).toEqual([0, 1]);
      expect(pts).toEqual([0, 0, 0, 1, 0, 0]);
    }
    const { pts, segs, tangents } = circle();
    const original = pts.slice();
    expect(refineContourSegments(pts, segs, tangents, 0, 0.0001)).toBe(segs);
    expect(refineContourSegments(pts, segs, tangents, 1, 0)).toBe(segs);
    expect(pts).toEqual(original);
  });

  it('detects S bends and bounds subdivision even with an extreme tolerance', () => {
    const pts = [0, 0, 0, 1, 0, 0];
    const refined = refineContourSegments(pts, [0, 1], [1, 1, 0, 1, 1, 0], 1, 1e-30);
    expect(refined.length).toBeGreaterThan(2);
    expect(refined.length).toBeLessThanOrEqual(128);
    expect(pts.every(Number.isFinite)).toBe(true);
    const ys = pts.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(0);
  });
});
