// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppearancePanel } from './OutputPanel';

describe('OutputPanel line-weight controls', () => {
  it('exposes randomization locks and numeric morph controls', () => {
    render(<AppearancePanel />);

    expect(
      screen.getByRole('button', { name: 'Lock Line-weight variation randomization' }),
    ).toBeInTheDocument();
    for (const label of ['Interval', 'Variation']) {
      expect(
        screen.getByRole('button', { name: `Lock ${label} randomization` }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `${label} morph mode: none` })).toBeInTheDocument();
    }
  });
});
