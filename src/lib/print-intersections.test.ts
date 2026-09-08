import { describe, expect, it } from 'vitest';
import { auditSurfaceIntersections, PRINT_INTERSECTION_LIMITS } from './print-intersections';
import { solidBox, torusAdjacentOverlap } from '../test/fixtures/solid';

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
const contact = (...faces: Point[][]) => auditSurfaceIntersections(triangles(...faces));

describe('surface triangle contacts', () => {
  it('detects a transverse crossing and reports original triangle IDs', () => {
    const mesh = triangles(base, [
      [0.5, 0.5, -1],
      [0.5, 0.5, 1],
      [1, 0.5, 0],
    ]);
    const original = structuredClone(mesh);
    const report = auditSurfaceIntersections(mesh);
    expect(report.status).toBe('failed');
    expect(report.complete).toBe(true);
    expect(report.pairCount).toBe(1);
    expect([...report.trianglePairs]).toEqual([0, 1]);
    expect(auditSurfaceIntersections(mesh)).toEqual(report);
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

  it('rejects indexed neighbors overlapping beyond their shared vertex', () => {
    const mesh = triangles(base, [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    mesh.T[3] = 0;
    expect(auditSurfaceIntersections(mesh).status).toBe('failed');
    expect(auditSurfaceIntersections(mesh).adjacentPairCount).toBe(1);
    expect(auditSurfaceIntersections(solidBox()).status).toBe('passed');
  });

  it('allows a shared edge across flat, convex and concave joins but rejects folds onto the same side', () => {
    const mesh = {
      V: Float64Array.from([...base.flat(), 1, -1, 0]),
      T: new Uint32Array([0, 1, 2, 1, 0, 3]),
    };
    for (const third of [
      [1, -1, 0],
      [1, 0, 1],
      [1, 1, -1],
      [1, 1, 1],
    ]) {
      mesh.V.set(third, 9);
      expect(auditSurfaceIntersections(mesh).status).toBe('passed');
    }
    for (const third of [
      [1, 1, 0],
      [0, 2, 0],
      [1, 1, 1e-12],
    ]) {
      mesh.V.set(third, 9);
      const report = auditSurfaceIntersections(mesh);
      expect(report.status).toBe('failed');
      expect(report.adjacentPairCount).toBe(1);
      expect(report.nonAdjacentPairCount).toBe(0);
    }
    mesh.T.set([0, 1, 2], 3);
    expect(auditSurfaceIntersections(mesh).status).toBe('failed');
  });

  it('distinguishes shared-vertex crossings from disjoint direction cones', () => {
    const mesh = {
      V: Float64Array.from([...base.flat(), 1, 1, -1, 1, 1, 1]),
      T: new Uint32Array([0, 1, 2, 0, 3, 4]),
    };
    const cases = [
      { rays: [1, 1, -1, 1, 1, 1], contact: true },
      { rays: [-1, -1, -1, -1, -1, 1], contact: false },
      { rays: [1, 1, 1, 2, 1, 1], contact: false },
      { rays: [-1, 1, 0, -1, -1, 0], contact: false },
      { rays: [1, 0, 0, 1, -1, 0], contact: true },
      { rays: [1, 1, 0, 1, 2, 0], contact: true },
      { rays: [1, 1, 1e-12, 1, 2, 1e-12], contact: true },
    ];
    for (const { rays, contact } of cases) {
      mesh.V.set(rays, 9);
      expect(auditSurfaceIntersections(mesh).status).toBe(contact ? 'failed' : 'passed');
    }
  });

  it('keeps adjacent classifications through index ordering, winding, rigid transforms and scale', () => {
    const faces = [
      [0, 1, 2, 0, 3, 4],
      [2, 0, 1, 4, 3, 0],
      [4, 0, 3, 1, 0, 2],
    ];
    for (const scale of [1e-4, 1, 1e4])
      for (const contact of [false, true]) {
        const vertices = [...base.flat(), contact ? 1 : -1, 1, -1, contact ? 1 : -1, 1, 1];
        const V = new Float64Array(vertices.length);
        for (let i = 0; i < vertices.length; i += 3) {
          const [x, y, z] = vertices.slice(i, i + 3);
          V.set(
            [(0.6 * x - 0.8 * z) * scale + 100, y * scale - 20, (0.8 * x + 0.6 * z) * scale],
            i,
          );
        }
        for (const face of faces)
          expect(auditSurfaceIntersections({ V, T: face }).status).toBe(
            contact ? 'failed' : 'passed',
          );
      }
  });

  it('retains separate adjacent and non-adjacent counts with bounded original pair locations', () => {
    const mesh = triangles(base, base, base);
    mesh.T[3] = 0;
    const report = auditSurfaceIntersections(mesh);
    expect(report.pairCount).toBe(3);
    expect(report.adjacentPairCount).toBe(1);
    expect(report.nonAdjacentPairCount).toBe(2);
    expect([...report.trianglePairs]).toEqual([0, 1, 0, 2, 1, 2]);
    expect(auditSurfaceIntersections(mesh, 2).complete).toBe(false);
  });

  it('rejects the captured Float32 torus overlap with an exact interior-point witness', () => {
    const mesh = torusAdjacentOverlap();
    const report = auditSurfaceIntersections(mesh);
    expect(report.adjacentPairCount).toBe(1);
    expect(report.nonAdjacentPairCount).toBe(0);
    // Coordinates are exactly integral at this scale. Construct a rational point
    // on the second face's interior and the first face's plane, then independently
    // check its projected edge half-planes with integer arithmetic.
    const points = Array.from({ length: 5 }, (_, i) =>
      Array.from(mesh.V.slice(i * 3, i * 3 + 3), (v) => BigInt(v * 2 ** 21)),
    );
    const sub = (a: bigint[], b: bigint[]) => a.map((v, i) => v - b[i]);
    const cross = (a: bigint[], b: bigint[]) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a: bigint[], b: bigint[]) => a.reduce((sum, v, i) => sum + v * b[i], 0n);
    const origin = points[1],
      normal = cross(sub(points[0], origin), sub(points[2], origin));
    const u = sub(points[3], origin),
      v = sub(points[4], origin);
    const planeU = dot(normal, u),
      planeV = dot(normal, v);
    let denominator = 4n * planeU;
    let numerator = origin.map((x, i) => x * denominator - planeV * u[i] + planeU * v[i]);
    if (denominator < 0n) {
      denominator = -denominator;
      numerator = numerator.map((x) => -x);
    }
    expect(denominator).toBeGreaterThan(0n);
    expect(
      dot(
        normal,
        sub(
          numerator,
          origin.map((x) => x * denominator),
        ),
      ),
    ).toBe(0n);
    for (const face of [
      [0, 1, 2],
      [3, 4, 1],
    ]) {
      const p = face.map((id) => points[id]);
      const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
      expect(
        dot(
          n,
          sub(
            numerator,
            p[0].map((x) => x * denominator),
          ),
        ),
      ).toBe(0n);
      const sides = p.map((a, i) => {
        const b = p[(i + 1) % 3];
        return (
          (b[0] - a[0]) * (numerator[1] - a[1] * denominator) -
          (b[1] - a[1]) * (numerator[0] - a[0] * denominator)
        );
      });
      expect(sides.every((s) => s > 0n) || sides.every((s) => s < 0n)).toBe(true);
    }
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
    const report = auditSurfaceIntersections(mesh, 20);
    expect(report.status).toBe('budget-exceeded');
    expect(report.complete).toBe(false);
    expect(report.work).toBe(20);
    expect(report.pairCount).toBeLessThan(190);
    expect(auditSurfaceIntersections(mesh, 0).status).toBe('budget-exceeded');
    for (const limit of [-1, 1.5, Infinity, PRINT_INTERSECTION_LIMITS.work + 1])
      expect(() => auditSurfaceIntersections(mesh, limit)).toThrow('work limit');
  });

  it('does not let unused coordinates change the tolerance or allocate past the triangle cap', () => {
    const box = solidBox();
    const report = auditSurfaceIntersections(box);
    expect(
      auditSurfaceIntersections({ ...box, V: Float64Array.from([...box.V, 1e30, 0, 0]) }),
    ).toEqual(report);
    const overBudget = auditSurfaceIntersections({
      V: [],
      T: { length: (PRINT_INTERSECTION_LIMITS.triangles + 1) * 3 },
    });
    expect(overBudget.status).toBe('budget-exceeded');
    expect(overBudget.work).toBe(0);
    expect(overBudget.complete).toBe(false);
    expect(auditSurfaceIntersections(triangles(base)).status).toBe('passed');
  });

  it('matches exhaustive face-pair queries across subtree splits without duplicate contacts', () => {
    // Groups mix shared-vertex overlap, unindexed overlap and disjoint geometry.
    // Reordering makes spatial tree order differ from original face IDs.
    const mesh = triangles(
      ...Array.from({ length: 12 }, (_, group) =>
        Array.from({ length: 3 }, () => base.map(([x, y, z]): Point => [x + group * 5, y, z])),
      ).flat(),
    );
    for (let group = 0; group < 12; group++) mesh.T[group * 9 + 3] = mesh.T[group * 9];
    const faces = Array.from({ length: 36 }, (_, f) => Array.from(mesh.T.slice(f * 3, f * 3 + 3)));
    for (const order of [
      faces,
      [...faces].reverse(),
      faces.filter((_, i) => i % 2 === 0).concat(faces.filter((_, i) => i % 2)),
    ]) {
      const T = Uint32Array.from(order.flat());
      const expected = new Set<string>();
      let adjacent = 0,
        nonAdjacent = 0;
      for (let f = 0; f < order.length; f++)
        for (let g = f + 1; g < order.length; g++) {
          const pair = auditSurfaceIntersections({ V: mesh.V, T: [...order[f], ...order[g]] });
          if (pair.pairCount) expected.add(`${f},${g}`);
          adjacent += pair.adjacentPairCount;
          nonAdjacent += pair.nonAdjacentPairCount;
        }
      const report = auditSurfaceIntersections({ V: mesh.V, T });
      expect(report.complete).toBe(true);
      expect(report.pairCount).toBe(expected.size);
      expect(report.adjacentPairCount).toBe(adjacent);
      expect(report.nonAdjacentPairCount).toBe(nonAdjacent);
      const sampled = new Set<string>();
      for (let i = 0; i < report.trianglePairs.length; i += 2) {
        const key = `${report.trianglePairs[i]},${report.trianglePairs[i + 1]}`;
        expect(expected.has(key)).toBe(true);
        expect(sampled.has(key)).toBe(false);
        sampled.add(key);
      }
      // A just-insufficient budget never claims completion; exact work suffices.
      expect(auditSurfaceIntersections({ V: mesh.V, T }, report.work - 1).complete).toBe(false);
      expect(auditSurfaceIntersections({ V: mesh.V, T }, report.work)).toEqual(report);
    }
  });

  it('prunes separated geometry and does not reuse stale caller bounds', () => {
    const mesh = triangles(
      ...Array.from({ length: 1000 }, (_, i) => base.map(([x, y, z]): Point => [x + i * 10, y, z])),
    );
    const report = auditSurfaceIntersections(mesh);
    expect(report.status).toBe('passed');
    expect(report.work).toBeLessThan(50_000);
    mesh.V.set(mesh.V.slice(0, 9), 9);
    expect(auditSurfaceIntersections(mesh).pairCount).toBe(1);
  });
});
