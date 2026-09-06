// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourcePanel } from './SourcePanel';

describe('SourcePanel hyperbolic tiling controls', () => {
  it('offers a bounded deterministic tiling source', () => {
    render(<SourcePanel />);

    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('Hyperbolic tiling');
    expect(screen.getByRole('slider', { name: 'Polygon sides', hidden: true })).toHaveValue('7');
    expect(screen.getByRole('slider', { name: 'Polygons per vertex', hidden: true })).toHaveValue(
      '3',
    );
    expect(screen.getByRole('slider', { name: 'Generation depth', hidden: true })).toHaveAttribute(
      'max',
      '6',
    );
    expect(screen.getByRole('slider', { name: 'Disk scale', hidden: true })).toHaveValue('92');
    expect(screen.getByRole('slider', { name: 'Disk scale', hidden: true })).toHaveAttribute(
      'max',
      '100',
    );
  });
});

it('offers terrain independently from implicit meshes with dedicated controls', () => {
  render(<SourcePanel />);
  expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('Generative terrain');
  expect(document.querySelector('#genField')).not.toHaveTextContent('Relief');
  expect(screen.getByRole('slider', { name: 'Terrain seed', hidden: true })).toHaveValue('7');
  expect(screen.getByRole('slider', { name: 'Vertical relief', hidden: true })).toHaveValue('55');
  expect(screen.getByRole('slider', { name: 'Erosion', hidden: true })).toHaveValue('40');
});
