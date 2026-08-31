import type { ContourSequenceStep } from './contour-sequence';
import { laneEventsBetween, tickValue, type LaneTransportEvent } from './sequencer-playback';
import { resolveStepTrigger } from './sequencer-probability';
import type { SequencerLane, SequencerProject } from './sequencer-project';

export interface PlayableSequencerEvent extends LaneTransportEvent {
  laneId: string;
  lane: SequencerLane;
  step: ContourSequenceStep;
}

export type LaneSequenceMap = ReadonlyMap<string, readonly ContourSequenceStep[]>;

export function compileProjectEvents(
  project: SequencerProject,
  sequences: LaneSequenceMap,
  fromTick: number,
  toTick: number,
): PlayableSequencerEvent[] {
  const hasSolo = project.lanes.some((lane) => lane.solo && !lane.muted);
  const events: Array<PlayableSequencerEvent & { laneOrder: number }> = [];
  for (let laneOrder = 0; laneOrder < project.lanes.length; laneOrder++) {
    const lane = project.lanes[laneOrder];
    if (lane.muted || (hasSolo && !lane.solo)) continue;
    const sequence = sequences.get(lane.id);
    if (!sequence?.length) continue;
    for (const transport of laneEventsBetween(project, lane, fromTick, toTick)) {
      const step = sequence[transport.stepIndex];
      if (!step || !resolveStepTrigger(project.seed, lane, step, transport.cycleIndex)) continue;
      events.push({ ...transport, laneId: lane.id, lane, step, laneOrder });
    }
  }
  return events
    .sort(
      (a, b) =>
        tickValue(a.tick) - tickValue(b.tick) ||
        a.laneOrder - b.laneOrder ||
        a.stepIndex - b.stepIndex,
    )
    .map((event) => ({
      tick: event.tick,
      absoluteStep: event.absoluteStep,
      stepIndex: event.stepIndex,
      cycleIndex: event.cycleIndex,
      laneId: event.laneId,
      lane: event.lane,
      step: event.step,
    }));
}
