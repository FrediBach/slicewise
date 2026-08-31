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

  it('migrates version-one lanes to explicit neutral expression settings', () => {
    const legacy = structuredClone(createSequencerProject()) as unknown as Record<string, unknown>;
    legacy.version = 1;
    for (const lane of legacy.lanes as Array<Record<string, unknown>>) {
      delete lane.preset;
      delete lane.variation;
    }

    const restored = restoreStoredSequencerProject(legacy);

    expect(restored?.version).toBe(4);
    expect(restored?.lanes.map((lane) => [lane.preset, lane.variation])).toEqual([
      ['contour-pluck', { target: 'off' }],
      ['contour-kick', { target: 'off' }],
    ]);
    expect(restored?.lanes.every((lane) => lane.traversal.start === 0)).toBe(true);
  });

  it('migrates version-two projects to neutral full-stack traversal', () => {
    const legacy = structuredClone(createSequencerProject()) as unknown as Record<string, unknown>;
    legacy.version = 2;
    for (const lane of legacy.lanes as Array<Record<string, unknown>>) delete lane.traversal;

    const restored = restoreStoredSequencerProject(legacy);

    expect(restored?.version).toBe(4);
    expect(restored?.lanes.map(({ traversal }) => traversal)).toEqual([
      {
        start: 0,
        end: 100,
        trackPosition: 25,
        modulationSource: 'off',
        modulationAmount: 0,
      },
      {
        start: 0,
        end: 100,
        trackPosition: 75,
        modulationSource: 'off',
        modulationAmount: 0,
      },
    ]);
  });

  it('migrates version-three lanes to distinct contour routes', () => {
    const legacy = structuredClone(createSequencerProject()) as unknown as Record<string, unknown>;
    legacy.version = 3;
    for (const lane of legacy.lanes as Array<Record<string, unknown>>) {
      const traversal = lane.traversal as Record<string, unknown>;
      delete traversal.trackPosition;
    }

    const restored = restoreStoredSequencerProject(legacy);

    expect(restored?.version).toBe(4);
    expect(restored?.lanes.map((lane) => lane.traversal.trackPosition)).toEqual([25, 75]);
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
