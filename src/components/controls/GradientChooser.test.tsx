// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GradientChooser } from './GradientChooser';

describe('GradientChooser', () => {
  it('adds a stop in the widest gap and publishes normalized stops', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    document.addEventListener('gradientchange', onChange);
    render(<GradientChooser />);

    await user.click(screen.getByRole('button', { name: /add colour stop/i }));

    expect(screen.getAllByRole('button', { name: /remove stop/i })).toHaveLength(7);
    await waitFor(() => {
      const event = onChange.mock.calls.at(-1)?.[0] as CustomEvent;
      expect(event.detail.stops).toContainEqual({ position: 0.7, color: '#06b6d4' });
    });
    document.removeEventListener('gradientchange', onChange);
  });

  it('switches presets and restores externally supplied parameters', async () => {
    const user = userEvent.setup();
    render(<GradientChooser />);

    await user.click(screen.getByRole('button', { name: 'Ocean' }));
    expect(screen.getByRole('button', { name: 'Ocean' })).toHaveClass('active');
    expect(screen.getAllByRole('button', { name: /remove stop/i })).toHaveLength(3);

    document.dispatchEvent(
      new CustomEvent('restoreparameters', {
        detail: {
          gradientStops: [
            { position: 0, color: '#000000' },
            { position: 1, color: '#ffffff' },
          ],
        },
      }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /remove stop/i })).toHaveLength(2),
    );
    expect(screen.getAllByRole('button', { name: /remove stop/i })[0]).toBeDisabled();
  });

  it('preserves a stop identity and focus when its position changes the sort order', () => {
    render(<GradientChooser />);
    const movingStop = screen.getAllByRole('slider')[1] as HTMLInputElement;
    movingStop.focus();

    fireEvent.change(movingStop, { target: { value: '50' } });

    expect(screen.getAllByRole('slider')[2]).toBe(movingStop);
    expect(movingStop.value).toBe('50');
    expect(document.activeElement).toBe(movingStop);
  });

  it('shows a generated custom gradient supplied by the randomizer', async () => {
    render(<GradientChooser />);

    document.dispatchEvent(
      new CustomEvent('setgradient', {
        detail: {
          gradientStops: [
            { position: 0, color: '#336699' },
            { position: 0.5, color: '#aabbcc' },
            { position: 1, color: '#cc8844' },
          ],
        },
      }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /remove stop/i })).toHaveLength(3),
    );
    expect(screen.getByLabelText('Stop 1 colour')).toHaveValue('#336699');
    expect(screen.getByRole('button', { name: 'Rainbow' })).not.toHaveClass('active');
  });

  it('adds and restores line-index colour rules', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    document.addEventListener('lineindexcolorschange', onChange);
    render(<GradientChooser />);

    await user.click(screen.getByRole('button', { name: /add line colour/i }));
    fireEvent.change(screen.getByLabelText('Line index 2'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Line index 2 colour'), {
      target: { value: '#336699' },
    });

    await waitFor(() => {
      const event = onChange.mock.calls.at(-1)?.[0] as CustomEvent;
      expect(event.detail.colors).toContainEqual({
        index: 7,
        color: '#336699',
        series: 'single',
        reverse: false,
      });
    });

    await user.selectOptions(screen.getByLabelText('Line target 2'), 'prime');
    expect(
      screen.getByText('Applies this colour to contours whose indices are prime numbers.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      const event = onChange.mock.calls.at(-1)?.[0] as CustomEvent;
      expect(event.detail.colors).toContainEqual({
        index: 7,
        color: '#336699',
        series: 'prime',
        reverse: false,
      });
    });
    expect(screen.queryByLabelText('Line index 2')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Reverse line target 2'));
    await waitFor(() => {
      const event = onChange.mock.calls.at(-1)?.[0] as CustomEvent;
      expect(event.detail.colors).toContainEqual({
        index: 7,
        color: '#336699',
        series: 'prime',
        reverse: true,
      });
    });

    document.dispatchEvent(
      new CustomEvent('restoreparameters', {
        detail: { lineIndexColors: [{ index: 12, color: '#abcdef' }] },
      }),
    );
    await waitFor(() => expect(screen.getByLabelText('Line index 1')).toHaveValue(12));
    expect(screen.getByLabelText('Line index 1 colour')).toHaveValue('#abcdef');
    expect(screen.getByLabelText('Line target 1')).toHaveValue('single');
    document.removeEventListener('lineindexcolorschange', onChange);
  });
});
