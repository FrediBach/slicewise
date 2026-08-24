// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
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
});
