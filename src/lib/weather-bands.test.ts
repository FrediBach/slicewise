import { expect, it } from 'vitest';
import { weatherBandFills, weatherPalette, resolveWeatherColors } from './weather-bands';

it('layers nested opaque bands from largest to smallest without changing source runs', () => {
  const groups = [
    { color: '#8e0152', runs: [[2, 2, 3, 2, 3, 3, 2, 3, 2, 2]] },
    { color: '#e6f5d0', runs: [[0, 0, 5, 0, 5, 5, 0, 5, 0, 0]] },
  ];
  const original = structuredClone(groups);
  const result = weatherBandFills(groups);
  expect(result.paths).toBe(2);
  expect(result.svg.indexOf('#e6f5d0')).toBeLessThan(result.svg.indexOf('#8e0152'));
  expect(weatherBandFills(groups)).toEqual(result);
  expect(groups).toEqual(original);
});

it('does not fill open, degenerate, malformed, or non-finite paths', () => {
  expect(
    weatherBandFills([
      {
        color: '#276419',
        runs: [
          [0, 0, 5, 0, 5, 5, 0, 5],
          [0, 0, 1, 0, 2, 0, 0, 0],
          [0, 0, NaN, 2, 3, 3, 0, 0],
          [0, 0, 2, 0, 2, 2, 0, 0, 0],
        ],
      },
    ]),
  ).toEqual({ svg: '', paths: 0, nodes: 0 });
});

it('blends eleven bands through the exact chosen endpoints and midpoint', () => {
  const colors = {
    weatherLowColor: '#000000',
    weatherMidColor: '#646464',
    weatherHighColor: '#c8c8c8',
  };
  const palette = weatherPalette(colors);
  expect(palette).toHaveLength(11);
  expect(palette[0]).toBe('#000000');
  expect(palette[1]).toBe('#141414');
  expect(palette[5]).toBe('#646464');
  expect(palette[9]).toBe('#b4b4b4');
  expect(palette[10]).toBe('#c8c8c8');
  expect(weatherPalette(colors)).toEqual(palette);
  expect(
    weatherPalette({
      weatherLowColor: '#123456',
      weatherMidColor: '#123456',
      weatherHighColor: '#123456',
    }),
  ).toEqual(Array(11).fill('#123456'));
});

it('defaults missing or invalid colours and normalizes valid hex values', () => {
  expect(
    resolveWeatherColors({
      weatherLowColor: 'red',
      weatherMidColor: '#xyzxyz',
      weatherHighColor: '#ABCDEF',
    }),
  ).toEqual({
    weatherLowColor: '#276419',
    weatherMidColor: '#ffffff',
    weatherHighColor: '#abcdef',
  });
  expect(weatherPalette({}).every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
});
