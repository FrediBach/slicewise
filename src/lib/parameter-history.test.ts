import { describe, expect, it } from 'vitest';
import { ParameterHistory } from './parameter-history';

type Snapshot = { value: number; nested?: { label: string } };

describe('ParameterHistory', () => {
  it('starts empty with no available navigation', () => {
    const history = new ParameterHistory<Snapshot>();

    expect(history.status).toEqual({ size: 0, index: -1, canUndo: false, canRedo: false });
    expect(history.move(-1)).toBeNull();
  });

  it('ignores an unchanged current snapshot', () => {
    const history = new ParameterHistory<Snapshot>();

    expect(history.commit({ value: 1 })).toBe(true);
    expect(history.commit({ value: 1 })).toBe(false);
    expect(history.status.size).toBe(1);
  });

  it('moves backward and forward with accurate availability', () => {
    const history = new ParameterHistory<Snapshot>();
    history.commit({ value: 1 });
    history.commit({ value: 2 });
    history.commit({ value: 3 });

    expect(history.move(-1)).toEqual({ value: 2 });
    expect(history.status).toEqual({ size: 3, index: 1, canUndo: true, canRedo: true });
    expect(history.move(1)).toEqual({ value: 3 });
    expect(history.status.canRedo).toBe(false);
  });

  it('discards the redo branch after a new commit', () => {
    const history = new ParameterHistory<Snapshot>();
    history.commit({ value: 1 });
    history.commit({ value: 2 });
    history.commit({ value: 3 });
    history.move(-2);

    history.commit({ value: 4 });
    expect(history.status).toEqual({ size: 2, index: 1, canUndo: true, canRedo: false });
    expect(history.move(-1)).toEqual({ value: 1 });
    expect(history.move(1)).toEqual({ value: 4 });
  });

  it('evicts the oldest entries at its configured bound', () => {
    const history = new ParameterHistory<Snapshot>({ limit: 3 });
    for (let value = 1; value <= 5; value++) history.commit({ value });

    expect(history.status).toEqual({ size: 3, index: 2, canUndo: true, canRedo: false });
    expect(history.move(-10)).toEqual({ value: 3 });
    expect(history.move(-1)).toBeNull();
  });

  it('detaches committed and returned nested values', () => {
    const history = new ParameterHistory<Snapshot>();
    const source = { value: 1, nested: { label: 'original' } };
    history.commit(source);
    source.nested.label = 'mutated source';
    history.commit({ value: 2 });

    const restored = history.move(-1)!;
    expect(restored.nested?.label).toBe('original');
    restored.nested!.label = 'mutated result';
    expect(history.move(1)).toEqual({ value: 2 });
    expect(history.move(-1)?.nested?.label).toBe('original');
  });

  it('calls the platform clone function with its global receiver', () => {
    const originalClone = globalThis.structuredClone;
    let calls = 0;
    globalThis.structuredClone = function <T>(this: unknown, value: T): T {
      expect(this).toBe(globalThis);
      calls++;
      return originalClone(value);
    };
    try {
      const history = new ParameterHistory<Snapshot>();
      history.commit({ value: 1 });
      history.commit({ value: 2 });
      expect(history.move(-1)).toEqual({ value: 1 });
      expect(calls).toBeGreaterThan(0);
    } finally {
      globalThis.structuredClone = originalClone;
    }
  });
});
