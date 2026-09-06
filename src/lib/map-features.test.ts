import { describe, expect, it } from 'vitest';
import { createMapFeatures } from './map-features';
import { MAP_DEFAULTS, resolveMapSettings } from './map-settings';
import { createMapAnnotations } from './mapAnnotations';

const domain = {
  width: 160,
  height: 140,
  margin: 6,
  runs: [[10, 10, 150, 10, 150, 130, 10, 130, 10, 10]],
};
const empty = {
  ...MAP_DEFAULTS,
  mapBuildings: 0,
  mapLandmarks: 0,
  mapWoodland: 0,
  mapRoads: 0,
  mapRivers: 0,
  mapLabels: 0,
  mapElevations: 0,
};
const pairs = [
  ['mapBuildings', 'house'],
  ['mapLandmarks', 'landmark'],
  ['mapWoodland', 'woodland'],
] as const;

describe('configurable map features', () => {
  it.each(pairs)('controls %s independently with deterministic count prefixes', (key, kind) => {
    expect(createMapFeatures(domain, empty)).toEqual([]);
    const few = createMapFeatures(domain, { ...empty, [key]: 2 });
    const many = createMapFeatures(domain, { ...empty, [key]: 4 });
    expect(few).toHaveLength(2);
    expect(many).toHaveLength(4);
    expect(many.slice(0, 2)).toEqual(few);
    expect(many.every((feature) => feature.kind === kind)).toBe(true);
    expect(createMapFeatures(domain, { ...empty, [key]: 4 })).toEqual(many);
    expect(createMapFeatures(domain, { ...empty, [key]: 4, mapSeed: 938 })).not.toEqual(many);
  });

  it('keeps finite symbols and routes inside the contour footprint', () => {
    const features = createMapFeatures(domain, MAP_DEFAULTS);
    expect(features.length).toBeGreaterThan(10);
    for (const feature of features)
      for (const run of feature.runs) {
        expect(run.length % 2).toBe(0);
        expect(run.every(Number.isFinite)).toBe(true);
        for (let i = 0; i < run.length; i += 2) {
          expect(run[i]).toBeGreaterThanOrEqual(10);
          expect(run[i]).toBeLessThanOrEqual(150);
          expect(run[i + 1]).toBeGreaterThanOrEqual(10);
          expect(run[i + 1]).toBeLessThanOrEqual(130);
        }
      }
    expect(createMapFeatures({ ...domain, runs: [] }, MAP_DEFAULTS)).toEqual([]);
    expect(createMapFeatures({ ...domain, runs: [[1, 1, 2, 2, 3, 3]] }, MAP_DEFAULTS)).toEqual([]);
  });

  it('enlarges symbols without changing their seeded anchor', () => {
    const small = createMapFeatures(domain, { ...empty, mapLandmarks: 1, mapSymbolScale: 50 })[0];
    const big = createMapFeatures(domain, { ...empty, mapLandmarks: 1, mapSymbolScale: 150 })[0];
    expect(big.anchor).toEqual(small.anchor);
    expect(big.masks[0].width).toBeCloseTo(small.masks[0].width * 3);
  });

  it.each([0, 1, 938])(
    'mixes single trees and groves with compact clearances (seed %s)',
    (mapSeed) => {
      const features = createMapFeatures(domain, { ...empty, mapWoodland: 5, mapSeed });
      expect(features).toHaveLength(5);
      const singles = features.filter((feature) => feature.runs.length === 2);
      const groves = features.filter((feature) => feature.runs.length === 6);
      expect(singles.length).toBeGreaterThan(0);
      expect(groves.length).toBeGreaterThan(0);
      expect(singles.length + groves.length).toBe(5);
      for (const tree of singles) {
        expect(tree.name).toMatch(/ TREE$/);
        expect(tree.masks[0].width).toBeLessThan(groves[0].masks[0].width);
        expect(tree.masks[0].height).toBeLessThan(groves[0].masks[0].height);
      }
    },
  );

  it('removes all annotations at zero and shares feature geometry with SVG', () => {
    const options = {
      ...domain,
      lineCount: 40,
      strokeWidth: 0.2,
      color: '#000000',
      backgroundColor: '#ffffff',
      title: 'map',
      levels: [0.5],
      map: empty,
    };
    const none = createMapAnnotations(domain.runs, options);
    expect(none.runs).toEqual([]);
    expect(none.masks).toEqual([]);
    const map = createMapAnnotations(domain.runs, {
      ...options,
      map: { ...empty, mapBuildings: 3, mapLandmarks: 3 },
    });
    expect(map.svg.match(/data-map-feature="house"/g)).toHaveLength(3);
    expect(map.svg.match(/data-map-feature="landmark"/g)).toHaveLength(3);
    expect(map.runs).toEqual(map.features.flatMap((feature) => feature.runs));
    expect(map.masks.length).toBeGreaterThan(0);
  });

  it('caps counts and label budgets, and sanitizes invalid saved values', () => {
    expect(
      resolveMapSettings({ mapBuildings: Infinity, mapRoads: -20, mapLabels: 999, mapSeed: 1.7 }),
    ).toMatchObject({
      mapBuildings: MAP_DEFAULTS.mapBuildings,
      mapRoads: 0,
      mapLabels: 24,
      mapSeed: 2,
    });
    const map = createMapAnnotations(domain.runs, {
      ...domain,
      lineCount: 50,
      strokeWidth: 0.2,
      color: '#000000',
      backgroundColor: '#ffffff',
      title: 'map',
      levels: [0.5],
      map: { ...MAP_DEFAULTS, mapLabels: 2, mapElevations: 0 },
    });
    expect(map.locations).toHaveLength(2);
    expect(map.altitudes).toEqual([]);
    expect(map.locations.every((name) => name.includes(' '))).toBe(true);
  });
});
