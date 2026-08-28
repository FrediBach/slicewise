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
    expect(field).toHaveTextContent('Geodesic distance · mesh');
    expect(field).toHaveTextContent('Mesh curvature');

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
    expect(
      screen.getByLabelText('Seed A azimuth', { selector: 'input[type="range"]' }),
    ).toHaveAttribute('min', '-180');
    expect(
      screen.getByLabelText('Seed A elevation', { selector: 'input[type="range"]' }),
    ).toHaveValue('90');
    expect(screen.getByLabelText('Geodesic mode')).toHaveValue('single');
    expect(screen.getByLabelText('Geodesic mode')).toHaveTextContent('Voronoi boundary');
    expect(
      screen.getByLabelText('Seed B azimuth', { selector: 'input[type="range"]' }),
    ).toHaveAttribute('max', '180');
    expect(
      screen.getByLabelText('Seed B elevation', { selector: 'input[type="range"]' }),
    ).toHaveValue('-90');
    expect(screen.getByLabelText('Curvature field')).toHaveValue('gaussian');
    expect(screen.getByLabelText('Curvature field')).toHaveTextContent('Signed mean curvature');
    expect(
      screen.getByLabelText('Field smoothing', { selector: 'input[type="range"]' }),
    ).toHaveValue('2');
    expect(
      screen.getByLabelText('Robust range', { selector: 'input[type="range"]' }),
    ).toHaveAttribute('min', '80');
    expect(screen.getByLabelText('Include zero curvature')).toBeChecked();
  });

  it('keeps runtime-owned field groups and LFO controls mounted with stable defaults', () => {
    render(<ContoursPanel />);

    for (const id of [
      'customAxis',
      'wavefrontControls',
      'cylinderAxisControls',
      'geodesicControls',
      'geodesicSecondSeedControls',
      'curvatureControls',
    ]) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Modulate slice planes')).not.toBeChecked();
    expect(
      screen.getByLabelText('LFO amplitude', { selector: 'input[type="range"]' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Waveform')).toBeDisabled();
    expect(screen.getByLabelText('Modulate LFO')).not.toBeChecked();
    expect(screen.getByLabelText('Mode')).toBeDisabled();
  });
});
