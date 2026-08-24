// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Section } from './section';

describe('Section', () => {
  it('presents an informative, collapsible group', async () => {
    const user = userEvent.setup();
    render(
      <Section title="Contours" description="Shape the slices." badge="03">
        <label htmlFor="lines">Line count</label>
        <input id="lines" />
      </Section>,
    );

    const group = screen.getByText('Contours').closest('details');
    expect(group).not.toHaveAttribute('open');
    expect(screen.getByText('Shape the slices.')).toBeInTheDocument();

    await user.click(screen.getByText('Contours'));
    expect(group).toHaveAttribute('open');
    expect(screen.getByLabelText('Line count')).toBeInTheDocument();
  });

  it('summarizes active locks and morph targets in the header', async () => {
    render(
      <Section title="Appearance" description="Style the output.">
        <button className="random-lock" aria-pressed="false">
          Lock stroke
        </button>
        <button className="morph-toggle" aria-pressed="false">
          Morph stroke
        </button>
      </Section>,
    );

    screen.getByRole('button', { name: 'Lock stroke' }).setAttribute('aria-pressed', 'true');
    screen.getByRole('button', { name: 'Morph stroke' }).setAttribute('aria-pressed', 'true');

    await waitFor(() => {
      expect(screen.getByLabelText('1 locked parameter in this group')).toBeInTheDocument();
      expect(screen.getByLabelText('1 active morph target in this group')).toBeInTheDocument();
    });
  });
});
