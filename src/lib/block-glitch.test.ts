import { describe, expect, it } from 'vitest';
import {
  applyBlockGlitch,
  resolveGlitchBlocks,
  type BlockGlitchSettings,
  type ResolvedGlitchBlock,
} from './block-glitch';

const settings: BlockGlitchSettings = {
  blockGlitch: true,
  blockGlitchCount: 3,
  blockGlitchWidth: 18,
  blockGlitchHeight: 6,
  blockGlitchDisplacement: 8,
  blockGlitchDirection: 'horizontal',
  blockGlitchClearDestination: false,
  blockGlitchSeed: 1,
};

describe('block glitch regions', () => {
  it('resolves deterministic regions inside the drawable artboard', () => {
    const first = resolveGlitchBlocks(settings, 210, 297, 14);
    const second = resolveGlitchBlocks(settings, 210, 297, 14);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    for (const block of first) {
      expect(block.left).toBeGreaterThanOrEqual(14);
      expect(block.top).toBeGreaterThanOrEqual(14);
      expect(block.right).toBeLessThanOrEqual(196);
      expect(block.bottom).toBeLessThanOrEqual(283);
      expect(block.dy).toBe(0);
      expect(Math.abs(block.dx)).toBeLessThanOrEqual(8);
    }
  });

  it('supports vertical and unconstrained displacement', () => {
    const vertical = resolveGlitchBlocks(
      { ...settings, blockGlitchDirection: 'vertical' },
      100,
      100,
    );
    const both = resolveGlitchBlocks({ ...settings, blockGlitchDirection: 'both' }, 100, 100);

    expect(vertical.every((block) => block.dx === 0 && block.dy !== 0)).toBe(true);
    expect(both.some((block) => block.dx !== 0 && block.dy !== 0)).toBe(true);
  });
});

describe('block glitch geometry', () => {
  const block: ResolvedGlitchBlock = {
    left: 4,
    top: 0,
    right: 6,
    bottom: 10,
    dx: 3,
    dy: 0,
  };

  it('cuts a source patch and translates its real polyline fragments', () => {
    expect(applyBlockGlitch([[0, 5, 10, 5]], [block])).toEqual([
      [0, 5, 4, 5],
      [6, 5, 10, 5],
      [7, 5, 9, 5],
    ]);
  });

  it('optionally clears original geometry under the destination', () => {
    expect(applyBlockGlitch([[0, 5, 12, 5]], [block], true)).toEqual([
      [0, 5, 4, 5],
      [6, 5, 7, 5],
      [9, 5, 12, 5],
      [7, 5, 9, 5],
    ]);
  });

  it('samples overlapping blocks from immutable source geometry', () => {
    const second = { ...block, left: 5, right: 7, dx: -3 };
    const result = applyBlockGlitch([[0, 5, 10, 5]], [block, second]);

    expect(result).toContainEqual([7, 5, 9, 5]);
    expect(result).toContainEqual([2, 5, 4, 5]);
    expect(result.flat().every(Number.isFinite)).toBe(true);
  });

  it('is a cloning no-op when no blocks are active', () => {
    const source = [[0, 0, 10, 10]];
    const result = applyBlockGlitch(source, []);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result[0]).not.toBe(source[0]);
  });
});
