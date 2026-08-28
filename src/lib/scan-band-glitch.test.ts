import { describe, expect, it } from 'vitest';
import { type ScanBandGlitchSettings, resolveScanBands } from './scan-band-glitch';

const settings: ScanBandGlitchSettings = {
  scanBandGlitch: true,
  scanBandGlitchCount: 12,
  scanBandGlitchThickness: 55,
  scanBandGlitchDisplacement: 6,
  scanBandGlitchDensity: 50,
  scanBandGlitchOrientation: 'horizontal',
  scanBandGlitchSeed: 2,
};

describe('scan-band glitch regions', () => {
  it('resolves deterministic horizontal bands across the drawable width', () => {
    const first = resolveScanBands(settings, 120, 100, 10);
    const second = resolveScanBands(settings, 120, 100, 10);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    for (const band of first) {
      expect(band.left).toBe(10);
      expect(band.right).toBe(110);
      expect(band.top).toBeGreaterThanOrEqual(10);
      expect(band.bottom).toBeLessThanOrEqual(90);
      expect(band.dy).toBe(0);
      expect(Math.abs(band.dx)).toBeLessThanOrEqual(6);
    }
  });

  it('resolves vertical bands that move along their long axis', () => {
    const bands = resolveScanBands(
      { ...settings, scanBandGlitchOrientation: 'vertical' },
      120,
      100,
      10,
    );

    for (const band of bands) {
      expect(band.top).toBe(10);
      expect(band.bottom).toBe(90);
      expect(band.dx).toBe(0);
      expect(Math.abs(band.dy)).toBeGreaterThan(0);
    }
  });

  it('adds stable bands monotonically as density increases', () => {
    const sparse = resolveScanBands({ ...settings, scanBandGlitchDensity: 20 }, 120, 100, 10);
    const dense = resolveScanBands({ ...settings, scanBandGlitchDensity: 80 }, 120, 100, 10);

    expect(dense.length).toBeGreaterThanOrEqual(sparse.length);
    for (const band of sparse) expect(dense).toContainEqual(band);
  });

  it('keeps one selected band at the minimum density', () => {
    expect(resolveScanBands({ ...settings, scanBandGlitchDensity: 1 }, 120, 100, 10)).toHaveLength(
      1,
    );
  });

  it('returns no regions when disabled', () => {
    expect(resolveScanBands({ ...settings, scanBandGlitch: false }, 120, 100, 10)).toEqual([]);
  });
});
