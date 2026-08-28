import { describe, expect, it } from 'vitest';
import { createMisregistrationGroups, type MisregistrationSettings } from './misregistration';

const settings: MisregistrationSettings = {
  misregistration: true,
  misregistrationCopies: 2,
  misregistrationOffset: 2,
  misregistrationRotation: 0,
  misregistrationScope: 'contours',
  misregistrationColor1: '#00a7e1',
  misregistrationColor2: '#ec008c',
  misregistrationColor3: '#ffd400',
};

describe('misregistration copies', () => {
  it('creates symmetric translated physical copies with separate colours', () => {
    const groups = createMisregistrationGroups([[5, 10, 15, 10]], settings, 20, 20);

    expect(groups).toEqual([
      { color: '#00a7e1', label: 'misregistration copy 1', runs: [[7, 10, 17, 10]] },
      { color: '#ec008c', label: 'misregistration copy 2', runs: [[3, 10, 13, 10]] },
    ]);
  });

  it('rotates copies around the artboard centre', () => {
    const [group] = createMisregistrationGroups(
      [[10, 0, 20, 10]],
      {
        ...settings,
        misregistrationCopies: 1,
        misregistrationOffset: 0,
        misregistrationRotation: 5,
      },
      20,
      20,
    );
    const angle = (5 * Math.PI) / 180;

    expect(group.runs[0][0]).toBeCloseTo(10 + 10 * Math.sin(angle));
    expect(group.runs[0][1]).toBeCloseTo(10 - 10 * Math.cos(angle));
    expect(group.runs[0][2]).toBeCloseTo(10 + 10 * Math.cos(angle));
    expect(group.runs[0][3]).toBeCloseTo(10 + 10 * Math.sin(angle));
  });

  it('caps copy count and repairs invalid colours at the pure boundary', () => {
    const groups = createMisregistrationGroups(
      [[0, 0, 1, 1]],
      {
        ...settings,
        misregistrationCopies: 99,
        misregistrationColor1: 'invalid',
      },
      20,
      20,
    );

    expect(groups).toHaveLength(3);
    expect(groups[0].color).toBe('#00a7e1');
    expect(
      groups
        .flatMap((group) => group.runs)
        .flat()
        .every(Number.isFinite),
    ).toBe(true);
  });

  it('returns no copies when disabled or source geometry is empty', () => {
    expect(createMisregistrationGroups([], settings, 20, 20)).toEqual([]);
    expect(
      createMisregistrationGroups([[0, 0, 1, 1]], { ...settings, misregistration: false }, 20, 20),
    ).toEqual([]);
  });
});
