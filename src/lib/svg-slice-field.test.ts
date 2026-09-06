import { describe, expect, it } from 'vitest';
import { svgSliceContours } from './svg-slice-field';
import { torusKnot } from './demo-meshes';
import { weld } from './mesh';
import { computeContours } from './contour-engine';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';
const mesh = {
  V: [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0, -2, -2, 1, 2, -2, 1, 2, 2, 1, -2, 2, 1],
  T: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
};
const settings = { svgSlicePaths: [[-0.5, 0.2, 0.5, 0.2]], cutAz: 0, cutEl: 90, divergence: 0 };
describe('SVG cutting surfaces', () => {
  it('clips to the authored segment rather than extending it into an infinite plane', () => {
    const [slice] = svgSliceContours(mesh, settings);
    expect(slice.segments.length).toBeGreaterThan(0);
    for (let i = 0; i < slice.points.length; i += 3) {
      expect(Math.abs(slice.points[i])).toBeLessThanOrEqual(0.500001);
      expect(slice.points[i + 1]).toBeCloseTo(0.2);
    }
    expect(slice.points.some((x, i) => i % 3 === 2 && Math.abs(x - 1) < 1e-8)).toBe(true);
  });
  it('diverges from the near side while preserving the original path there', () => {
    const [slice] = svgSliceContours(mesh, { ...settings, divergence: 90 });
    for (let i = 0; i < slice.points.length; i += 3)
      expect(slice.points[i + 1]).toBeCloseTo(0.2 * (1 + slice.points[i + 2]));
  });
  it('keeps disconnected subpaths separate and never joins them with a fabricated edge', () => {
    const slices = svgSliceContours(mesh, {
      ...settings,
      svgSlicePaths: [
        [-0.8, 0, -0.4, 0],
        [0.4, 0, 0.8, 0],
      ],
    });
    expect(slices).toHaveLength(2);
    expect(slices[0].points.filter((_, i) => i % 3 === 0).every((x) => x < 0)).toBe(true);
    expect(slices[1].points.filter((_, i) => i % 3 === 0).every((x) => x > 0)).toBe(true);
  });
  it('renders paths independently of line count with shared export geometry', () => {
    const source = makeContourMesh();
    const s = { ...contourSettings, ...settings, axis: 'svg', hide: false, outline: false };
    const a = computeContours(source, { ...s, lines: 3 }, false),
      b = computeContours(source, { ...s, lines: 80 }, false);
    expect(a.toolpaths.length).toBeGreaterThan(0);
    expect(a.toolpaths).toEqual(b.toolpaths);
    expect(a.svg).not.toMatch(/NaN|Infinity/);
    expect(a.sequenceSource?.slices).toHaveLength(1);
    expect(computeContours(source, s, true).paths).toBeGreaterThan(0);
  });
  it('preserves a closed outline on each intersected face', () => {
    const [slice] = svgSliceContours(mesh, {
      ...settings,
      svgSlicePaths: [[-0.4, -0.4, 0.4, -0.4, 0.4, 0.4, -0.4, 0.4, -0.4, -0.4]],
    });
    const degree = new Map<number, number>();
    for (const index of slice.segments) degree.set(index, (degree.get(index) ?? 0) + 1);
    expect(degree.size).toBeGreaterThan(0);
    expect([...degree.values()].every((value) => value === 2)).toBe(true);
  });
  it('applies placement and rotation in the cutting plane', () => {
    const [slice] = svgSliceContours(mesh, {
      ...settings,
      svgSlicePaths: [[-0.5, 0, 0.5, 0]],
      svgSliceScale: 50,
      svgSliceRotation: 90,
      svgSliceX: 30,
    });
    expect(slice.segments.length).toBeGreaterThan(0);
    for (let i = 0; i < slice.points.length; i += 3) {
      expect(slice.points[i]).toBeCloseTo(0.3);
      expect(Math.abs(slice.points[i + 1])).toBeLessThanOrEqual(0.250001);
    }
  });
  it('slices detailed artwork on the default model without rejecting unrelated triangle pairs', () => {
    const model = weld(torusKnot());
    const path = Array.from({ length: 1201 }, (_, i) => [
      0.6 * Math.cos((i / 1200) * Math.PI * 2),
      0.6 * Math.sin((i / 1200) * Math.PI * 2),
    ]).flat();
    expect((1200 * model.T.length) / 3).toBeGreaterThan(20_000_000);
    const [slice] = svgSliceContours(model, { ...settings, svgSlicePaths: [path] });
    expect(slice.segments.length).toBeGreaterThan(0);
  });
  it('allows an empty upload state and rejects excessive paths', () => {
    expect(svgSliceContours(mesh, { ...settings, svgSlicePaths: [] })).toEqual([]);
    expect(() =>
      svgSliceContours(mesh, { ...settings, svgSlicePaths: [Array(40004).fill(1)] }),
    ).toThrow('Simplify');
  });
});
