import { describe, expect, it } from 'vitest';
import { defaultUunaExpressiveMotion } from './gcode-3d-toolpaths';
import { generateGCode } from './gcode';
import { validateGCode, type GCodeValidationOptions } from './gcode-validation';

const profile: GCodeValidationOptions = {
  width: 100,
  height: 80,
  penUp: 0,
  penDown: -3,
  drawFeed: 3000,
  travelFeed: 6000,
  zFeed: 2000,
};
const serializerProfile = {
  penUp: profile.penUp,
  penDown: profile.penDown,
  drawFeed: profile.drawFeed,
  travelFeed: profile.travelFeed,
  zFeed: profile.zFeed,
};
const coordinatedValidation = (
  overrides: Partial<
    Extract<NonNullable<GCodeValidationOptions['motion']>, { kind: 'coordinated-xyz' }>
  > = {},
): Extract<NonNullable<GCodeValidationOptions['motion']>, { kind: 'coordinated-xyz' }> => ({
  kind: 'coordinated-xyz',
  contactZ: -3,
  maximumPressDepth: 0,
  mode: 'constant',
  penAngle: 90,
  tiltDirection: 0,
  tipCompensation: true,
  zConvention: 'negative-down',
  ...overrides,
});

describe('validateGCode', () => {
  it('simulates valid generated output and reports useful plot statistics', () => {
    const output = generateGCode(
      [
        { color: 'black', runs: [[10, 10, 20, 10, 20, 20]] },
        { color: 'red', runs: [[30, 20, 40, 20]] },
      ],
      profile,
      { ...serializerProfile, origin: 'rear-left', optimizeTravel: false },
    );

    const result = validateGCode(output, profile);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.stats.drawDistance).toBeCloseTo(30);
    expect(result.stats.penChanges).toBe(1);
    expect(result.stats.penLifts).toBe(2);
    expect(result.segments.filter(({ kind }) => kind === 'draw')).toHaveLength(3);
    expect(result.stats.estimatedSeconds).toBeGreaterThan(0);
  });

  it('rejects unsupported, malformed, and post-program commands', () => {
    const result = validateGCode(
      'G21\nG90\nG94\nG1 Z0 F2000\nG2 X1 Y1 F3000\nM2\nG0 X0 Y0 F6000\n',
      profile,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['unsupported-command', 'command-after-end']),
    );
  });

  it('rejects travel with the pen down and coordinates outside the sheet', () => {
    const result = validateGCode(
      [
        'G21',
        'G90',
        'G94',
        'G1 Z0 F2000',
        'G0 X10 Y10 F6000',
        'G1 Z-3 F2000',
        'G0 X101 Y10 F6000',
        'G1 Z0 F2000',
        'G0 X0 Y0 F6000',
        'M2',
      ].join('\n'),
      profile,
    );

    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['unsafe-rapid', 'x-out-of-bounds']),
    );
  });

  it('requires exact setup, configured feeds, known pen heights, and a safe ending', () => {
    const result = validateGCode(
      ['G90', 'G1 Z2 F100', 'G1 X5 Y5 F10', 'M0', 'M2'].join('\n'),
      profile,
    );

    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'setup-incomplete',
        'wrong-feed',
        'unknown-pen-height',
        'pen-not-down',
        'unsafe-pen-change',
        'unsafe-end',
        'not-homed',
      ]),
    );
  });

  it('warns about physically tiny marks without blocking export', () => {
    const result = validateGCode(
      [
        'G21',
        'G90',
        'G94',
        'G1 Z0 F2000',
        'G0 X1 Y1 F6000',
        'G1 Z-3 F2000',
        'G1 X1.01 Y1 F3000',
        'G1 Z0 F2000',
        'G0 X0 Y0 F6000',
        'M2',
      ].join('\n'),
      profile,
    );

    expect(result.valid).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toContain('tiny-draw-segment');
  });

  it('rejects an artboard larger than the selected machine working area', () => {
    const output = generateGCode([], profile, { ...serializerProfile, origin: 'rear-left' });
    const result = validateGCode(output, {
      ...profile,
      machineWidth: 80,
      machineHeight: 60,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'machine-area-exceeded',
        line: 0,
        message: expect.stringContaining('100 × 80 mm artboard'),
      }),
    );
  });

  it('reports duplicate words and missing program termination', () => {
    const result = validateGCode('G21\nG90\nG94\nG1 Z0 Z-3 F2000', profile);

    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['syntax', 'missing-end']),
    );
  });

  it('accepts coordinated XYZ at the configured constant contact height', () => {
    const output = generateGCode([{ color: 'black', runs: [[10, 10, 20, 20]] }], profile, {
      ...serializerProfile,
      origin: 'rear-left',
      motion: {
        kind: 'coordinated-xyz',
        settings: { ...defaultUunaExpressiveMotion(-2.5), enabled: true },
      },
    });
    const result = validateGCode(output, {
      ...profile,
      motion: coordinatedValidation({ contactZ: -2.5 }),
    });

    expect(result.valid).toBe(true);
    expect(result.stats.drawDistance3d).toBeCloseTo(Math.hypot(10, 10));
    expect(result.stats.minimumZ).toBe(-2.5);
    expect(result.stats.maximumZ).toBe(0);
  });

  it('rejects coordinated XYZ in binary mode and non-contact Z in coordinated mode', () => {
    const program = [
      'G21',
      'G90',
      'G94',
      'G1 Z-3 F2000',
      'G1 X5 Y5 Z-2 F3000',
      'G1 Z0 F2000',
      'G0 X0 Y0 F6000',
      'M2',
    ].join('\n');

    expect(validateGCode(program, profile).errors.map(({ code }) => code)).toContain(
      'mixed-axis-motion',
    );
    expect(
      validateGCode(program, {
        ...profile,
        motion: coordinatedValidation(),
      }).errors.map(({ code }) => code),
    ).toContain('z-out-of-draw-range');
  });

  it('tracks tapered pressure and rejects invalid physical setup values', () => {
    const settings = {
      ...defaultUunaExpressiveMotion(-3),
      enabled: true,
      mode: 'tapered' as const,
      maximumPressDepth: 1,
    };
    const output = generateGCode([{ color: 'black', runs: [[10, 10, 20, 10]] }], profile, {
      ...serializerProfile,
      origin: 'rear-left',
      motion: { kind: 'coordinated-xyz', settings },
    });
    const result = validateGCode(output, {
      ...profile,
      motion: coordinatedValidation({ mode: 'tapered', maximumPressDepth: 1 }),
    });

    expect(result.valid).toBe(true);
    expect(result.stats.minimumZ).toBe(-4);
    expect(result.stats.maximumPressure).toBe(1);
    expect(result.stats.maximumZSlope).toBeGreaterThan(0);

    const invalid = validateGCode(output, {
      ...profile,
      motion: coordinatedValidation({
        mode: 'tapered',
        maximumPressDepth: -1,
        penAngle: 5,
        tiltDirection: 360,
      }),
    });
    expect(invalid.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'invalid-press-depth',
        'invalid-pen-angle',
        'invalid-tilt-direction',
      ]),
    );
  });
});
