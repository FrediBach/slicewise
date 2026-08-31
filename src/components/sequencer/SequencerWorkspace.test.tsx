// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SequencerWorkspace } from './SequencerWorkspace';
import type { SequencerUiState } from './sequencer-ui';

const state: SequencerUiState = {
  mode: 'sequencer',
  playing: false,
  playheadTick: 960,
  bar: 1,
  beat: 2,
  tempo: 110,
  pendingShape: true,
  hasExactSource: true,
  canExport: true,
  exportBars: 4,
  lanes: [
    {
      id: 'melody-1',
      name: 'Contour pluck',
      kind: 'melodic',
      preset: 'contour-pluck',
      variationTarget: 'off',
      steps: 4,
      pulses: 2,
      muted: false,
      solo: false,
      activeStep: 1,
      sequence: [
        {
          index: 0,
          candidateHit: true,
          willFire: true,
          expressive: false,
          value: 0.8,
          label: 'hit, MIDI 60',
        },
        {
          index: 1,
          candidateHit: false,
          willFire: false,
          expressive: false,
          value: 0.4,
          label: 'rest, MIDI 62',
        },
        {
          index: 2,
          candidateHit: true,
          willFire: false,
          expressive: false,
          value: 0.6,
          label: 'hit, MIDI 64',
        },
        {
          index: 3,
          candidateHit: false,
          willFire: false,
          expressive: false,
          value: 0.5,
          label: 'rest, MIDI 67',
        },
      ],
    },
  ],
};

describe('sequencer workspace', () => {
  it('shows transport, pending exact-source state, and accessible lane steps', () => {
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    expect(screen.getByRole('region', { name: 'Contour sequencer' })).toBeInTheDocument();
    expect(screen.getByText('Pending shape · next bar')).toBeInTheDocument();
    expect(screen.getByLabelText('Sequencer position')).toHaveTextContent('Bar 1 · Beat 2.00');
    expect(
      screen.getByRole('button', { name: 'Contour pluck step 2: rest, MIDI 62' }),
    ).toHaveAttribute('aria-current', 'step');
  });

  it('publishes transport and lane editing commands', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('sequencercommand', onCommand);
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    await user.click(screen.getByRole('button', { name: 'Play sequencer' }));
    await user.click(screen.getByRole('button', { name: 'Contour pluck step 1: hit, MIDI 60' }));
    await user.click(screen.getByRole('button', { name: 'Mute' }));
    await user.selectOptions(screen.getByLabelText('Contour pluck lane type'), 'drum');
    await user.selectOptions(screen.getByLabelText('Contour pluck preset'), 'body-bass');
    await user.selectOptions(screen.getByLabelText('Contour pluck variation'), 'accent');
    await user.selectOptions(screen.getByLabelText('MIDI export bars'), '8');
    await user.click(screen.getByRole('button', { name: 'MIDI' }));

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'play-toggle' },
      { type: 'seek-step', laneId: 'melody-1', stepIndex: 0 },
      { type: 'lane-mute', laneId: 'melody-1' },
      { type: 'lane-kind', laneId: 'melody-1', kind: 'drum' },
      { type: 'lane-preset', laneId: 'melody-1', preset: 'body-bass' },
      { type: 'lane-variation', laneId: 'melody-1', target: 'accent' },
      { type: 'export-bars', value: 8 },
      { type: 'export-midi' },
    ]);
    document.removeEventListener('sequencercommand', onCommand);
  });

  it('maps transport shortcuts but leaves form controls alone', () => {
    const onCommand = vi.fn();
    document.addEventListener('sequencercommand', onCommand);
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByLabelText('Sequencer tempo'), { key: 'ArrowRight' });

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'play-toggle' },
      { type: 'step-transport', amount: 1 },
    ]);
    document.removeEventListener('sequencercommand', onCommand);
  });

  it('publishes source-preview interaction for a sequence step', () => {
    const onPreview = vi.fn();
    document.addEventListener('sequencerpreviewchange', onPreview);
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    const step = screen.getByRole('button', { name: 'Contour pluck step 1: hit, MIDI 60' });
    fireEvent.pointerEnter(step);
    fireEvent.pointerLeave(step);

    expect(onPreview.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { laneId: 'melody-1', stepIndex: 0, active: true },
      { active: false },
    ]);
    document.removeEventListener('sequencerpreviewchange', onPreview);
  });
});
