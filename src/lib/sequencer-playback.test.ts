import { describe, expect, it } from 'vitest';
import {
  laneEventsBetween,
  laneLoopTicks,
  laneStepDuration,
  masterCycleTicks,
  nextBarTick,
  rationalTick,
  tickToSeconds,
  ticksPerBar,
} from './sequencer-playback';
import { createDrumLane, createMelodicLane, createSequencerProject } from './sequencer-project';

describe('sequencer transport timing', () => {
  it('resolves bars and Grid polymeter in integer transport ticks', () => {
    const project = createSequencerProject();
    const fifteen = { ...createMelodicLane(), steps: 15 };
    const sixteen = createDrumLane();
    project.lanes = [fifteen, sixteen];

    expect(ticksPerBar(project.timeSignature)).toBe(3840);
    expect(laneStepDuration(project, fifteen)).toEqual({ numerator: 240, denominator: 1 });
    expect(laneLoopTicks(project, fifteen)).toBe(3600);
    expect(laneLoopTicks(project, sixteen)).toBe(3840);
    expect(masterCycleTicks(project, 16)).toEqual({ ticks: 57600, capped: false });
  });

  it('keeps Fit polyrhythms at exact rational positions', () => {
    const project = createSequencerProject();
    const lane = {
      ...createMelodicLane(),
      steps: 7,
      timing: { mode: 'fit' as const, cycleBars: 1 as const },
    };
    const events = laneEventsBetween(project, lane, 0, 3840);

    expect(laneStepDuration(project, lane)).toEqual({ numerator: 3840, denominator: 7 });
    expect(events).toHaveLength(7);
    expect(events.map((event) => event.tick)).toEqual([
      rationalTick(0),
      rationalTick(3840, 7),
      rationalTick(7680, 7),
      rationalTick(11520, 7),
      rationalTick(15360, 7),
      rationalTick(19200, 7),
      rationalTick(23040, 7),
    ]);
  });

  it('applies lane phase to step identity without changing event positions', () => {
    const project = createSequencerProject();
    const plain = { ...createMelodicLane(), steps: 4, phase: 0 };
    const phased = { ...plain, phase: 1 };
    const plainEvents = laneEventsBetween(project, plain, 0, 960);
    const phasedEvents = laneEventsBetween(project, phased, 0, 960);

    expect(phasedEvents.map((event) => event.tick)).toEqual(plainEvents.map((event) => event.tick));
    expect(phasedEvents.map((event) => event.stepIndex)).toEqual([1, 2, 3, 0]);
  });

  it('swings odd Grid steps but leaves Fit tuplets even', () => {
    const project = { ...createSequencerProject(), swing: 50 };
    const grid = { ...createMelodicLane(), steps: 4 };
    const fit = {
      ...grid,
      timing: { mode: 'fit' as const, cycleBars: 1 as const },
    };

    expect(laneEventsBetween(project, grid, 0, 960).map((event) => event.tick)).toEqual([
      rationalTick(0),
      rationalTick(300),
      rationalTick(480),
      rationalTick(780),
    ]);
    expect(laneEventsBetween(project, fit, 0, 3840).map((event) => event.tick)).toEqual([
      rationalTick(0),
      rationalTick(960),
      rationalTick(1920),
      rationalTick(2880),
    ]);
  });

  it('restarts lane phase at configured reset horizons', () => {
    const project = { ...createSequencerProject(), resetBars: 1 as const };
    const lane = { ...createMelodicLane(), steps: 15 };
    const boundary = ticksPerBar(project.timeSignature);
    const events = laneEventsBetween(project, lane, boundary - 240, boundary + 241);

    expect(
      events.map(({ tick, stepIndex, cycleIndex }) => ({ tick, stepIndex, cycleIndex })),
    ).toEqual([
      { tick: rationalTick(3600), stepIndex: 0, cycleIndex: 1 },
      { tick: rationalTick(3840), stepIndex: 0, cycleIndex: 0 },
      { tick: rationalTick(4080), stepIndex: 1, cycleIndex: 0 },
    ]);
  });

  it('calculates bar commits, seconds, and capped long master cycles', () => {
    const project = createSequencerProject();
    project.lanes = [
      { ...createMelodicLane(), steps: 61 },
      { ...createDrumLane(), steps: 64 },
    ];

    expect(nextBarTick(project, 3840)).toBe(7680);
    expect(tickToSeconds(rationalTick(960), 120)).toBe(0.5);
    expect(masterCycleTicks(project, 4)).toEqual({ ticks: 15360, capped: true });
  });

  it('respects fractional look-ahead boundaries without rounding event positions', () => {
    const project = createSequencerProject();
    const lane = createMelodicLane();

    expect(laneEventsBetween(project, lane, 0.1, 240.1).map((event) => event.tick)).toEqual([
      rationalTick(240),
    ]);
    expect(masterCycleTicks({ ...project, lanes: [] })).toEqual({ ticks: 3840, capped: false });
  });
});
