// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ViewPanel } from './ViewPanel';

describe('ViewPanel lens controls', () => {
  it('exposes continuous focal-length and signed-distortion sliders', () => {
    render(<ViewPanel />);

    expect(screen.queryByRole('combobox', { name: 'Camera lens' })).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Focal length' })).toHaveAttribute('min', '8');
    expect(screen.getByRole('slider', { name: 'Focal length' })).toHaveAttribute('max', '300');
    expect(screen.getByRole('slider', { name: 'Perspective' })).toHaveAttribute('min', '0');
    expect(screen.getByRole('slider', { name: 'Perspective' })).toHaveAttribute('max', '100');
    expect(screen.getByRole('slider', { name: 'Perspective' })).toHaveValue('0');
    expect(screen.getByRole('slider', { name: 'Lens distortion' })).toHaveAttribute('min', '-100');
    expect(screen.getByRole('slider', { name: 'Lens distortion' })).toHaveAttribute('max', '100');
  });

  it('allows sub-degree orientation for accurate axonometric views', () => {
    render(<ViewPanel />);

    expect(screen.getByRole('slider', { name: 'Azimuth' })).toHaveAttribute('step', '0.1');
    expect(screen.getByRole('slider', { name: 'Elevation' })).toHaveAttribute('step', '0.1');
  });
});
