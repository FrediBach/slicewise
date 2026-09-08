import { describe, expect, it } from 'vitest';
import { auditNonAdjacentIntersections, PRINT_INTERSECTION_LIMITS } from './print-intersections';
import { solidBox } from '../test/fixtures/solid';

type Point = [number, number, number];
function triangles(...faces: Point[][]) {
  return {
    V: Float64Array.from(faces.flat(2)),
    T: Uint32Array.from({ length: faces.length * 3 }, (_, i) => i),
  };
}
const base: Point[] = [
  [0, 0, 0],
  [2, 0, 0],
  [0, 2, 0],
];
const contact = (...faces: Point[][]) => auditNonAdjacentIntersections(triangles(...faces));

describe('non-adjacent triangle contacts', () => {
  it('detects a transverse crossing and reports original triangle IDs', () => {
    const mesh = triangles(base, [
      [0.5, 0.5, -1],
      [0.5, 0.5, 1],
      [1, 0.5, 0],
    ]);
    const original = structuredClone(mesh);
    const report = auditNonAdjacentIntersections(mesh);
    expect(report.status).toBe('failed');
    expect(report.complete).toBe(true);
    expect(report.pairCount).toBe(1);
    expect([...report.trianglePairs]).toEqual([0, 1]);
    expect(auditNonAdjacentIntersections(mesh)).toEqual(report);
    expect(mesh).toEqual(original);
  });

  it('rejects coplanar overlap, containment and unindexed point/edge contacts', () => {
    for (const face of [
      [
        [0.5, 0.5, 0],
        [1, 0.5, 0],
        [0.5, 1, 0],
      ],
      [
        [0, 0, 0],
        [2, 0, 0],
        [1, -1, 0],
      ],
      [
        [2, 0, 0],
        [3, 0, 0],
        [3, 1, 0],
      ],
      [
        [0, 0, 0],
        [0, 2, 0],
        [2, 0, 0],
      ],
    ] as Point[][])
      expect(contact(base, face).status).toBe('failed');
  });

  it('separates disjoint coplanar triangles even when their boxes overlap', () => {
    expect(
      contact(base, [
        [1.1, 1.1, 0],
        [2, 1.1, 0],
        [1.1, 2, 0],
      ]).status,
    ).toBe('passed');
    expect(
      contact(
        base,
        base.map(([x, y]) => [x, y, 0.01]),
      ).status,
    ).toBe('passed');
    expect(
      contact(base, [
        [1.5, 1.5, -1],
        [1.5, 1.5, 1],
        [2, 2, 0],
      ]).status,
    ).toBe('passed');
  });

  it('remains invariant under triangle ordering, winding, translation and rigid rotation', () => {
    const crossing: Point[] = [
      [0.5, 0.5, -1],
      [0.5, 0.5, 1],
      [1, 0.5, 0],
    ];
    const separated: Point[] = [
      [1.1, 1.1, 0],
      [2, 1.1, 0],
      [1.1, 2, 0],
    ];
    const transforms = [
      (p: Point): Point => p,
      ([x, y, z]: Point): Point => [z + 1e6, x - 1e6, y + 100],
      ([x, y, z]: Point): Point => [x * 0.6 - y * 0.8, x * 0.8 + y * 0.6, z],
    ];
    for (const transform of transforms)
      for (const reverse of [false, true]) {
        const a = base.map(transform),
          b = crossing.map(transform),
          c = separated.map(transform);
        if (reverse) {
          a.reverse();
          b.reverse();
          c.reverse();
        }
        expect(contact(a, b).status).toBe('failed');
        expect(contact(b, a).status).toBe('failed');
        expect(contact(a, c).status).toBe('passed');
      }
  });

  it('excludes indexed neighbors, including their unresolved overlap beyond the shared vertex', () => {
    const mesh = triangles(base, [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    mesh.T[3] = 0;
    expect(auditNonAdjacentIntersections(mesh).status).toBe('passed');
    expect(auditNonAdjacentIntersections(solidBox()).status).toBe('passed');
  });

  it('reports its conservative tolerance instead of accepting numerically unresolved gaps', () => {
    const close = contact(
      base,
      base.map(([x, y]) => [x, y, 1e-11]),
    );
    expect(close.toleranceMm).toBe(1e-10);
    expect(close.status).toBe('failed');
    expect(
      contact(
        base,
        base.map(([x, y]) => [x, y, 1e-8]),
      ).status,
    ).toBe('passed');
  });

  it('counts all contacts while bounding diagnostic pair storage', () => {
    const report = contact(...Array.from({ length: 20 }, () => base));
    expect(report.pairCount).toBe(190);
    expect(report.trianglePairs).toHaveLength(PRINT_INTERSECTION_LIMITS.samples * 2);
    expect(report.complete).toBe(true);
  });

  it('rejects exhausted work without claiming complete counts or a passing check', () => {
    const mesh = triangles(...Array.from({ length: 20 }, () => base));
    const report = auditNonAdjacentIntersections(mesh, 20);
    expect(report.status).toBe('budget-exceeded');
    expect(report.complete).toBe(false);
    expect(report.work).toBe(20);
    expect(report.pairCount).toBeLessThan(190);
    expect(auditNonAdjacentIntersections(mesh, 0).status).toBe('budget-exceeded');
    for (const limit of [-1, 1.5, Infinity, PRINT_INTERSECTION_LIMITS.work + 1])
      expect(() => auditNonAdjacentIntersections(mesh, limit)).toThrow('work limit');
  });

  it('does not let unused coordinates change the tolerance or allocate past the triangle cap', () => {
    const box = solidBox();
    const report = auditNonAdjacentIntersections(box);
    expect(
      auditNonAdjacentIntersections({ ...box, V: Float64Array.from([...box.V, 1e30, 0, 0]) }),
    ).toEqual(report);
    const overBudget = auditNonAdjacentIntersections({
      V: [],
      T: { length: (PRINT_INTERSECTION_LIMITS.triangles + 1) * 3 },
    });
    expect(overBudget.status).toBe('budget-exceeded');
    expect(overBudget.work).toBe(0);
    expect(overBudget.complete).toBe(false);
    expect(auditNonAdjacentIntersections(triangles(base)).status).toBe('passed');
  });

  it('prunes separated geometry and does not reuse stale caller bounds', () => {
    const mesh = triangles(
      ...Array.from({ length: 1000 }, (_, i) => base.map(([x, y, z]): Point => [x + i * 10, y, z])),
    );
    const report = auditNonAdjacentIntersections(mesh);
    expect(report.status).toBe('passed');
    expect(report.work).toBeLessThan(50_000);
    mesh.V.set(mesh.V.slice(0, 9), 9);
    expect(auditNonAdjacentIntersections(mesh).pairCount).toBe(1);
  });
});
