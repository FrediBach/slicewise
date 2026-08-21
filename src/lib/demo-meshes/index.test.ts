import { describe, expect, it } from 'vitest';
import { radialColumnDemo, ringTorus, sphereDemo, tetrapodDemo, torusKnot } from '.';

describe('procedural demo meshes', () => {
  it.each([
    ['torus knot', () => torusKnot(2, 3, 1, 0.2, 12, 4)],
    ['ripple sphere', () => sphereDemo('ripple', 12, 6)],
    ['rounded cube', () => sphereDemo('cube', 12, 6)],
    ['diamond', () => sphereDemo('diamond', 12, 6)],
    ['ring torus', () => ringTorus(0.7, 0.2, 12, 6)],
    ['twisted column', () => radialColumnDemo('twist', 12, 6)],
    ['hourglass', () => radialColumnDemo('hourglass', 12, 6)],
    ['tetrapod', () => tetrapodDemo(12, 6)],
  ])('creates finite, indexed %s geometry', (_name, create) => {
    const mesh = create();
    const vertexCount = mesh.verts.length / 3;

    expect(mesh.verts.length).toBeGreaterThan(0);
    expect(mesh.tris.length).toBeGreaterThan(0);
    expect(mesh.tris.length % 3).toBe(0);
    expect(Array.from(mesh.verts).every(Number.isFinite)).toBe(true);
    expect(Math.max(...mesh.tris)).toBeLessThan(vertexCount);
  });
});
