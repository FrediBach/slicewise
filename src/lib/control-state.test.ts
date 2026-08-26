import { describe, expect, it } from 'vitest';
import { setDisabledPair, type DisableableControl } from './control-state';

describe('setDisabledPair', () => {
  it.each([true, false])('keeps both inputs synchronized at %s', (disabled) => {
    const slider: DisableableControl = { disabled: !disabled };
    const number: DisableableControl = { disabled };

    setDisabledPair(slider, number, disabled);

    expect(slider.disabled).toBe(disabled);
    expect(number.disabled).toBe(disabled);
  });
});
