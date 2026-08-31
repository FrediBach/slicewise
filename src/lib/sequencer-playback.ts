import type { LaneTiming, SequencerLane, SequencerProject } from './sequencer-project';

export const TRANSPORT_PPQ = 960;

export interface RationalTick {
  numerator: number;
  denominator: number;
}

export interface LaneTransportEvent {
  tick: RationalTick;
  absoluteStep: number;
  stepIndex: number;
  cycleIndex: number;
}

const gcd = (a: number, b: number): number => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

export function rationalTick(numerator: number, denominator = 1): RationalTick {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0)
    return { numerator: 0, denominator: 1 };
  let n = Math.round(numerator);
  let d = Math.round(denominator);
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d);
  return { numerator: n / divisor, denominator: d / divisor };
}

export const tickValue = (tick: RationalTick): number => tick.numerator / tick.denominator;

function addTicks(a: RationalTick, b: RationalTick): RationalTick {
  return rationalTick(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}

function compareTickToValue(tick: RationalTick, value: number): number {
  return tick.numerator - value * tick.denominator;
}

const positiveModulo = (value: number, modulus: number): number =>
  ((value % modulus) + modulus) % modulus;

export function ticksPerBar(timeSignature: SequencerProject['timeSignature']): number {
  return Math.round(timeSignature.numerator * TRANSPORT_PPQ * (4 / timeSignature.denominator));
}

function gridStepTicks(subdivision: Extract<LaneTiming, { mode: 'grid' }>['subdivision']): number {
  return (TRANSPORT_PPQ * 4) / Number(subdivision.slice(2));
}

export function laneStepDuration(
  project: Pick<SequencerProject, 'timeSignature'>,
  lane: Pick<SequencerLane, 'steps' | 'timing'>,
): RationalTick {
  if (lane.timing.mode === 'grid') return rationalTick(gridStepTicks(lane.timing.subdivision));
  return rationalTick(ticksPerBar(project.timeSignature) * lane.timing.cycleBars, lane.steps);
}

export function laneLoopTicks(
  project: Pick<SequencerProject, 'timeSignature'>,
  lane: Pick<SequencerLane, 'steps' | 'timing'>,
): number {
  const duration = laneStepDuration(project, lane);
  return (duration.numerator * lane.steps) / duration.denominator;
}

function swingOffset(
  project: Pick<SequencerProject, 'swing'>,
  lane: Pick<SequencerLane, 'timing'>,
  absoluteStep: number,
): RationalTick {
  if (lane.timing.mode !== 'grid' || absoluteStep % 2 === 0) return rationalTick(0);
  const amount = Math.min(70, Math.max(0, Math.round(project.swing)));
  return rationalTick(gridStepTicks(lane.timing.subdivision) * amount, 200);
}

function eventsInResetSegment(
  project: Pick<SequencerProject, 'timeSignature' | 'swing'>,
  lane: Pick<SequencerLane, 'steps' | 'phase' | 'timing'>,
  segmentOffset: number,
  fromTick: number,
  toTick: number,
): LaneTransportEvent[] {
  const duration = laneStepDuration(project, lane);
  const relativeFrom = fromTick - segmentOffset;
  const relativeTo = toTick - segmentOffset;
  const firstStep = Math.ceil((relativeFrom * duration.denominator) / duration.numerator);
  const lastStep = Math.ceil((relativeTo * duration.denominator) / duration.numerator);
  const phase = Math.round(lane.phase);
  const events: LaneTransportEvent[] = [];
  for (let absoluteStep = firstStep; absoluteStep < lastStep; absoluteStep++) {
    let tick = rationalTick(
      segmentOffset * duration.denominator + absoluteStep * duration.numerator,
      duration.denominator,
    );
    tick = addTicks(tick, swingOffset(project, lane, absoluteStep));
    if (compareTickToValue(tick, fromTick) < 0 || compareTickToValue(tick, toTick) >= 0) continue;
    events.push({
      tick,
      absoluteStep,
      stepIndex: positiveModulo(absoluteStep + phase, lane.steps),
      cycleIndex: Math.floor(absoluteStep / lane.steps),
    });
  }
  return events;
}

/** Enumerates a bounded tick window without accumulating floating-point timing error. */
export function laneEventsBetween(
  project: Pick<SequencerProject, 'timeSignature' | 'swing' | 'resetBars'>,
  lane: Pick<SequencerLane, 'steps' | 'phase' | 'timing'>,
  fromTick: number,
  toTick: number,
): LaneTransportEvent[] {
  const start = Math.max(0, Number.isFinite(fromTick) ? fromTick : 0);
  const end = Math.max(start, Number.isFinite(toTick) ? toTick : start);
  if (end <= start) return [];
  const resetTicks = project.resetBars ? ticksPerBar(project.timeSignature) * project.resetBars : 0;
  if (!resetTicks) return eventsInResetSegment(project, lane, 0, start, end);

  const events: LaneTransportEvent[] = [];
  for (
    let segment = Math.floor(start / resetTicks) * resetTicks;
    segment < end;
    segment += resetTicks
  ) {
    const segmentStart = Math.max(start, segment);
    const segmentEnd = Math.min(end, segment + resetTicks);
    events.push(...eventsInResetSegment(project, lane, segment, segmentStart, segmentEnd));
  }
  return events;
}

export function nextBarTick(
  project: Pick<SequencerProject, 'timeSignature'>,
  currentTick: number,
): number {
  const bar = ticksPerBar(project.timeSignature);
  return (Math.floor(Math.max(0, currentTick) / bar) + 1) * bar;
}

export function tickToSeconds(tick: RationalTick, tempo: number): number {
  const bpm = Math.min(240, Math.max(40, Number.isFinite(tempo) ? tempo : 120));
  return (tickValue(tick) / TRANSPORT_PPQ) * (60 / bpm);
}

export function masterCycleTicks(
  project: Pick<SequencerProject, 'timeSignature' | 'resetBars' | 'lanes'>,
  capBars = 128,
): { ticks: number; capped: boolean } {
  const bar = ticksPerBar(project.timeSignature);
  const cap = Math.max(bar, Math.round(capBars) * bar);
  if (project.resetBars) return { ticks: project.resetBars * bar, capped: false };
  if (!project.lanes.length) return { ticks: bar, capped: false };
  let cycle = 1;
  for (const lane of project.lanes) {
    const loop = Math.round(laneLoopTicks(project, lane));
    cycle = (cycle / gcd(cycle, loop)) * loop;
    if (!Number.isSafeInteger(cycle) || cycle > cap) return { ticks: cap, capped: true };
  }
  return { ticks: cycle, capped: false };
}
