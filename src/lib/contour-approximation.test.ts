import { expect, it } from 'vitest';
import { approximateClosedContour } from './contour-approximation';

const circle = (count: number) =>
  Float64Array.from(
    Array.from({ length: count }, (_, i) => {
      const t = (i * 2 * Math.PI) / count;
      return [50 * Math.cos(t), 50 * Math.sin(t), 3.7];
    }).flat(),
  );

it('reduces a dense closed circle within the declared path error and retains original vertices', () => {
  const input = circle(1024),
    original = input.slice();
  const result = approximateClosedContour(input, 0.05);
  expect(result.points.length).toBeLessThan(input.length / 4);
  expect(result.maximumDeviationMm).toBeLessThanOrEqual(0.05);
  expect(result.maximumDeviationMm).toBeGreaterThan(0);
  result.retainedVertices.forEach((id, i) =>
    expect(result.points.slice(i * 3, i * 3 + 3)).toEqual(input.slice(id * 3, id * 3 + 3)),
  );
  // Independently measure every source vertex against the approximating polygon
  // in XY; all points are in the same Z plane.
  let maximum = 0;
  for (let i = 0; i < input.length; i += 3) {
    let nearest = Infinity;
    for (let j = 0; j < result.points.length; j += 3) {
      const k = (j + 3) % result.points.length;
      const dx = result.points[k] - result.points[j],
        dy = result.points[k + 1] - result.points[j + 1];
      const px = input[i] - result.points[j],
        py = input[i + 1] - result.points[j + 1];
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
      nearest = Math.min(nearest, Math.hypot(px - t * dx, py - t * dy));
    }
    maximum = Math.max(maximum, nearest);
  }
  expect(maximum).toBeCloseTo(result.maximumDeviationMm, 10);
  expect(input).toEqual(original);
  expect(approximateClosedContour(input, 0.05)).toEqual(result);
  result.points.fill(0);
  expect(input).toEqual(original);
});

it('removes collinear subdivisions while retaining concave corners and closure', () => {
  const input = new Float64Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 2, 2, 0, 1, 1, 0, 0, 2, 0, 0, 1, 0]);
  const result = approximateClosedContour(input, 0.01);
  expect([...result.retainedVertices]).toEqual([0, 2, 3, 4, 5]);
  expect(result.maximumDeviationMm).toBe(0);
});

it('keeps the same approximation under a rigid axis permutation and translation', () => {
  const input = circle(128),
    moved = new Float64Array(input.length);
  for (let i = 0; i < input.length; i += 3)
    moved.set([input[i + 2] + 10, input[i] - 20, input[i + 1] + 30], i);
  const a = approximateClosedContour(input, 0.05),
    b = approximateClosedContour(moved, 0.05);
  expect(b.points.length).toBe(a.points.length);
  expect(b.maximumDeviationMm).toBeCloseTo(a.maximumDeviationMm, 10);
});

it('rejects incomplete work, collapsing loops and malformed input without returning partial paths', () => {
  const points = circle(128),
    result = approximateClosedContour(points, 0.05);
  expect(() => approximateClosedContour(points, 0.05, result.work - 1)).toThrow('budget');
  expect(approximateClosedContour(points, 0.05, result.work)).toEqual(result);
  expect(() => approximateClosedContour(points, 1000)).toThrow('collapse');
  for (const tolerance of [0, -1, NaN, Infinity])
    expect(() => approximateClosedContour(points, tolerance)).toThrow('tolerance');
  expect(() => approximateClosedContour(new Float64Array(9), 0.05)).toThrow('nondegenerate');
  expect(() => approximateClosedContour(new Float64Array([NaN, 0, 0]), 0.05)).toThrow(
    'finite vertices',
  );
  expect(() => approximateClosedContour(points, 0.05, -1)).toThrow('budget');
});
