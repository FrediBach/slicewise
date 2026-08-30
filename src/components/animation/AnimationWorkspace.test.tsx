// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnimationModeSwitch, AnimationTimeline } from './AnimationWorkspace';

const animationState = {
  mode: 'animation' as const,
  durationMs: 5000,
  fps: 30,
  loopPreview: true,
  playheadMs: 2500,
  selectedKeyframeId: 'middle',
  playing: false,
  exporting: false,
  videoExportSupportKnown: true,
  videoExportSupported: true,
  videoExportCodec: 'vp9' as const,
  canUndo: true,
  canRedo: false,
  keyframes: [
    { id: 'keyframe-0', timeMs: 0, easingToNext: 'linear' as const },
    { id: 'middle', timeMs: 2500, easingToNext: 'ease-in' as const },
    { id: 'end', timeMs: 5000, easingToNext: 'linear' as const },
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
    expect(screen.getByLabelText('3 keyframes')).toBeInTheDocument();
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

  it('publishes end, duplicate, loop, and easing commands', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );

    await user.click(screen.getByRole('button', { name: 'Jump to animation end' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate selected keyframe' }));
    await user.click(screen.getByRole('checkbox', { name: 'Loop' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Outgoing keyframe easing' }),
      'hold',
    );

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual(
      expect.arrayContaining([
        { type: 'jump-end' },
        { type: 'duplicate' },
        { type: 'loop', enabled: false },
        { type: 'easing', easing: 'hold' },
      ]),
    );
    document.removeEventListener('animationcommand', onCommand);
  });

  it('maps timeline keyboard shortcuts while leaving form fields alone', () => {
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );

    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    fireEvent.keyDown(document, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(document, { key: 'k' });
    fireEvent.keyDown(document, { key: 'z', metaKey: true });
    fireEvent.keyDown(document, { key: 'End' });
    fireEvent.keyDown(screen.getByLabelText('Animation FPS'), { key: 'ArrowRight' });

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'play-toggle' },
      { type: 'step', frames: 10 },
      { type: 'add' },
      { type: 'undo' },
      { type: 'jump-end' },
    ]);
    document.removeEventListener('animationcommand', onCommand);
  });

  it('publishes drag updates for an unprotected keyframe', () => {
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    const { container } = render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );
    const track = container.querySelector<HTMLElement>('.animation-track')!;
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 500 });
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 500,
      right: 500,
      top: 0,
      bottom: 42,
      height: 42,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const marker = screen.getByRole('button', { name: /keyframe at 0:02\.50/i });

    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 250 });
    fireEvent.pointerMove(marker, { pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 400 });

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual(
      expect.arrayContaining([
        { type: 'move', id: 'middle', timeMs: 4000 },
        { type: 'move-end', id: 'middle', timeMs: 4000 },
      ]),
    );
    document.removeEventListener('animationcommand', onCommand);
  });

  it('separates quick scrubbing from the exact scrub-end command', () => {
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );
    const playhead = screen.getByRole('slider', { name: 'Animation playhead' });

    fireEvent.input(playhead, { target: { value: '3200' } });
    fireEvent.pointerUp(playhead, { target: { value: '3200' } });

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'scrub', timeMs: 3200 },
      { type: 'scrub-end', timeMs: 3200 },
    ]);
    document.removeEventListener('animationcommand', onCommand);
  });

  it('starts supported exports and exposes progress cancellation', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );

    await user.click(screen.getByRole('button', { name: 'Export video' }));
    expect((onCommand.mock.calls.at(-1)![0] as CustomEvent).detail).toEqual({ type: 'export' });

    act(() => {
      document.dispatchEvent(
        new CustomEvent('animationstatechange', {
          detail: { ...animationState, exporting: true },
        }),
      );
      document.dispatchEvent(
        new CustomEvent('animationexportprogress', {
          detail: {
            phase: 'rendering',
            frame: 42,
            total: 150,
            elapsedMs: 65_000,
            message: 'Rendering frame 42 / 150',
          },
        }),
      );
    });

    expect(screen.getByText(/Rendering frame 42 \/ 150 · 1:05/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel video export' }));
    expect((onCommand.mock.calls.at(-1)![0] as CustomEvent).detail).toEqual({
      type: 'export-cancel',
    });
    expect(screen.getByLabelText('Animation playhead')).toBeDisabled();
    document.removeEventListener('animationcommand', onCommand);
  });

  it('explains when WebCodecs video export is unavailable', () => {
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(
        new CustomEvent('animationstatechange', {
          detail: {
            ...animationState,
            videoExportSupported: false,
            videoExportCodec: null,
          },
        }),
      ),
    );

    expect(screen.getByRole('button', { name: 'Export video' })).toBeDisabled();
    expect(screen.getByText(/WebCodecs VP9\/VP8 is not supported/)).toBeInTheDocument();
  });
});
