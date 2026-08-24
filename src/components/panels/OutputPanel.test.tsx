// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppearancePanel, EffectsPanel } from './OutputPanel';

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

describe('OutputPanel yarn controls', () => {
  it('exposes randomizable percentage and curl-size controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Yarn cut & curl' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Lines to cut in %' })).toHaveAttribute(
      'max',
      '500',
    );
    expect(screen.getByRole('spinbutton', { name: 'Curl size in %' })).toHaveValue(100);
    expect(
      screen.getByRole('button', { name: 'Lock Lines to cut randomization' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lock Curl size randomization' }),
    ).toBeInTheDocument();
  });
});
