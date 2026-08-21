// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { parseSVG } from './svg-mesh';

const filledRectangle = `
  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">
    <path fill="#000" d="M 0 0 H 100 V 50 H 0 Z" />
  </svg>
`;

describe('parseSVG', () => {
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
});
