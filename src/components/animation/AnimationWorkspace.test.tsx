// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnimationModeSwitch, AnimationTimeline } from './AnimationWorkspace';

// jsdom has no native dialog lifecycle. Emulate opening/closing and initial
// focus; the browser supplies modal focus containment and Escape cancellation.
const dialogMethods = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('select, button')?.focus();
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterAll(() => {
  for (const method of ['showModal', 'close']) {
    if (dialogMethods[method])
      Object.defineProperty(HTMLDialogElement.prototype, method, dialogMethods[method]);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  }
});

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
  exportSettings: { width: 1358, height: 1920, bitrate: 24_000_000 },
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

  it('opens quality settings without exporting, requires confirmation, and exposes cancellation', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );

    expect(screen.queryByLabelText('Video export resolution')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export video' }));
    expect(screen.getByRole('dialog', { name: 'Export video' })).toBeInTheDocument();
    expect(screen.getByLabelText('Video export resolution')).toHaveFocus();
    expect(onCommand).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Start export' }));
    expect((onCommand.mock.calls.at(-1)![0] as CustomEvent).detail).toEqual({ type: 'export' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

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

  it('allows unsupported settings to be corrected before confirming export', async () => {
    const user = userEvent.setup();
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

    expect(screen.getByRole('button', { name: 'Export video' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Export video' }));
    expect(screen.getByRole('button', { name: 'Start export' })).toBeDisabled();
    expect(screen.getByText(/Video export unavailable for these settings/)).toBeInTheDocument();
    expect(screen.getByLabelText('Video export resolution')).toBeEnabled();
    act(() =>
      document.dispatchEvent(
        new CustomEvent('animationstatechange', {
          detail: {
            ...animationState,
            videoExportSupportKnown: false,
          },
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Start export' })).toBeDisabled();
    expect(screen.getByText('Checking video encoder support…')).toBeInTheDocument();
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );
    expect(screen.getByRole('button', { name: 'Start export' })).toBeEnabled();
  });

  it('publishes quality choices inside the dialog and reflects saved settings', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );
    await user.click(screen.getByRole('button', { name: 'Export video' }));
    expect(screen.getByLabelText('Video export resolution')).toHaveValue('1920');
    expect(screen.getByLabelText('Video export bitrate')).toHaveValue('24000000');
    expect(screen.getByLabelText('Video export size')).toHaveTextContent(
      '1358 × 1920 px · ~15.0 MB',
    );
    await user.selectOptions(screen.getByLabelText('Video export resolution'), '3840');
    await user.selectOptions(screen.getByLabelText('Video export bitrate'), '60000000');
    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'export-resolution', longEdge: 3840 },
      { type: 'export-bitrate', bitrate: 60_000_000 },
    ]);
    act(() =>
      document.dispatchEvent(
        new CustomEvent('animationstatechange', {
          detail: {
            ...animationState,
            exportSettings: { width: 722, height: 406, bitrate: 2_500_000 },
          },
        }),
      ),
    );
    expect(screen.getByLabelText('Video export resolution')).toHaveValue('722');
    expect(screen.getByLabelText('Video export bitrate')).toHaveValue('2500000');
    act(() =>
      document.dispatchEvent(
        new CustomEvent('animationstatechange', { detail: { ...animationState, playing: true } }),
      ),
    );
    expect(screen.getByLabelText('Video export resolution')).toBeDisabled();
    expect(screen.getByLabelText('Video export bitrate')).toBeDisabled();
    act(() =>
      document.dispatchEvent(
        new CustomEvent('animationstatechange', { detail: { ...animationState, exporting: true } }),
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    document.removeEventListener('animationcommand', onCommand);
  });

  it('dismisses with Cancel or Escape, restores focus, and suppresses timeline shortcuts', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(new CustomEvent('animationstatechange', { detail: animationState })),
    );
    const opener = screen.getByRole('button', { name: 'Export video' });
    for (const dismiss of ['button', 'escape']) {
      await user.click(opener);
      fireEvent.keyDown(document, { code: 'Space', key: ' ' });
      fireEvent.keyDown(document, { key: 'k' });
      if (dismiss === 'button') await user.click(screen.getByRole('button', { name: 'Cancel' }));
      else fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    }
    expect(onCommand).not.toHaveBeenCalled();
    document.removeEventListener('animationcommand', onCommand);
  });

  it('pauses playback when opening export settings without starting an export', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('animationcommand', onCommand);
    render(<AnimationTimeline />);
    act(() =>
      document.dispatchEvent(
        new CustomEvent('animationstatechange', { detail: { ...animationState, playing: true } }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Export video' }));
    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'play-toggle' },
    ]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    document.removeEventListener('animationcommand', onCommand);
  });
});
