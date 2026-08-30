import { describe, expect, it } from 'vitest';
import { orientPaperSize, paperOrientationForSize } from './paper-orientation';

describe('paper orientation', () => {
  it('orients canonical and already-rotated sizes deterministically', () => {
    expect(orientPaperSize([297, 420], 'portrait')).toEqual([297, 420]);
    expect(orientPaperSize([297, 420], 'landscape')).toEqual([420, 297]);
    expect(orientPaperSize([420, 297], 'portrait')).toEqual([297, 420]);
    expect(orientPaperSize([420, 297], 'landscape')).toEqual([420, 297]);
  });

  it('derives orientation while preserving the requested square fallback', () => {
    expect(paperOrientationForSize(297, 420)).toBe('portrait');
    expect(paperOrientationForSize(420, 297)).toBe('landscape');
    expect(paperOrientationForSize(210, 210, 'landscape')).toBe('landscape');
  });
});
