import { describe, expect, it } from 'vitest';
import {
  clearSurfacePlanePreset,
  defaultSurfacePlane,
  loadSurfacePlanePreset,
  saveSurfacePlanePreset,
} from './gcode-surface-presets';

function memoryStorage(): Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('UUNA surface-plane presets', () => {
  it('stores isolated calibration planes by machine profile', () => {
    const storage = memoryStorage();
    const plane = { ...defaultSurfacePlane(420, 297), xOffset: 0.4 };
    saveSurfacePlanePreset('uunatek3-a3', plane, storage);

    expect(loadSurfacePlanePreset('uunatek3-a3', storage)).toEqual(plane);
    expect(loadSurfacePlanePreset('uunatek3-a2', storage)).toBeNull();
    clearSurfacePlanePreset('uunatek3-a3', storage);
    expect(loadSurfacePlanePreset('uunatek3-a3', storage)).toBeNull();
  });

  it('rejects malformed and unsafe stored dimensions', () => {
    const storage = memoryStorage();
    storage.setItem(
      'slicewise:uuna-surface-plane:v1:bad',
      JSON.stringify({ ...defaultSurfacePlane(1, 1), width: 0 }),
    );
    expect(loadSurfacePlanePreset('bad', storage)).toBeNull();
  });
});
