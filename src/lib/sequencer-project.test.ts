import { describe, expect, it } from 'vitest';
import { createDrumLane, createMelodicLane, createSequencerProject } from './sequencer-project';

describe('sequencer project defaults', () => {
  it('creates a versioned project with one deterministic melodic lane', () => {
    const project = createSequencerProject();

    expect(project.version).toBe(1);
    expect(project.lanes).toEqual([createMelodicLane()]);
    expect(project.lanes[0]).toMatchObject({
      kind: 'melodic',
      steps: 16,
      pulses: 5,
      rotation: 'auto',
      contourInfluence: 100,
      probability: { mode: 'off' },
    });
  });

  it('uses an explicit drum-only settings branch', () => {
    const lane = createDrumLane('kick', 'Kick');

    expect(lane.kind).toBe('drum');
    expect(lane.drum).toMatchObject({ voice: 'kick', midiNote: 36 });
    expect('melody' in lane).toBe(false);
  });
});
