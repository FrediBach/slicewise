/** Shared bounds/defaults for the map effect, its UI, and saved settings. */
export const MAP_CONTROLS = [
  { id: 'mapSeed', label: 'Map seed', min: 0, max: 9999, value: 1, group: 'Layout' },
  { id: 'mapSymbolScale', label: 'Symbol size', min: 50, max: 200, value: 100, group: 'Layout' },
  { id: 'mapBuildings', label: 'Houses', min: 0, max: 100, value: 12, group: 'Features' },
  { id: 'mapLandmarks', label: 'Landmarks', min: 0, max: 20, value: 4, group: 'Features' },
  { id: 'mapWoodland', label: 'Trees & woodland', min: 0, max: 30, value: 5, group: 'Features' },
  { id: 'mapRoads', label: 'Roads', min: 0, max: 8, value: 2, group: 'Water & routes' },
  { id: 'mapRivers', label: 'Rivers', min: 0, max: 6, value: 1, group: 'Water & routes' },
  { id: 'mapLabels', label: 'Place labels', min: 0, max: 24, value: 6, group: 'Lettering' },
  { id: 'mapElevations', label: 'Elevation labels', min: 0, max: 20, value: 8, group: 'Lettering' },
  { id: 'mapTextScale', label: 'Text size', min: 50, max: 200, value: 100, group: 'Lettering' },
  {
    id: 'mapIndexEvery',
    label: 'Index contour interval',
    min: 0,
    max: 20,
    value: 5,
    group: 'Lettering',
  },
] as const;
export type MapSettings = { [K in (typeof MAP_CONTROLS)[number]['id']]: number };
export const MAP_DEFAULTS = Object.fromEntries(
  MAP_CONTROLS.map(({ id, value }) => [id, value]),
) as MapSettings;
export function resolveMapSettings(input: Partial<MapSettings> = {}): MapSettings {
  const result = { ...MAP_DEFAULTS };
  for (const { id, min, max } of MAP_CONTROLS) {
    const value = input[id];
    if (typeof value === 'number' && Number.isFinite(value))
      result[id] = Math.round(Math.max(min, Math.min(max, value)));
  }
  return result;
}
