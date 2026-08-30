// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnimationModeSwitch, AnimationTimeline } from './AnimationWorkspace';

const animationState = {
  mode: 'animation' as const,
  durationMs: 5000,
  fps: 30,
  playheadMs: 2500,
  selectedKeyframeId: 'middle',
  playing: false,
  keyframes: [
    { id: 'keyframe-0', timeMs: 0 },
    { id: 'middle', timeMs: 2500 },
  ],
};

describe('animation workspace controls', () => {
  it('requests a mode change from the main switch', async () => {
    const user = userEvent.setup();
    const onMode = vi.fn();
    document.addEventListener('animationmodechange', onMode);
    render(<AnimationModeSwitch />);

    await user.click(screen.getByRole('button', { name: 'Animation' }));

    expect(onMode).toHaveBeenCalledOnce();
    expect((onMode.mock.calls[0][0] as CustomEvent).detail).toEqual({ mode: 'animation' });
    document.removeEventListener('animationmodechange', onMode);
  });

  it('reveals timeline state and publishes transport commands', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);

    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );

    expect(screen.getByRole('region', { name: 'Animation timeline' })).toBeInTheDocument();
    expect(screen.getByText(/0:02.50/)).toBeInTheDocument();
    expect(screen.getByLabelText('2 keyframes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add keyframe' }));
    expect((onCommand.mock.calls.at(-1)![0] as CustomEvent).detail).toEqual({ type: 'add' });
    document.removeEventListener('animationcommand', onCommand);
  });

  it('protects the initial keyframe and permits deleting a later selection', () => {
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(
        new CustomEvent('animationstatechange', {
          detail: { ...animationState, selectedKeyframeId: 'keyframe-0' },
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Delete selected keyframe' })).toBeDisabled();

    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );
    expect(screen.getByRole('button', { name: 'Delete selected keyframe' })).toBeEnabled();
  });
});
