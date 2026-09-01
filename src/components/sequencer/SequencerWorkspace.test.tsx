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
      color: '#3267c7',
      kind: 'melodic',
      soundVoice: 'pluck',
      oscillator: 'triangle',
      brightness: 62,
      resonance: 5,
      subOscillator: 0,
      attack: 0.004,
      decay: 0.16,
      sustain: 18,
      release: 0.12,
      preset: 'contour-pluck',
      variationTarget: 'off',
      steps: 4,
      pulses: 2,
      clockDivision: '1/16',
      direction: 'forward',
      traversalStart: 0,
      traversalEnd: 100,
      trackPosition: 25,
      modulationSource: 'off',
      modulationAmount: 0,
      contourInfluence: 100,
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
    expect(screen.getByRole('tab', { name: 'Pattern' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Choose each lane’s role/)).toBeInTheDocument();
  });

  it('organizes lane controls into accessible pattern and shape-mapping tabs', async () => {
    const user = userEvent.setup();
    const onMappingVisibility = vi.fn();
    document.addEventListener('sequencermappingvisibilitychange', onMappingVisibility);
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    expect(screen.getByLabelText('Contour pluck lane type')).toBeVisible();
    expect(screen.getByLabelText('Contour pluck slice travel direction')).not.toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Shape mapping' }));

    expect(screen.getByRole('tab', { name: 'Shape mapping' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Contour pluck lane type')).not.toBeVisible();
    expect(screen.getByLabelText('Contour pluck slice travel direction')).toBeVisible();
    expect(screen.getByText(/Choose a distinct point around the contour/)).toBeInTheDocument();
    expect(
      onMappingVisibility.mock.calls.some(
        ([event]) => (event as CustomEvent).detail.active === true,
      ),
    ).toBe(true);
    document.removeEventListener('sequencermappingvisibilitychange', onMappingVisibility);
  });

  it('supports arrow-key tab navigation without moving the transport', () => {
    const onCommand = vi.fn();
    document.addEventListener('sequencercommand', onCommand);
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    const patternTab = screen.getByRole('tab', { name: 'Pattern' });
    patternTab.focus();
    fireEvent.keyDown(patternTab, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Sound' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Sound' })).toHaveAttribute('aria-selected', 'true');
    expect(onCommand).not.toHaveBeenCalled();
    document.removeEventListener('sequencercommand', onCommand);
  });

  it('publishes melodic timbre and envelope edits from the sound tab', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('sequencercommand', onCommand);
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    await user.click(screen.getByRole('tab', { name: 'Sound' }));
    await user.selectOptions(screen.getByLabelText('Contour pluck oscillator waveform'), 'square');
    fireEvent.change(screen.getByLabelText('Contour pluck envelope attack'), {
      target: { value: '0.25' },
    });
    fireEvent.change(screen.getByLabelText('Contour pluck brightness'), {
      target: { value: '80' },
    });

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'lane-oscillator', laneId: 'melody-1', oscillator: 'square' },
      { type: 'lane-attack', laneId: 'melody-1', value: 0.25 },
      { type: 'lane-brightness', laneId: 'melody-1', value: 80 },
    ]);
    document.removeEventListener('sequencercommand', onCommand);
  });

  it('offers the complete synthesized drum set', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('sequencercommand', onCommand);
    render(<SequencerWorkspace />);
    const drumState: SequencerUiState = {
      ...state,
      lanes: [
        {
          ...state.lanes[0],
          kind: 'drum',
          name: 'Rhythm',
          soundVoice: 'kick',
        },
      ],
    };
    act(() =>
      document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: drumState })),
    );

    await user.click(screen.getByRole('tab', { name: 'Sound' }));
    const instrument = screen.getByLabelText('Rhythm drum instrument');
    expect(instrument).toContainHTML('value="rimshot"');
    expect(instrument).toContainHTML('value="high-conga"');
    expect(instrument).toContainHTML('value="crash"');
    expect(instrument).toContainHTML('value="ride"');
    await user.selectOptions(instrument, 'cowbell');

    expect((onCommand.mock.calls.at(-1)?.[0] as CustomEvent).detail).toEqual({
      type: 'lane-drum-voice',
      laneId: 'melody-1',
      voice: 'cowbell',
    });
    document.removeEventListener('sequencercommand', onCommand);
  });

  it('uses the lane color and supports focused randomizing and collapsing', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('sequencercommand', onCommand);
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    const lane = screen
      .getByText('Contour pluck', { selector: 'strong' })
      .closest('.sequencer-lane');
    expect(lane).toHaveStyle({ '--lane-color': '#3267c7' });
    await user.click(
      screen.getByRole('button', { name: 'Randomize Contour pluck pattern settings' }),
    );
    await user.click(screen.getByRole('button', { name: 'Collapse Contour pluck' }));

    expect(screen.getByLabelText('Contour pluck lane type')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Expand Contour pluck' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect((onCommand.mock.calls[0][0] as CustomEvent).detail).toEqual({
      type: 'lane-randomize',
      laneId: 'melody-1',
      section: 'pattern',
    });
    document.removeEventListener('sequencercommand', onCommand);
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
    await user.selectOptions(screen.getByLabelText('Contour pluck clock divider'), '1/8');
    await user.selectOptions(screen.getByLabelText('MIDI export bars'), '8');
    await user.click(screen.getByRole('button', { name: 'MIDI' }));

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'play-toggle' },
      { type: 'seek-step', laneId: 'melody-1', stepIndex: 0 },
      { type: 'lane-mute', laneId: 'melody-1' },
      { type: 'lane-kind', laneId: 'melody-1', kind: 'drum' },
      { type: 'lane-preset', laneId: 'melody-1', preset: 'body-bass' },
      { type: 'lane-variation', laneId: 'melody-1', target: 'accent' },
      { type: 'lane-clock-division', laneId: 'melody-1', division: '1/8' },
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

  it('publishes slice traversal and geometry modulation changes', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    document.addEventListener('sequencercommand', onCommand);
    render(<SequencerWorkspace />);
    act(() => document.dispatchEvent(new CustomEvent('sequencerstatechange', { detail: state })));

    await user.click(screen.getByRole('tab', { name: 'Shape mapping' }));

    await user.selectOptions(
      screen.getByLabelText('Contour pluck slice travel direction'),
      'reverse',
    );
    fireEvent.change(screen.getByLabelText('Contour pluck slice range start'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('Contour pluck slice range end'), {
      target: { value: '80' },
    });
    fireEvent.change(screen.getByLabelText('Contour pluck position around contour'), {
      target: { value: '72' },
    });
    await user.selectOptions(
      screen.getByLabelText('Contour pluck traversal geometry modulation'),
      'roughness',
    );
    fireEvent.change(screen.getByLabelText('Contour pluck traversal modulation amount'), {
      target: { value: '-65' },
    });
    fireEvent.change(screen.getByLabelText('Contour pluck contour influence'), {
      target: { value: '75' },
    });

    expect(onCommand.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { type: 'lane-direction', laneId: 'melody-1', direction: 'reverse' },
      { type: 'lane-traversal-start', laneId: 'melody-1', value: 20 },
      { type: 'lane-traversal-end', laneId: 'melody-1', value: 80 },
      { type: 'lane-track-position', laneId: 'melody-1', value: 72 },
      { type: 'lane-traversal-source', laneId: 'melody-1', source: 'roughness' },
      { type: 'lane-traversal-amount', laneId: 'melody-1', value: -65 },
      { type: 'lane-contour-influence', laneId: 'melody-1', value: 75 },
    ]);
    document.removeEventListener('sequencercommand', onCommand);
  });
});
