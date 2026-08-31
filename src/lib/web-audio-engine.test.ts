import { describe, expect, it, vi } from 'vitest';
import { createContourSequence } from './contour-sequence';
import type { PlayableSequencerEvent } from './sequencer-events';
import { createMelodicLane, createSequencerProject } from './sequencer-project';
import { WebAudioEngine } from './web-audio-engine';

type FakeContext = {
  currentTime: number;
  state: AudioContextState;
  resume: ReturnType<typeof vi.fn>;
  suspend: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

describe('WebAudioEngine', () => {
  it('initializes only on start and schedules through a rolling look-ahead window', async () => {
    const context: FakeContext = {
      currentTime: 0,
      state: 'suspended',
      resume: vi.fn(async () => {
        context.state = 'running';
      }),
      suspend: vi.fn(async () => {
        context.state = 'suspended';
      }),
      close: vi.fn(async () => {
        context.state = 'closed';
      }),
    };
    const contextFactory = vi.fn(() => context as unknown as AudioContext);
    const rendered: Array<{ event: PlayableSequencerEvent; when: number }> = [];
    let timerCallback: (() => void) | null = null;
    const clearIntervalFn = vi.fn();
    const project = createSequencerProject();
    const lane = {
      ...createMelodicLane(),
      steps: 4,
      pulses: 4,
      rotation: 0 as const,
    };
    project.lanes = [lane];
    project.tempo = 120;
    const sequences = new Map([[lane.id, createContourSequence(lane)]]);
    const engine = new WebAudioEngine({
      contextFactory,
      setIntervalFn: (callback) => {
        timerCallback = callback;
        return 17 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn,
      renderEvent: (_context, event, when) => rendered.push({ event, when }),
    });

    expect(contextFactory).not.toHaveBeenCalled();
    await engine.start(project, sequences);

    expect(contextFactory).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(engine.isRunning).toBe(true);
    expect(rendered.map(({ event }) => event.stepIndex)).toEqual([0]);
    expect(rendered[0].when).toBeCloseTo(0.02);

    context.currentTime = 0.08;
    expect(timerCallback).not.toBeNull();
    (timerCallback as () => void)();
    expect(rendered.map(({ event }) => event.stepIndex)).toEqual([0, 1]);
    expect(rendered[1].when).toBeCloseTo(0.145);

    await engine.pause();
    expect(engine.isRunning).toBe(false);
    expect(engine.playheadTick).toBeCloseTo(115.2);
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(clearIntervalFn).toHaveBeenCalled();

    engine.seek(480);
    await engine.start(project, sequences);
    expect(rendered.at(-1)?.event.stepIndex).toBe(2);

    await engine.stop();
    expect(engine.isRunning).toBe(false);
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.playheadTick).toBe(0);
  });

  it('can seek a running transport without recreating its audio context', async () => {
    const context = {
      currentTime: 1,
      state: 'running' as AudioContextState,
      resume: vi.fn(async () => undefined),
      suspend: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const rendered: PlayableSequencerEvent[] = [];
    const project = createSequencerProject();
    const lane = { ...createMelodicLane(), pulses: 16, rotation: 0 as const };
    project.lanes = [lane];
    const engine = new WebAudioEngine({
      contextFactory: () => context as unknown as AudioContext,
      setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
      renderEvent: (_context, event) => rendered.push(event),
    });

    await engine.start(project, new Map([[lane.id, createContourSequence(lane)]]));
    engine.seek(960);

    expect(rendered.at(-1)?.stepIndex).toBe(4);
    expect(engine.playheadTick).toBe(960);
    await engine.stop();
  });

  it('swaps a queued phrase exactly at the requested unscheduled bar boundary', async () => {
    const context = {
      currentTime: 0,
      state: 'running' as AudioContextState,
      resume: vi.fn(async () => undefined),
      suspend: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    let timerCallback = (): void => undefined;
    const rendered: Array<{ name: string; tick: number }> = [];
    const swaps: number[] = [];
    const first = createSequencerProject();
    const firstLane = {
      ...createMelodicLane('first', 'First phrase'),
      steps: 4,
      pulses: 4,
      rotation: 0 as const,
    };
    first.lanes = [firstLane];
    first.tempo = 120;
    const second = createSequencerProject();
    const secondLane = {
      ...createMelodicLane('second', 'Second phrase'),
      steps: 4,
      pulses: 4,
      rotation: 0 as const,
    };
    second.lanes = [secondLane];
    second.tempo = 120;
    const engine = new WebAudioEngine({
      contextFactory: () => context as unknown as AudioContext,
      setIntervalFn: (callback) => {
        timerCallback = callback;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => undefined,
      onSequenceSwap: (tick) => swaps.push(tick),
      renderEvent: (_context, event) =>
        rendered.push({
          name: event.lane.name,
          tick: event.tick.numerator / event.tick.denominator,
        }),
    });

    await engine.start(first, new Map([[firstLane.id, createContourSequence(firstLane)]]));
    expect(
      engine.setPhrase(second, new Map([[secondLane.id, createContourSequence(secondLane)]]), 3840),
    ).toBe(3840);

    context.currentTime = 1.95;
    timerCallback();

    expect(swaps).toEqual([3840]);
    expect(rendered).toContainEqual({ name: 'Second phrase', tick: 3840 });
    expect(rendered).not.toContainEqual({ name: 'First phrase', tick: 3840 });
    await engine.stop();
  });

  it('skips stale events after a throttled polling gap', async () => {
    const context = {
      currentTime: 0,
      state: 'running' as AudioContextState,
      resume: vi.fn(async () => undefined),
      suspend: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    let timerCallback = (): void => undefined;
    const rendered: number[] = [];
    const project = createSequencerProject();
    project.tempo = 120;
    const lane = { ...createMelodicLane(), pulses: 16, rotation: 0 as const };
    project.lanes = [lane];
    const engine = new WebAudioEngine({
      contextFactory: () => context as unknown as AudioContext,
      setIntervalFn: (callback) => {
        timerCallback = callback;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => undefined,
      renderEvent: (_context, event) => rendered.push(event.stepIndex),
    });

    await engine.start(project, new Map([[lane.id, createContourSequence(lane)]]));
    context.currentTime = 1;
    timerCallback();

    expect(rendered).toEqual([0, 8]);
    await engine.stop();
  });
});
