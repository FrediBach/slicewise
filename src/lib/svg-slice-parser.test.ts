// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { parseSVGSlicePaths } from './svg-mesh';
it('preserves open strokes and closed compound subpaths with transforms', () => {
  const paths = parseSVGSlicePaths(
    '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10 20)"><path d="M0 0L10 0L10 10Z M2 2L4 2L4 4Z"/><path fill="none" d="M0 5L10 5"/></g></svg>',
  );
  expect(paths).toHaveLength(3);
  expect(paths[0].slice(0, 2)).toEqual(paths[0].slice(-2));
  expect(paths[1].slice(0, 2)).toEqual(paths[1].slice(-2));
  expect(paths[2]).toEqual([-1, 0, 1, 0]);
});
it('rejects empty artwork', () =>
  expect(() => parseSVGSlicePaths('<svg/>')).toThrow('No measurable'));
