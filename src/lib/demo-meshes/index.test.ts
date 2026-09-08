import { describe, expect, it } from 'vitest';
import {
  radialColumnDemo,
  radishDemo,
  roundedDemo,
  ringTorus,
  sphereDemo,
  tetrapodDemo,
  torusKnot,
} from '.';
import { vertexNormals, weld } from '../mesh';
import { computeContours } from '../contour-engine';
import { contourSettings } from '../../test/fixtures/contours';
import { auditPrintTopology } from '../print-validation';
import { getMeshTopology } from '../mesh-topology';

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
    ['radish', () => radishDemo(12, 8)],
  ])('creates finite, indexed %s geometry', (_name, create) => {
    const mesh = create();
    const vertexCount = mesh.verts.length / 3;

    expect(mesh.verts.length).toBeGreaterThan(0);
    expect(mesh.tris.length).toBeGreaterThan(0);
    expect(mesh.tris.length % 3).toBe(0);
    expect(Array.from(mesh.verts).every(Number.isFinite)).toBe(true);
    expect(Math.max(...mesh.tris)).toBeLessThan(vertexCount);
  });

  it('creates closed manifold radish geometry', () => {
    const mesh = weld(radishDemo(20, 12));
    const topology = getMeshTopology(mesh);

    expect(topology.boundaryEdges).toHaveLength(0);
    expect(topology.nonManifoldEdges).toHaveLength(0);
    expect(topology.componentCount).toBe(1);
  });
});

describe('rounded demo solids', () => {
  it.each(['pyramid', 'twin-balls', 'pebble', 'rounded-cylinder'] as const)(
    'creates deterministic, closed, outward-facing %s geometry',
    (kind) => {
      const mesh = roundedDemo(kind, 32, 24);
      expect(mesh).toEqual(roundedDemo(kind, 32, 24));
      expect(Array.from(mesh.verts).every(Number.isFinite)).toBe(true);
      const normalized = weld(mesh);
      const result = computeContours(
        { ...normalized, N: vertexNormals(normalized.V, normalized.T) },
        { ...contourSettings, lines: 12 },
        false,
      );
      expect(result.svg).toContain('<path');
      expect(result.svg).not.toMatch(/NaN|Infinity/);
      expect(result.toolpaths.length).toBeGreaterThan(0);
      const topology = getMeshTopology({ V: mesh.verts, T: mesh.tris });
      expect(topology.boundaryEdges).toHaveLength(0);
      expect(topology.nonManifoldEdges).toHaveLength(0);
      expect(topology.componentCount).toBe(1);
      for (let i = 0; i < mesh.tris.length; i += 3) {
        const [a, b, c] = Array.from(mesh.tris.slice(i, i + 3), (v) =>
          Array.from(mesh.verts.slice(v * 3, v * 3 + 3)),
        );
        const u = b.map((v, j) => v - a[j]);
        const v = c.map((v, j) => v - a[j]);
        const normal = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        expect(normal.reduce((sum, n, j) => sum + n * a[j], 0)).toBeGreaterThan(0);
      }
    },
  );

  it('joins two distinct lobes through a narrower nonzero waist', () => {
    const mesh = roundedDemo('twin-balls', 32, 24);
    let waist = 0;
    let lobe = 0;
    for (let i = 0; i < mesh.verts.length; i += 3) {
      const radius = Math.hypot(mesh.verts[i], mesh.verts[i + 1]);
      if (Math.abs(mesh.verts[i + 2]) < 1e-8) waist = Math.max(waist, radius);
      else lobe = Math.max(lobe, radius);
    }
    expect(waist).toBeGreaterThan(0.3);
    expect(lobe).toBeGreaterThan(waist * 1.2);
  });
});

describe('sphere-based demo solid orientation', () => {
  it.each(['cube', 'ripple', 'diamond'] as const)('audits the outward-facing %s source', (kind) => {
    const source = weld(sphereDemo(kind, 24, 12));
    const report = auditPrintTopology(source);
    expect(report.signedVolumeMm3).toBeGreaterThan(0);
    expect(report.status).toBe('topology-checked');
  });
});
