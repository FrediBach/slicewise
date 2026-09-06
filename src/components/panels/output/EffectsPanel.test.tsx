// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EffectsPanel } from './EffectsPanel';

describe('EffectsPanel', () => {
  it('initially collapses every effect while retaining mounted controls and their values', () => {
    const { container } = render(<EffectsPanel />);
    const effects = container.querySelectorAll<HTMLDetailsElement>('.effect-accordion');
    expect(effects).toHaveLength(18);
    for (const effect of effects) {
      expect(effect.open).toBe(false);
      expect(effect.querySelector('input')).not.toBeNull();
    }

    const amount = container.querySelector<HTMLInputElement>('#explodeAmount')!;
    const accordion = amount.closest('details')!;
    accordion.open = true;
    amount.value = '42';
    accordion.open = false;
    accordion.open = true;
    expect(container.querySelector('#explodeAmount')).toBe(amount);
    expect(amount.value).toBe('42');
  });
});
