// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { parseSVG, parseSVGCenterlines } from './svg-mesh';
import { vertexNormals, weld } from './mesh';
import { computeContours } from './contour-engine';
import { contourSettings } from '../test/fixtures/contours';

const filledTriangle = `<svg xmlns="http://www.w3.org/2000/svg" fill="none"><path d="M103.057 0L206.114 178.5H0L103.057 0Z" fill="black"/></svg>`;

const filledRectangle = `
  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">
    <path fill="#000" d="M 0 0 H 100 V 50 H 0 Z" />
  </svg>
`;

describe('parseSVG', () => {
  it.each([false, true])('creates a closed, outward-facing extrusion (rounded: %s)', (rounded) => {
    const { verts, tris } = parseSVG(filledTriangle, 60, rounded, 25);
    const edges = new Map<string, number>();
    const vertex = (index: number) => Array.from(verts.slice(index * 3, index * 3 + 3));
    let volume = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const [a, b, c] = [vertex(tris[i]), vertex(tris[i + 1]), vertex(tris[i + 2])];
      volume +=
        (a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6;
      for (const [start, end] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = `${start.join(',')}:${end.join(',')}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect(volume).toBeGreaterThan(0);
    for (const [edge, count] of edges) {
      const [a, b] = edge.split(':');
      expect(edges.get(`${b}:${a}`)).toBe(count);
    }
    if (!rounded) expect(volume).toBeCloseTo(((206.114 * 178.5) / 2) * (206.114 * 0.6), 0);
  });

  it('keeps triangle slices straight and identical through the extrusion at every quality', () => {
    const normalized = weld(parseSVG(filledTriangle, 60));
    const mesh = { ...normalized, N: vertexNormals(normalized.V, normalized.T) };
    for (const quality of [1, 3, 10]) {
      const result = computeContours(
        mesh,
        { ...contourSettings, quality, el: 90, hide: false, sil: false },
        false,
      );
      const runs = result.toolpaths.flatMap((group) => group.runs);
      expect(runs).toHaveLength(contourSettings.lines);
      const bounds = runs.map((run) => {
        const xs = run.filter((_, i) => i % 2 === 0);
        const ys = run.filter((_, i) => i % 2 === 1);
        return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      });
      for (const bound of bounds)
        bound.forEach((value, index) => expect(value).toBeCloseTo(bounds[0][index], 5));
      expect(result.svg).not.toMatch(/\bC[-\d]/);
    }
  });

  it('extrudes filled artwork into finite triangle geometry', () => {
    const mesh = parseSVG(filledRectangle, 20);

    expect(mesh.verts.length).toBeGreaterThan(0);
    expect(mesh.tris).toHaveLength(mesh.verts.length / 3);
    expect(mesh.tris.length % 3).toBe(0);
    expect(Array.from(mesh.verts).every(Number.isFinite)).toBe(true);
    const zValues = Array.from(mesh.verts).filter((_, index) => index % 3 === 2);
    expect(Math.max(...zValues) - Math.min(...zValues)).toBeCloseTo(20, 5);
  });

  it('adds bevel geometry for rounded extrusion', () => {
    const flat = parseSVG(filledRectangle, 20, false);
    const rounded = parseSVG(filledRectangle, 20, true, 50);

    expect(rounded.tris.length).toBeGreaterThan(flat.tris.length);
    expect(Array.from(rounded.verts).every(Number.isFinite)).toBe(true);
  });

  it('ignores unfilled strokes and returns an actionable error', () => {
    const outline = `<svg xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="#000" d="M0 0L10 10"/></svg>`;

    expect(() => parseSVG(outline)).toThrow(/convert strokes to outlines/i);
    expect(() => parseSVG('not svg')).toThrow(/No filled shapes/i);
  });

  it('rejects filled artwork without measurable area', () => {
    const point = `<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M1 1Z"/></svg>`;
    expect(() => parseSVG(point)).toThrow(/no measurable filled area|No filled shapes/i);
  });

  it('extracts finite, pruned centerline polylines from filled artwork', () => {
    const centerlines = parseSVGCenterlines(filledRectangle, 2);

    expect(centerlines.offsets.length).toBeGreaterThan(1);
    expect(centerlines.offsets.at(-1)).toBe(centerlines.points.length / 2);
    expect(Array.from(centerlines.points).every(Number.isFinite)).toBe(true);
  });
});
