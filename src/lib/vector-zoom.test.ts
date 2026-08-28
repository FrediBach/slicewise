import { describe, expect, it } from 'vitest';
import { applyVectorZooms, resolveVectorZooms, vectorZoomGuides } from './vector-zoom';

describe('vector zoom', () => {
  it('crops, enlarges, and moves rectangle detail into the selected corner', () => {
    const zooms = resolveVectorZooms(
      {
        vectorZoom1Enabled: true,
        vectorZoom1Shape: 'rectangle',
        vectorZoom1CenterX: 50,
        vectorZoom1CenterY: 50,
        vectorZoom1Width: 20,
        vectorZoom1Height: 20,
        vectorZoom1Corner: 'top-right',
        vectorZoom1Size: 40,
      },
      100,
      100,
      5,
    );
    const result = applyVectorZooms(
      [
        [0, 50, 100, 50],
        [0, 25, 100, 25],
      ],
      zooms,
    );

    expect(zooms).toHaveLength(1);
    expect(zooms[0].scale).toBe(2);
    expect(result).toHaveLength(4);
    expect(result[1][0]).toBe(0);
    expect(result[1].at(-2)).toBeCloseTo(55);
    expect(result[2][0]).toBe(95);
    expect(result[3]).toEqual([55, 25, 95, 25]);
  });

  it('uses circular clipping and emits real dashed guide segments', () => {
    const zooms = resolveVectorZooms(
      {
        vectorZoom1Enabled: true,
        vectorZoom1Shape: 'circle',
        vectorZoom1CenterX: 50,
        vectorZoom1CenterY: 50,
        vectorZoom1Width: 20,
        vectorZoom1Corner: 'bottom-left',
        vectorZoom1Size: 30,
      },
      100,
      100,
      5,
    );
    const result = applyVectorZooms([[0, 50, 100, 50]], zooms);
    const guides = vectorZoomGuides(zooms, 0.35);

    expect(result.some((run) => run[0] === 5 && run[1] === 80)).toBe(true);
    expect(guides.dashedRuns.length).toBeGreaterThan(8);
    expect(guides.outlineRuns).toHaveLength(1);
    expect(guides.outlineRuns[0]).toHaveLength(194);
    for (const value of [...result, ...guides.dashedRuns, ...guides.outlineRuns].flat())
      expect(Number.isFinite(value)).toBe(true);
  });

  it('supports four independent slots and ignores disabled slots', () => {
    const settings = Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => [`vectorZoom${index + 1}Enabled`, index !== 2]),
    );
    const zooms = resolveVectorZooms(settings, 210, 297, 14);

    expect(zooms).toHaveLength(3);
  });

  it('uses the per-zoom edge margin instead of the canvas margin', () => {
    const [zoom] = resolveVectorZooms(
      {
        vectorZoom1Enabled: true,
        vectorZoom1Corner: 'top-right',
        vectorZoom1Width: 20,
        vectorZoom1Height: 20,
        vectorZoom1Size: 40,
        vectorZoom1Margin: 18,
      },
      100,
      100,
      5,
    );

    expect(zoom.target.cx + zoom.target.rx).toBe(82);
    expect(zoom.target.cy - zoom.target.ry).toBe(18);
  });
});
