// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ControlLabel,
  InkColorControl,
  RandomLock,
  RandomLockActions,
  SelectControl,
  ValueControl,
} from './FormControls';

describe('shared control labels', () => {
  it('uses the same label structure for selects and custom control rows', () => {
    const { container } = render(
      <>
        <SelectControl
          id="waveform"
          label="Waveform"
          defaultValue="sine"
          disabled
          disabledReason="Turn on slice modulation to choose a waveform."
        >
          <option value="sine">Sine</option>
        </SelectControl>
        <div className="control-row">
          <ControlLabel htmlFor="dimensions">Dimensions</ControlLabel>
          <input id="dimensions" />
        </div>
      </>,
    );

    const labels = screen.getAllByText(/Waveform|Dimensions/);
    expect(labels).toHaveLength(2);
    labels.forEach((label) => expect(label.parentElement).toHaveClass('control-label'));
    expect(screen.getByRole('combobox', { name: 'Waveform' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Waveform' })).toHaveAttribute(
      'title',
      'Turn on slice modulation to choose a waveform.',
    );
    expect(container.querySelector('.control-row.is-disabled')).toBeInTheDocument();
  });
});

describe('randomization locks', () => {
  it('toggles individually and restores lock state after a bulk override', async () => {
    const user = userEvent.setup();
    render(
      <>
        <RandomLock id="first" label="First" />
        <RandomLock id="second" label="Second" />
        <RandomLockActions />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Lock First randomization' }));
    expect(screen.getByRole('button', { name: 'Unlock First randomization' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Lock Second randomization' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: /^Lock all$/i }));
    expect(screen.getByRole('button', { name: 'Unlock First randomization' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock Second randomization' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Restore locks/i }));
    expect(screen.getByRole('button', { name: 'Unlock First randomization' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lock Second randomization' })).toBeInTheDocument();
  });
});

describe('ValueControl morph contract', () => {
  it('explains why both inputs are disabled', () => {
    render(
      <ValueControl
        id="amount"
        label="Amount"
        min="0"
        max="100"
        step="1"
        value="50"
        disabled
        disabledReason="Turn on the effect to edit its amount."
      />,
    );

    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveAttribute(
      'title',
      'Turn on the effect to edit its amount.',
    );
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveAttribute(
      'title',
      'Turn on the effect to edit its amount.',
    );
  });

  it('keeps an enabled number field compact next to a long unit', () => {
    const { container } = render(
      <ValueControl
        id="centre"
        label="Centre X"
        min="-100"
        max="100"
        step="1"
        value="0"
        unit="% radius"
      />,
    );

    expect(screen.getByRole('slider', { name: 'Centre X' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Centre X in % radius' })).toBeEnabled();
    expect(container.querySelector('.value-field')).toHaveTextContent('%R');
    expect(container.querySelector('.unit')).toHaveAttribute('title', '% radius');
  });

  it('cycles through X and Y targets and publishes clamped values', async () => {
    const user = userEvent.setup();
    const onMorph = vi.fn();
    document.addEventListener('morphchange', onMorph);
    render(
      <>
        <input id="morphSecondEnabled" type="checkbox" defaultChecked />
        <ValueControl id="scale" label="Scale" min="0" max="10" step="1" value="5" />
      </>,
    );

    await user.click(screen.getByRole('button', { name: /Scale morph mode: none/i }));
    expect(screen.getByRole('spinbutton', { name: 'Scale morph X target' })).toHaveValue(5);

    const xTarget = screen.getByRole('spinbutton', { name: 'Scale morph X target' });
    await user.clear(xTarget);
    await user.type(xTarget, '14');
    const xEvent = onMorph.mock.calls.at(-1)?.[0] as CustomEvent;
    expect(xEvent.detail).toEqual({ id: 'scale', dimension: 1, active: true, value: 10 });

    await user.click(screen.getByRole('button', { name: /Scale morph mode: X only/i }));
    expect(screen.getByRole('spinbutton', { name: 'Scale morph Y target' })).toHaveValue(5);

    act(() =>
      document.dispatchEvent(
        new CustomEvent('morphseconddimension', { detail: { enabled: false } }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('spinbutton', { name: 'Scale morph Y target' }),
      ).not.toBeInTheDocument(),
    );
    document.removeEventListener('morphchange', onMorph);
  });

  it('restores both morph dimensions from parameter history', async () => {
    render(
      <>
        <input id="morphSecondEnabled" type="checkbox" defaultChecked />
        <ValueControl id="angle" label="Angle" min="-180" max="180" step="1" value="0" />
      </>,
    );

    act(() =>
      document.dispatchEvent(
        new CustomEvent('restoreparameters', {
          detail: { morphTargetsById: { angle: 45 }, morphTargets2ById: { angle: -30 } },
        }),
      ),
    );

    expect(await screen.findByRole('spinbutton', { name: 'Angle morph X target' })).toHaveValue(45);
    expect(screen.getByRole('spinbutton', { name: 'Angle morph Y target' })).toHaveValue(-30);
    expect(screen.getByRole('button', { name: /Angle morph mode: X and Y/i })).toHaveAttribute(
      'data-morph-dimension',
      '2',
    );
  });
});

describe('colour morph contract', () => {
  it('publishes only complete six-digit hex targets', async () => {
    const user = userEvent.setup();
    const onMorph = vi.fn();
    document.addEventListener('morphchange', onMorph);
    render(<InkColorControl />);

    await user.click(screen.getByRole('button', { name: /Ink colour morph mode: none/i }));
    onMorph.mockClear();
    const target = screen.getByRole('textbox', { name: 'Ink colour morph X target hex value' });
    await user.clear(target);
    await user.type(target, '#12345');
    expect(onMorph).not.toHaveBeenCalled();

    await user.type(target, '6');
    const event = onMorph.mock.calls.at(-1)?.[0] as CustomEvent;
    expect(event.detail).toEqual({ id: 'color', dimension: 1, active: true, value: '#123456' });
    document.removeEventListener('morphchange', onMorph);
  });
});
