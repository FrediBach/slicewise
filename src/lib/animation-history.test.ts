import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import { createAnimationHistory } from './animation-history';
import {
  createAnimationProject,
  updateAnimationTiming,
  type AnimationParameterDescriptor,
} from './animation-project';

const parameters = [
  { controlId: 'zoom', settingKey: 'zoom', kind: 'continuous', min: 0.2, max: 3 },
] as const satisfies readonly AnimationParameterDescriptor[];

describe('animation project history', () => {
  it('keeps undo and redo snapshots detached from live projects', () => {
    const initial = createAnimationProject(contourSettings, parameters);
    const history = createAnimationHistory(initial);
    const edited = updateAnimationTiming(initial, { durationMs: 8000 });
    history.commit(edited);

    const undone = history.move(-1)!;
    expect(undone.durationMs).toBe(5000);
    undone.baseSettings.zoom = 3;

    const redone = history.move(1)!;
    expect(redone.durationMs).toBe(8000);
    expect(redone.baseSettings.zoom).toBe(1);
  });
});
