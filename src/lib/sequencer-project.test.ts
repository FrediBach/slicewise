import { describe, expect, it } from 'vitest';
import {
  applyLanePreset,
  createDrumLane,
  createMelodicLane,
  createSequencerProject,
  drumVoiceDefaults,
  setLaneVariationTarget,
} from './sequencer-project';

describe('sequencer project defaults', () => {
  it('creates a versioned project with deterministic melodic and drum lanes', () => {
    const project = createSequencerProject();

    expect(project.version).toBe(5);
    expect(project.lanes).toEqual([createMelodicLane(), createDrumLane()]);
    expect(project.lanes[0]).toMatchObject({
      kind: 'melodic',
      steps: 16,
      pulses: 5,
      rotation: 'auto',
      traversal: {
        start: 0,
        end: 100,
        trackPosition: 25,
        modulationSource: 'off',
        modulationAmount: 0,
      },
      contourInfluence: 100,
      probability: { mode: 'off' },
      melody: {
        oscillator: 'triangle',
        brightness: 0.62,
        attack: 0.004,
        decay: 0.16,
        sustain: 0.18,
        release: 0.12,
      },
    });
  });

  it('provides General MIDI and choke defaults for the expanded drum kit', () => {
    expect(drumVoiceDefaults('open-hat')).toMatchObject({ midiNote: 46, chokeGroup: 'hats' });
    expect(drumVoiceDefaults('cowbell')).toMatchObject({ midiNote: 56, chokeGroup: null });
    expect(drumVoiceDefaults('crash')).toMatchObject({ midiNote: 49 });
  });

  it('uses an explicit drum-only settings branch', () => {
    const lane = createDrumLane('kick', 'Kick');

    expect(lane.kind).toBe('drum');
    expect(lane.drum).toMatchObject({ voice: 'kick', midiNote: 36 });
    expect('melody' in lane).toBe(false);
  });

  it('applies expressive presets without replacing shared transport state', () => {
    const bass = applyLanePreset(
      { ...createMelodicLane('lead'), steps: 12, phase: 3, muted: true },
      'body-bass',
    );
    const percussion = applyLanePreset(createDrumLane('drums'), 'roughness-percussion');

    expect(bass).toMatchObject({
      id: 'lead',
      name: 'Body bass',
      preset: 'body-bass',
      steps: 12,
      phase: 3,
      muted: true,
      melody: { voice: 'bass', pitchSource: 'area', velocitySource: 'length' },
      variation: { target: 'accent', amount: 0.3 },
    });
    expect(percussion).toMatchObject({
      preset: 'roughness-percussion',
      drum: { voice: 'closed-hat', velocitySource: 'roughness', chokeGroup: 'hats' },
      variation: { target: 'ratchet', amount: 3 },
    });
  });

  it('creates target-specific conditional defaults and rejects drum octave shifts', () => {
    expect(setLaneVariationTarget(createMelodicLane(), 'octave').variation).toMatchObject({
      target: 'octave',
      amount: 12,
      probability: { mode: 'contour', source: 'roughness' },
    });
    expect(setLaneVariationTarget(createDrumLane(), 'octave').variation).toEqual({
      target: 'off',
    });
  });
});
