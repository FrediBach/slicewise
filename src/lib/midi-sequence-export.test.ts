import { describe, expect, it } from 'vitest';
import { createContourSequence } from './contour-sequence';
import { exportSequencerMidi, sequencerMidiFilename } from './midi-sequence-export';
import { createDrumLane, createMelodicLane, createSequencerProject } from './sequencer-project';

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe('sequencer MIDI export', () => {
  it('writes format-1 conductor, melodic, and channel-10 drum tracks', () => {
    const project = createSequencerProject();
    const melody = {
      ...createMelodicLane('lead', 'Lead'),
      steps: 4,
      pulses: 4,
      rotation: 0 as const,
    };
    const drum = { ...createDrumLane('kick', 'Kick'), steps: 4, pulses: 4, rotation: 0 as const };
    project.name = 'Shape Study';
    project.lanes = [melody, drum];
    const bytes = exportSequencerMidi(
      project,
      new Map([
        [melody.id, createContourSequence(melody)],
        [drum.id, createContourSequence(drum)],
      ]),
      2,
    );

    expect(text(bytes.slice(0, 4))).toBe('MThd');
    expect([...bytes.slice(8, 14)]).toEqual([0, 1, 0, 3, 3, 192]);
    expect(text(bytes)).toContain('Shape Study');
    expect(text(bytes)).toContain('Lead');
    expect(text(bytes)).toContain('Kick');
    expect([...bytes].some((byte) => byte === 0x99)).toBe(true);
  });

  it('is deterministic and changes evolving probability only through absolute cycles', () => {
    const project = createSequencerProject();
    const lane = {
      ...createMelodicLane(),
      probability: {
        mode: 'fixed' as const,
        chance: 50,
        variation: 'evolve' as const,
        holdCycles: 1 as const,
      },
    };
    project.lanes = [lane];
    const sequences = new Map([[lane.id, createContourSequence(lane)]]);

    expect(exportSequencerMidi(project, sequences, 8)).toEqual(
      exportSequencerMidi(project, sequences, 8),
    );
    expect(exportSequencerMidi(project, sequences, 1)).not.toEqual(
      exportSequencerMidi(project, sequences, 8),
    );
  });

  it('matches live mute and solo lane selection', () => {
    const project = createSequencerProject();
    const quiet = { ...createMelodicLane('quiet', 'Quiet'), pulses: 16, rotation: 0 as const };
    const solo = {
      ...createMelodicLane('solo', 'Solo'),
      pulses: 16,
      rotation: 0 as const,
      solo: true,
    };
    project.lanes = [quiet, solo];
    const bytes = exportSequencerMidi(
      project,
      new Map([
        [quiet.id, createContourSequence(quiet)],
        [solo.id, createContourSequence(solo)],
      ]),
      1,
    );

    expect([...bytes]).not.toContain(0x90);
    expect([...bytes]).toContain(0x91);
  });

  it('creates a safe MIDI filename', () => {
    expect(sequencerMidiFilename('  My Shape / 01  ')).toBe('my-shape-01.mid');
    expect(sequencerMidiFilename('***')).toBe('contour-sequence.mid');
  });
});
