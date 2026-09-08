import { expect, it } from 'vitest';
import { exactAdjacentOverlap } from './exact-adjacent-overlap';
type Vec = [number, number, number];
const a: Vec[] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];
it('separates arbitrarily close edge neighbors while rejecting coplanar folds', () => {
  for (const epsilon of [Number.MIN_VALUE, 2 ** -149, 1e-12, 1]) {
    expect(
      exactAdjacentOverlap(
        a,
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, epsilon],
        ],
        2,
      ),
    ).toBe(false);
  }
  expect(
    exactAdjacentOverlap(
      a,
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      2,
    ),
  ).toBe(true);
  expect(
    exactAdjacentOverlap(
      a,
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, -1, 0],
      ],
      2,
    ),
  ).toBe(false);
});
it('resolves thin nondegenerate cones and crossings exactly', () => {
  const thin: Vec[] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 2 ** -149, 0],
  ];
  expect(
    exactAdjacentOverlap(
      thin,
      [
        [0, 0, 0],
        [1, -1, 0],
        [1, -2, 0],
      ],
      1,
    ),
  ).toBe(false);
  expect(
    exactAdjacentOverlap(
      thin,
      [
        [0, 0, 0],
        [1, 0, -1],
        [1, 2 ** -149, 1],
      ],
      1,
    ),
  ).toBe(true);
  expect(
    exactAdjacentOverlap(
      a,
      [
        [0, 0, 0],
        [1, 1, 1e-12],
        [1, 2, 1e-12],
      ],
      1,
    ),
  ).toBe(false);
});
it('is invariant under swapping triangles, winding and exact rigid coordinate transforms', () => {
  for (const overlap of [true, false])
    for (const reverse of [true, false]) {
      const b: Vec[] = [
        [0, 0, 0],
        [1, 1, overlap ? -1 : 1],
        [1, 2, 1],
      ];
      for (const transform of [
        (p: Vec) => p,
        ([x, y, z]: Vec): Vec => [z + 1024, x - 1024, y * 2],
      ]) {
        const first = a.map(transform),
          second = b.map(transform);
        if (reverse) {
          [first[1], first[2]] = [first[2], first[1]];
          [second[1], second[2]] = [second[2], second[1]];
        }
        expect(exactAdjacentOverlap(first, second, 1)).toBe(overlap);
        expect(exactAdjacentOverlap(second, first, 1)).toBe(overlap);
      }
    }
});
