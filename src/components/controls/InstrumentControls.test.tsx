// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstrumentChoice, InstrumentFader } from './InstrumentControls';

describe('instrument fader', () => {
  it('commits bounded drafts, allows empty editing, and discards cancelled edits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InstrumentFader label="Amount" ariaLabel="Warp" value={20} min={-100} onChange={onChange} />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Warp' });
    await user.click(input);
    await user.clear(input);
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(input);
    fireEvent.change(input, { target: { value: '-75' } });
    await user.keyboard('{Escape}{Tab}');
    expect(input).toHaveValue(20);
    expect(onChange).not.toHaveBeenCalled();
    await user.click(input);
    fireEvent.change(input, { target: { value: '-500' } });
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(-100);
  });

  it('uses current bounds for sliders and increment buttons and follows external changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <InstrumentFader
        label="Pulses"
        ariaLabel="Pulses"
        value={4}
        max={4}
        unit=""
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Increase Pulses' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Decrease Pulses' }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    rerender(
      <InstrumentFader
        label="Pulses"
        ariaLabel="Pulses"
        value={2}
        max={8}
        unit=""
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('spinbutton')).toHaveValue(2);
    expect(screen.getByRole('slider')).toHaveAttribute('max', '8');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith(7);
    rerender(
      <InstrumentFader
        label="Pulses"
        ariaLabel="Pulses"
        value={2}
        max={8}
        disabled
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('slider')).toBeDisabled();
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease Pulses' })).toBeDisabled();
  });
});

describe('instrument choices', () => {
  it('selects exactly one option and reflects externally selected values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const options = [
      ['forward', 'Forward'],
      ['reverse', 'Reverse'],
    ] as const;
    const { rerender } = render(
      <InstrumentChoice label="Direction" value="forward" options={options} onChange={onChange} />,
    );
    expect(screen.getByRole('radio', { name: 'Direction: Forward' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Direction: Reverse' }));
    expect(onChange).toHaveBeenCalledWith('reverse');
    rerender(
      <InstrumentChoice label="Direction" value="reverse" options={options} onChange={onChange} />,
    );
    expect(screen.getByRole('radio', { name: 'Direction: Reverse' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Direction: Forward' })).not.toBeChecked();
  });
});
