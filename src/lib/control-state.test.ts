import { describe, expect, it } from 'vitest';
import { setDisabled, setDisabledPair, type DisableableControl } from './control-state';

describe('setDisabled', () => {
  it('adds a reason only while the control is disabled', () => {
    const control: DisableableControl = { disabled: false, title: '' };

    setDisabled(control, true, 'Turn on the related effect to edit this parameter.');
    expect(control).toEqual({
      disabled: true,
      title: 'Turn on the related effect to edit this parameter.',
    });

    setDisabled(control, false, 'This reason should be cleared.');
    expect(control).toEqual({ disabled: false, title: '' });
  });
});

describe('setDisabledPair', () => {
  it.each([true, false])('keeps both inputs synchronized at %s', (disabled) => {
    const slider: DisableableControl = { disabled: !disabled, title: '' };
    const number: DisableableControl = { disabled, title: '' };

    setDisabledPair(slider, number, disabled, 'A useful reason.');

    expect(slider.disabled).toBe(disabled);
    expect(number.disabled).toBe(disabled);
    expect(slider.title).toBe(disabled ? 'A useful reason.' : '');
    expect(number.title).toBe(disabled ? 'A useful reason.' : '');
  });
});
