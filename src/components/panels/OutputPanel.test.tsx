// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutputPanel } from './OutputPanel';

describe('OutputPanel line-weight controls', () => {
  it('exposes randomization locks and numeric morph controls', () => {
    render(<OutputPanel />);

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
