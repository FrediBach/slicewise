// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContoursPanel } from './ContoursPanel';

describe('ContoursPanel slice-field controls', () => {
  it('offers curved wavefront modes and bounded model-space parameters', () => {
    render(<ContoursPanel />);

    const field = screen.getByRole('combobox', { name: 'Slice field' });
    expect(field).toHaveValue('up');
    expect(field).toHaveTextContent('Spherical wavefront');
    expect(field).toHaveTextContent('Cylindrical wavefront');

    for (const label of ['Centre X', 'Centre Y', 'Centre Z']) {
      expect(screen.getByLabelText(label, { selector: 'input[type="range"]' })).toHaveAttribute(
        'min',
        '-100',
      );
      expect(screen.getByLabelText(label, { selector: 'input[type="range"]' })).toHaveAttribute(
        'max',
        '100',
      );
      expect(screen.getByLabelText(label, { selector: 'input[type="range"]' })).toHaveValue('0');
    }
    expect(
      screen.getByLabelText('Cylinder azimuth', { selector: 'input[type="range"]' }),
    ).toHaveAttribute('min', '-180');
    expect(
      screen.getByLabelText('Cylinder elevation', { selector: 'input[type="range"]' }),
    ).toHaveValue('90');
  });
});
