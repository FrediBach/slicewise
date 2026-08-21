// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutputPanel } from './OutputPanel';

describe('OutputPanel', () => {
  it('gives both artboard dimension inputs accessible names', () => {
    render(<OutputPanel />);

    expect(screen.getByRole('spinbutton', { name: 'Artboard width' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Artboard height' })).toBeInTheDocument();
  });
});
