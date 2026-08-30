import { describe, expect, it } from 'vitest';
import { DEFAULT_GCODE_PROFILE_ID, GCODE_PROFILES, resolveGCodeProfile } from './gcode-profiles';

describe('G-code machine profiles', () => {
  it('defines the official landscape working area for every UUNA TEK 3.0 size', () => {
    expect(
      Object.fromEntries(
        Object.entries(GCODE_PROFILES)
          .filter(([id]) => id.startsWith('uunatek3-'))
          .map(([id, profile]) => [id, profile.workingArea]),
      ),
    ).toEqual({
      'uunatek3-a3': { width: 420, height: 297 },
      'uunatek3-a2': { width: 594, height: 420 },
      'uunatek3-a1': { width: 841, height: 594 },
      'uunatek3-a0': { width: 1189, height: 841 },
    });
  });

  it('uses conservative shared UUNA motion defaults and a rear-left origin', () => {
    for (const profile of Object.values(GCODE_PROFILES).filter(({ id }) => id !== 'generic')) {
      expect(profile).toMatchObject({
        origin: 'rear-left',
        drawFeed: 3000,
        travelFeed: 6000,
        penUp: 0,
        penDown: -3,
        zFeed: 2000,
        capabilities: {
          coordinatedXYZ: true,
          adjustableFixedPenAngle: true,
          zConvention: 'negative-down',
        },
      });
    }
  });

  it('keeps the generic profile on the conservative binary-Z path', () => {
    expect(GCODE_PROFILES.generic.capabilities).toEqual({
      coordinatedXYZ: false,
      adjustableFixedPenAngle: false,
      zConvention: 'positive-up',
    });
  });

  it('resolves the legacy A3 identifier and unknown profiles safely', () => {
    expect(resolveGCodeProfile('uunatek3').id).toBe(DEFAULT_GCODE_PROFILE_ID);
    expect(resolveGCodeProfile('unknown').id).toBe('generic');
  });
});
