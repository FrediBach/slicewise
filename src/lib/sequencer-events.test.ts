import { describe, expect, it } from 'vitest';
import { createContourSequence } from './contour-sequence';
import {
  compileProjectEvents,
  eventArticulation,
  eventMidiNote,
  eventRatchetCount,
  eventVelocity,
} from './sequencer-events';
import { createDrumLane, createMelodicLane, createSequencerProject } from './sequencer-project';

describe('compileProjectEvents', () => {
  it('combines exact lane timing, sequence steps, and probability', () => {
    const project = createSequencerProject();
    const lane = {
      ...createMelodicLane('lead'),
      steps: 4,
      pulses: 4,
      rotation: 0 as const,
      probability: {
        mode: 'fixed' as const,
        chance: 100,
        variation: 'repeat' as const,
        holdCycles: 1 as const,
      },
    };
    project.lanes = [lane];
    const sequences = new Map([[lane.id, createContourSequence(lane)]]);

    const events = compileProjectEvents(project, sequences, 0, 960);

    expect(events).toHaveLength(4);
    expect(events.map((event) => event.stepIndex)).toEqual([0, 1, 2, 3]);
    expect(events.every((event) => event.laneId === 'lead' && event.step.kind === 'melodic')).toBe(
      true,
    );
  });

  it('honors mute and project-wide solo in stable lane order', () => {
    const project = createSequencerProject();
    const lead = {
      ...createMelodicLane('lead'),
      steps: 1,
      pulses: 1,
      rotation: 0 as const,
      solo: true,
    };
    const kick = { ...createDrumLane('kick'), steps: 1, pulses: 1, rotation: 0 as const };
    const mutedSolo = { ...createDrumLane('muted'), steps: 1, pulses: 1, muted: true, solo: true };
    project.lanes = [kick, lead, mutedSolo];
    const sequences = new Map(
      project.lanes.map((lane) => [lane.id, createContourSequence(lane)] as const),
    );

    expect(compileProjectEvents(project, sequences, 0, 1).map((event) => event.laneId)).toEqual([
      'lead',
    ]);
    lead.solo = false;
    expect(compileProjectEvents(project, sequences, 0, 1).map((event) => event.laneId)).toEqual([
      'kick',
      'lead',
    ]);
  });

  it('resolves deterministic expression into shared live/export values', () => {
    const project = createSequencerProject();
    const lane = {
      ...createMelodicLane('lead'),
      steps: 1,
      pulses: 1,
      rotation: 0 as const,
      variation: {
        target: 'octave' as const,
        probability: {
          mode: 'fixed' as const,
          chance: 100,
          variation: 'repeat' as const,
          holdCycles: 1 as const,
        },
        amount: 12,
      },
    };
    project.lanes = [lane];
    const [event] = compileProjectEvents(
      project,
      new Map([[lane.id, createContourSequence(lane)]]),
      0,
      1,
    );

    expect(event.variation.target).toBe('octave');
    expect(eventMidiNote(event)).toBe(event.step.midiNote + 12);
    expect(eventVelocity(event)).toBe(event.step.velocity);
    expect(eventArticulation(event)).toBe(1);
    expect(eventRatchetCount(event)).toBe(1);
  });
});
