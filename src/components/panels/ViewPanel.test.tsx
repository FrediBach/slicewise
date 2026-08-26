// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ViewPanel } from './ViewPanel';

describe('ViewPanel lens and projection controls', () => {
  it('exposes continuous focal-length and signed-distortion sliders', () => {
    render(<ViewPanel />);

    expect(screen.queryByRole('combobox', { name: 'Camera lens' })).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Focal length' })).toHaveAttribute('min', '8');
    expect(screen.getByRole('slider', { name: 'Focal length' })).toHaveAttribute('max', '300');
    expect(screen.getByRole('slider', { name: 'Perspective' })).toHaveAttribute('min', '0');
    expect(screen.getByRole('slider', { name: 'Perspective' })).toHaveAttribute('max', '100');
    expect(screen.getByRole('slider', { name: 'Perspective' })).toHaveValue('0');
    expect(screen.getByRole('slider', { name: 'Klein ↔ Poincaré' })).toHaveAttribute('min', '0');
    expect(screen.getByRole('slider', { name: 'Klein ↔ Poincaré' })).toHaveAttribute('max', '100');
    expect(screen.getByRole('slider', { name: 'Klein ↔ Poincaré' })).toHaveValue('0');
    expect(screen.getByRole('slider', { name: 'Lens distortion' })).toHaveAttribute('min', '-100');
    expect(screen.getByRole('slider', { name: 'Lens distortion' })).toHaveAttribute('max', '100');
  });

  it('exposes projection modes and bounded Mobius parameters with neutral defaults', () => {
    render(<ViewPanel />);

    const mode = screen.getByRole('combobox', { name: 'Projection warp' });
    expect(mode).toHaveValue('none');
    expect(mode).toHaveTextContent('None');
    expect(mode).toHaveTextContent('Klein ↔ Poincaré');
    expect(mode).toHaveTextContent('Hyperbolic Möbius');
    expect(mode).toHaveTextContent('Spherical · stereographic');
    expect(mode).toHaveTextContent('Spherical · gnomonic');
    expect(mode).toHaveTextContent('Spherical · Lambert equal-area');
    expect(mode).toHaveTextContent('Circle inversion');

    expect(screen.getByRole('slider', { name: 'Hyperbolic direction' })).toHaveAttribute(
      'min',
      '-180',
    );
    expect(screen.getByRole('slider', { name: 'Hyperbolic direction' })).toHaveAttribute(
      'max',
      '180',
    );
    expect(screen.getByRole('slider', { name: 'Hyperbolic displacement' })).toHaveAttribute(
      'max',
      '95',
    );
    expect(screen.getByRole('slider', { name: 'Hyperbolic displacement' })).toHaveValue('0');
    expect(screen.getByRole('slider', { name: 'Hyperbolic rotation' })).toHaveValue('0');
    expect(screen.getByRole('slider', { name: 'Warp strength' })).toHaveValue('100');
    expect(screen.getByRole('slider', { name: 'Spherical strength' })).toHaveValue('100');
    expect(screen.getByRole('slider', { name: 'Inversion centre X' })).toHaveAttribute(
      'min',
      '-100',
    );
    expect(screen.getByRole('slider', { name: 'Inversion centre Y' })).toHaveAttribute(
      'max',
      '100',
    );
    expect(screen.getByRole('slider', { name: 'Inversion radius' })).toHaveValue('50');
    expect(screen.getByRole('slider', { name: 'Inversion strength' })).toHaveValue('100');
  });

  it('allows sub-degree orientation for accurate axonometric views', () => {
    render(<ViewPanel />);

    expect(screen.getByRole('slider', { name: 'Azimuth' })).toHaveAttribute('step', '0.1');
    expect(screen.getByRole('slider', { name: 'Elevation' })).toHaveAttribute('step', '0.1');
  });
});
