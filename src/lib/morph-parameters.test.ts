import { expect, it } from 'vitest';
import { computeContours } from './contour-engine';
import { contourSettings, makeContourMesh } from '../test/fixtures/contours';

it('interpolates effect colours in RGB and retains distinct exported pen colours', () => {
  const result = computeContours(
    makeContourMesh(),
    {
      ...contourSettings,
      lines: 4,
      misregistration: true,
      misregistrationCopies: 1,
      misregistrationColor1: '#000000',
      morphEnabled: true,
      morphSteps: 3,
      morphTargets: { misregistrationColor1: '#ffffff' },
    },
    false,
  );
  expect(result.svg).toContain('#808080');
  expect(
    new Set(
      result.toolpaths
        .filter((group) => group.label.startsWith('misregistration copy'))
        .map((group) => group.color),
    ),
  ).toEqual(new Set(['#000000', '#808080', '#ffffff']));
});
