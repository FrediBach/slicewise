import { describe, expect, it } from 'vitest';
import { resolveStaggeredSlices, type StaggeredSliceSettings } from './staggered-slices';

const settings: StaggeredSliceSettings = {
  staggeredSlices: true,
  staggeredSlicesCount: 5,
  staggeredSlicesExtent: 60,
  staggeredSlicesDisplacement: 10,
  staggeredSlicesOrientation: 'horizontal',
  staggeredSlicesPattern: 'ramp',
  staggeredSlicesSeed: 3,
};

describe('staggered slice regions', () => {
  it('fills one centered region with contiguous horizontal strips', () => {
    const slices = resolveStaggeredSlices(settings, 120, 100, 10);

    expect(slices).toHaveLength(5);
    expect(slices[0]).toMatchObject({ left: 10, right: 110, top: 26, dx: -10, dy: 0 });
    expect(slices.at(-1)).toMatchObject({ bottom: 74, dx: 10, dy: 0 });
    for (let index = 1; index < slices.length; index++)
      expect(slices[index].top).toBeCloseTo(slices[index - 1].bottom);
  });

  it('creates an alternating displacement pattern', () => {
    const slices = resolveStaggeredSlices(
      { ...settings, staggeredSlicesCount: 4, staggeredSlicesPattern: 'alternating' },
      120,
      100,
      10,
    );

    expect(slices.map((slice) => slice.dx)).toEqual([-10, 10, -10, 10]);
  });

  it('creates deterministic seeded displacements', () => {
    const seeded = { ...settings, staggeredSlicesPattern: 'seeded' };
    const first = resolveStaggeredSlices(seeded, 120, 100, 10);
    const second = resolveStaggeredSlices(seeded, 120, 100, 10);

    expect(first).toEqual(second);
    expect(first.every((slice) => Math.abs(slice.dx) >= 3.5 && Math.abs(slice.dx) <= 10)).toBe(
      true,
    );
  });

  it('supports contiguous vertical strips moving along Y', () => {
    const slices = resolveStaggeredSlices(
      { ...settings, staggeredSlicesOrientation: 'vertical' },
      120,
      100,
      10,
    );

    expect(slices[0].left).toBe(30);
    expect(slices.at(-1)?.right).toBe(90);
    expect(slices.every((slice) => slice.dx === 0)).toBe(true);
    expect(slices.map((slice) => slice.dy)).toEqual([-10, -5, 0, 5, 10]);
  });

  it('returns no regions when disabled', () => {
    expect(resolveStaggeredSlices({ ...settings, staggeredSlices: false }, 120, 100, 10)).toEqual(
      [],
    );
  });
});
