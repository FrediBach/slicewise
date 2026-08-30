export type GCodeProfileId =
  'uunatek3-a3' | 'uunatek3-a2' | 'uunatek3-a1' | 'uunatek3-a0' | 'generic';

export type GCodeProfile = {
  id: GCodeProfileId;
  label: string;
  machine: string;
  origin: 'rear-left' | 'bottom-left';
  workingArea: { width: number; height: number } | null;
  drawFeed: number;
  travelFeed: number;
  penUp: number;
  penDown: number;
  zFeed: number;
  note: string;
};

export const DEFAULT_GCODE_PROFILE_ID: GCodeProfileId = 'uunatek3-a3';

const uunaTekProfile = (
  id: Exclude<GCodeProfileId, 'generic'>,
  size: 'A3' | 'A2' | 'A1' | 'A0',
  width: number,
  height: number,
): GCodeProfile => ({
  id,
  label: `UUNA TEK 3.0 · ${size}`,
  machine: `UUNA TEK 3.0 ${size}`,
  origin: 'rear-left',
  workingArea: { width, height },
  drawFeed: 3000,
  travelFeed: 6000,
  penUp: 0,
  penDown: -3,
  zFeed: 2000,
  note: `UUNA TEK ${size} rear-left origin · ${width} × ${height} mm maximum working area · 3 mm pen drop. Set the machine origin at the sheet’s rear-left corner before plotting.`,
});

export const GCODE_PROFILES: Record<GCodeProfileId, GCodeProfile> = {
  'uunatek3-a3': uunaTekProfile('uunatek3-a3', 'A3', 420, 297),
  'uunatek3-a2': uunaTekProfile('uunatek3-a2', 'A2', 594, 420),
  'uunatek3-a1': uunaTekProfile('uunatek3-a1', 'A1', 841, 594),
  'uunatek3-a0': uunaTekProfile('uunatek3-a0', 'A0', 1189, 841),
  generic: {
    id: 'generic',
    label: 'Generic Z-axis plotter',
    machine: 'Generic Z-axis plotter',
    origin: 'bottom-left',
    workingArea: null,
    drawFeed: 1200,
    travelFeed: 3000,
    penUp: 5,
    penDown: 0,
    zFeed: 600,
    note: 'Generic bottom-left origin. Confirm the working area, Z heights, speeds, and origin for your machine before plotting.',
  },
};

/** Resolve persisted legacy A3 values and safely fall back unknown profiles to generic. */
export function resolveGCodeProfile(id: string): GCodeProfile {
  if (id === 'uunatek3') return GCODE_PROFILES[DEFAULT_GCODE_PROFILE_ID];
  return GCODE_PROFILES[id as GCodeProfileId] || GCODE_PROFILES.generic;
}
