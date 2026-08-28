import type { ParsedMesh } from '../mesh';

type Vec3 = number[];

export function radishDemo(segments = 160, rings = 96): ParsedMesh {
  const verts: number[] = [];
  const tris: number[] = [];
  const radishPoint = (u: number, v: number): Vec3 => {
    const radius = Math.pow(Math.sin(u), 3);
    return [
      radius * Math.cos(v),
      radius * Math.sin(v) * 0.68,
      (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)) / 16,
    ];
  };

  const top = verts.length / 3;
  verts.push(...radishPoint(0, 0));
  for (let i = 1; i < rings; i++) {
    const u = (i / rings) * Math.PI;
    for (let j = 0; j < segments; j++) verts.push(...radishPoint(u, (j / segments) * Math.PI * 2));
  }
  const bottom = verts.length / 3;
  verts.push(...radishPoint(Math.PI, 0));

  for (let j = 0; j < segments; j++) tris.push(top, 1 + j, 1 + ((j + 1) % segments));
  for (let i = 0; i < rings - 2; i++)
    for (let j = 0; j < segments; j++) {
      const a = 1 + i * segments + j;
      const b = 1 + i * segments + ((j + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      tris.push(a, c, d, a, d, b);
    }
  const lastRing = 1 + (rings - 2) * segments;
  for (let j = 0; j < segments; j++)
    tris.push(bottom, lastRing + ((j + 1) % segments), lastRing + j);
  return { verts: Float64Array.from(verts), tris: Uint32Array.from(tris) };
}

export function torusKnot(p = 2, q = 3, R = 1, r = 0.26, tubeSeg = 360, radSeg = 28): ParsedMesh {
  const verts: number[] = [],
    tris: number[] = [];
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const pt = (u: number): Vec3 => {
    const qu = (q / p) * u,
      cq = Math.cos(qu);
    return [
      (2 + cq) * 0.5 * Math.cos(u) * R,
      (2 + cq) * 0.5 * Math.sin(u) * R,
      Math.sin(qu) * 0.5 * R,
    ];
  };
  // centreline + tangents
  const C: Vec3[] = [],
    T: Vec3[] = [];
  for (let i = 0; i < tubeSeg; i++) {
    const u = (i / tubeSeg) * Math.PI * 2 * p;
    C.push(pt(u));
    T.push(norm(sub(pt(u + 1e-4), pt(u - 1e-4))));
  }
  // rotation-minimising frame (parallel transport), then unwind the closing twist
  const N: Vec3[] = [];
  const n0 = norm(cross(T[0], Math.abs(T[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  N.push(n0);
  for (let i = 1; i < tubeSeg; i++) {
    const prev = N[i - 1],
      t = T[i];
    N.push(
      norm(
        sub(
          prev,
          t.map((v) => v * dot(prev, t)),
        ),
      ),
    );
  }
  const closed = norm(
    sub(
      N[tubeSeg - 1],
      T[0].map((v) => v * dot(N[tubeSeg - 1], T[0])),
    ),
  );
  const b0 = cross(T[0], N[0]);
  const twist = Math.atan2(dot(closed, b0), dot(closed, N[0]));
  for (let i = 0; i < tubeSeg; i++) {
    const a = (-twist * i) / tubeSeg; // spread the mismatch evenly
    const t = T[i],
      n = N[i],
      b = cross(t, n);
    const nn = [
      n[0] * Math.cos(a) + b[0] * Math.sin(a),
      n[1] * Math.cos(a) + b[1] * Math.sin(a),
      n[2] * Math.cos(a) + b[2] * Math.sin(a),
    ];
    const bb = cross(t, nn);
    const P = C[i];
    for (let j = 0; j < radSeg; j++) {
      const th = (j / radSeg) * Math.PI * 2,
        ca = Math.cos(th) * r,
        sa = Math.sin(th) * r;
      verts.push(
        P[0] + ca * nn[0] + sa * bb[0],
        P[1] + ca * nn[1] + sa * bb[1],
        P[2] + ca * nn[2] + sa * bb[2],
      );
    }
  }
  for (let i = 0; i < tubeSeg; i++)
    for (let j = 0; j < radSeg; j++) {
      const a = i * radSeg + j,
        b = i * radSeg + ((j + 1) % radSeg);
      const c = ((i + 1) % tubeSeg) * radSeg + j,
        d = ((i + 1) % tubeSeg) * radSeg + ((j + 1) % radSeg);
      tris.push(a, b, d, a, d, c);
    }
  return { verts: Float64Array.from(verts), tris: Uint32Array.from(tris) };
}

export function sphereDemo(
  kind: 'ripple' | 'cube' | 'diamond' = 'ripple',
  segments = 128,
  rings = 64,
): ParsedMesh {
  const verts: number[] = [],
    tris: number[] = [];
  const signedPow = (v: number, p: number): number => Math.sign(v) * Math.pow(Math.abs(v), p);
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI,
      sp = Math.sin(phi),
      cp = Math.cos(phi);
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      let x = sp * Math.cos(theta),
        y = sp * Math.sin(theta),
        z = cp;
      if (kind === 'cube') {
        const p = 0.52;
        x = signedPow(x, p);
        y = signedPow(y, p);
        z = signedPow(z, p);
      } else if (kind === 'diamond') {
        const p = 1.65;
        x = signedPow(x, p);
        y = signedPow(y, p);
        z = signedPow(z, p);
      } else {
        const radius =
          1 + 0.095 * Math.sin(theta * 7) * Math.pow(sp, 3) + 0.035 * Math.cos(phi * 8);
        x *= radius;
        y *= radius;
        z *= radius;
      }
      verts.push(x, y, z);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j,
        b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + j,
        d = (i + 1) * segments + ((j + 1) % segments);
      tris.push(a, b, d, a, d, c);
    }
  return { verts: Float64Array.from(verts), tris: Uint32Array.from(tris) };
}

export function ringTorus(major = 0.72, minor = 0.3, majorSeg = 192, minorSeg = 64): ParsedMesh {
  const verts: number[] = [],
    tris: number[] = [];
  for (let i = 0; i < majorSeg; i++) {
    const u = (i / majorSeg) * Math.PI * 2,
      cu = Math.cos(u),
      su = Math.sin(u);
    for (let j = 0; j < minorSeg; j++) {
      const v = (j / minorSeg) * Math.PI * 2,
        cv = Math.cos(v),
        sv = Math.sin(v);
      const radius = major + minor * cv;
      verts.push(radius * cu, radius * su, minor * sv);
    }
  }
  for (let i = 0; i < majorSeg; i++)
    for (let j = 0; j < minorSeg; j++) {
      const a = i * minorSeg + j,
        b = i * minorSeg + ((j + 1) % minorSeg);
      const c = ((i + 1) % majorSeg) * minorSeg + j,
        d = ((i + 1) % majorSeg) * minorSeg + ((j + 1) % minorSeg);
      tris.push(a, b, d, a, d, c);
    }
  return { verts: Float64Array.from(verts), tris: Uint32Array.from(tris) };
}

export function radialColumnDemo(
  kind: 'twist' | 'hourglass',
  segments = 160,
  rings = 80,
): ParsedMesh {
  const verts: number[] = [],
    tris: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings,
      z = t * 2 - 1;
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      let radius: number;
      if (kind === 'twist') {
        const profile = 0.68 + 0.08 * Math.cos(z * Math.PI);
        radius = profile * (1 + 0.18 * Math.cos(theta * 5 + z * Math.PI * 1.35));
      } else {
        radius = 0.34 + 0.4 * Math.pow(Math.abs(z), 1.55) + 0.035 * Math.cos(z * Math.PI * 3);
      }
      verts.push(radius * Math.cos(theta), radius * Math.sin(theta), z);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j,
        b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + j,
        d = (i + 1) * segments + ((j + 1) % segments);
      tris.push(a, b, d, a, d, c);
    }
  const bottom = verts.length / 3;
  verts.push(0, 0, -1);
  const top = verts.length / 3;
  verts.push(0, 0, 1);
  const topRing = rings * segments;
  for (let j = 0; j < segments; j++) {
    const next = (j + 1) % segments;
    tris.push(bottom, next, j);
    tris.push(top, topRing + j, topRing + next);
  }
  return { verts: Float64Array.from(verts), tris: Uint32Array.from(tris) };
}

export function tetrapodDemo(segments = 160, rings = 80): ParsedMesh {
  const verts: number[] = [],
    tris: number[] = [];
  const tripodRadius = Math.sqrt(8 / 9);
  const directions = [
    [0, 0, 1],
    [tripodRadius, 0, -1 / 3],
    [
      tripodRadius * Math.cos((Math.PI * 2) / 3),
      tripodRadius * Math.sin((Math.PI * 2) / 3),
      -1 / 3,
    ],
    [
      tripodRadius * Math.cos((Math.PI * 4) / 3),
      tripodRadius * Math.sin((Math.PI * 4) / 3),
      -1 / 3,
    ],
  ];
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI,
      sp = Math.sin(phi),
      cp = Math.cos(phi);
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const x = sp * Math.cos(theta),
        y = sp * Math.sin(theta),
        z = cp;
      let alignment = -1;
      for (const direction of directions) {
        alignment = Math.max(alignment, x * direction[0] + y * direction[1] + z * direction[2]);
      }
      // Envelope of four tapered cones. Capping the radial distance at the
      // axial leg length produces the tetrapod's characteristic flat feet.
      const perpendicular = Math.sqrt(Math.max(0, 1 - alignment * alignment));
      const coneRadius = 0.52 / (perpendicular + 0.28 * alignment);
      const flatEndRadius = 1 / alignment;
      const radius = Math.min(coneRadius, flatEndRadius);
      verts.push(x * radius, y * radius, z * radius);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j,
        b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + j,
        d = (i + 1) * segments + ((j + 1) % segments);
      tris.push(a, b, d, a, d, c);
    }
  return { verts: Float64Array.from(verts), tris: Uint32Array.from(tris) };
}
