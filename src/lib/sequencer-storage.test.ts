import { describe, expect, it } from 'vitest';
import { createSequencerProject } from './sequencer-project';
import {
  loadSequencerProject,
  restoreStoredSequencerProject,
  saveSequencerProject,
} from './sequencer-storage';

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe('sequencer storage', () => {
  it('round-trips a detached versioned project envelope', () => {
    const storage = memoryStorage();
    const project = createSequencerProject();
    project.tempo = 137;

    saveSequencerProject(project, storage);
    const restored = loadSequencerProject(storage);

    expect(restored).toEqual(project);
    expect(restored).not.toBe(project);
    restored!.lanes[0].pulses = 1;
    expect(project.lanes[0].pulses).toBe(5);
  });

  it('accepts a current raw project and rejects corrupt or future data', () => {
    expect(restoreStoredSequencerProject(createSequencerProject())).toEqual(
      createSequencerProject(),
    );
    expect(restoreStoredSequencerProject({ version: 99, lanes: [] })).toBeNull();
    expect(
      restoreStoredSequencerProject({
        storageVersion: 1,
        project: { ...createSequencerProject(), tempo: Number.NaN },
      }),
    ).toBeNull();
    const corruptLane = createSequencerProject();
    corruptLane.lanes[0] = { ...corruptLane.lanes[0], melody: {} } as never;
    expect(restoreStoredSequencerProject(corruptLane)).toBeNull();
  });

  it('returns null for unavailable or malformed local storage', () => {
    expect(loadSequencerProject({ getItem: () => '{bad', setItem: () => undefined })).toBeNull();
    expect(
      loadSequencerProject({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
      }),
    ).toBeNull();
  });
});
