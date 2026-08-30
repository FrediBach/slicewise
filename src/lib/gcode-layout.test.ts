import { describe, expect, it } from 'vitest';
import { resolveGCodeMachineLayout } from './gcode-layout';

const groups = [{ color: 'black', label: 'contours', runs: [[0, 0, 100, 200, 297, 420]] }];
const a3Machine = { width: 420, height: 297 };

describe('resolveGCodeMachineLayout', () => {
  it('rotates a full portrait sheet clockwise when that makes it fit', () => {
    const layout = resolveGCodeMachineLayout(groups, { width: 297, height: 420 }, a3Machine, true);

    expect(layout.rotation).toBe('clockwise-90');
    expect(layout.sheet).toEqual({ width: 420, height: 297 });
    expect(layout.groups[0].runs[0]).toEqual([420, 0, 220, 100, 0, 297]);
    expect(groups[0].runs[0]).toEqual([0, 0, 100, 200, 297, 420]);
  });

  it('preserves any layout that already fits the machine', () => {
    const layout = resolveGCodeMachineLayout(groups, { width: 210, height: 297 }, a3Machine, true);

    expect(layout.rotation).toBe('none');
    expect(layout.groups).toBe(groups);
    expect(layout.sheet).toEqual({ width: 210, height: 297 });
  });

  it('does not rotate when disabled or when neither orientation fits', () => {
    expect(
      resolveGCodeMachineLayout(groups, { width: 297, height: 420 }, a3Machine, false).rotation,
    ).toBe('none');
    expect(
      resolveGCodeMachineLayout(groups, { width: 500, height: 600 }, a3Machine, true).rotation,
    ).toBe('none');
  });

  it('does not impose machine rotation on the generic profile', () => {
    expect(
      resolveGCodeMachineLayout(groups, { width: 297, height: 420 }, null, true).rotation,
    ).toBe('none');
  });
});
