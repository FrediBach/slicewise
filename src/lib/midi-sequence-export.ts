import type { ContourSequenceStep } from './contour-sequence';
import { compileProjectEvents, type LaneSequenceMap } from './sequencer-events';
import { laneStepDuration, tickValue, ticksPerBar, TRANSPORT_PPQ } from './sequencer-playback';
import type { MelodicLane, SequencerLane, SequencerProject } from './sequencer-project';

type MidiEvent = { tick: number; order: number; bytes: number[] };

const encoder = new TextEncoder();
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

function ascii(value: string): number[] {
  return Array.from(encoder.encode(value));
}

function uint16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function variableLength(value: number): number[] {
  let remaining = Math.max(0, Math.round(value));
  const bytes = [remaining & 0x7f];
  while ((remaining >>>= 7)) bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}

function chunk(id: string, content: readonly number[]): number[] {
  return [...ascii(id), ...uint32(content.length), ...content];
}

function meta(type: number, content: readonly number[]): number[] {
  return [0xff, type, ...variableLength(content.length), ...content];
}

function trackName(name: string): number[] {
  return meta(0x03, ascii(name));
}

function serializeTrack(events: readonly MidiEvent[], endTick: number): number[] {
  const sorted = [...events, { tick: endTick, order: 100, bytes: meta(0x2f, []) }].sort(
    (a, b) => a.tick - b.tick || a.order - b.order,
  );
  let previousTick = 0;
  const bytes: number[] = [];
  for (const event of sorted) {
    const tick = clamp(Math.round(event.tick), previousTick, endTick);
    bytes.push(...variableLength(tick - previousTick), ...event.bytes);
    previousTick = tick;
  }
  return chunk('MTrk', bytes);
}

function melodicChannel(index: number): number {
  const channel = index % 15;
  return channel >= 9 ? channel + 1 : channel;
}

function melodicProgram(lane: MelodicLane): number {
  if (lane.melody.voice === 'bass') return 32;
  if (lane.melody.voice === 'soft-lead') return 88;
  return 10;
}

function laneTrack(
  project: SequencerProject,
  lane: SequencerLane,
  sequences: LaneSequenceMap,
  endTick: number,
  melodicIndex: number,
  audible: boolean,
): number[] {
  const channel = lane.kind === 'drum' ? 9 : melodicChannel(melodicIndex);
  const events: MidiEvent[] = [{ tick: 0, order: -2, bytes: trackName(lane.name) }];
  if (lane.kind === 'melodic')
    events.push({
      tick: 0,
      order: -1,
      bytes: [0xc0 | channel, melodicProgram(lane)],
    });
  const laneSequences = new Map([[lane.id, sequences.get(lane.id) ?? []]]);
  const laneProject = { ...project, lanes: [lane] };
  for (const event of audible ? compileProjectEvents(laneProject, laneSequences, 0, endTick) : []) {
    const start = clamp(Math.round(tickValue(event.tick)), 0, endTick);
    const step = event.step;
    const velocity = clamp(Math.round(step.velocity * 127), 1, 127);
    const note = clamp(Math.round(step.midiNote), 0, 127);
    const duration = tickValue(laneStepDuration(project, lane));
    const noteTicks =
      step.kind === 'melodic'
        ? Math.max(1, Math.round(duration * step.gate))
        : Math.max(1, Math.min(120, Math.round(duration / 2)));
    const end = Math.min(endTick, start + noteTicks);
    events.push({ tick: start, order: 1, bytes: [0x90 | channel, note, velocity] });
    events.push({ tick: end, order: 0, bytes: [0x80 | channel, note, 0] });
  }
  return serializeTrack(events, endTick);
}

export function exportSequencerMidi(
  project: SequencerProject,
  sequences: ReadonlyMap<string, readonly ContourSequenceStep[]>,
  bars: number,
): Uint8Array {
  const exportBars = clamp(Math.round(Number.isFinite(bars) ? bars : 1), 1, 256);
  const endTick = ticksPerBar(project.timeSignature) * exportBars;
  const microsecondsPerQuarter = Math.round(60_000_000 / clamp(project.tempo, 40, 240));
  const denominatorPower = Math.round(Math.log2(project.timeSignature.denominator));
  const conductor = serializeTrack(
    [
      { tick: 0, order: -3, bytes: trackName(project.name) },
      {
        tick: 0,
        order: -2,
        bytes: meta(0x51, [
          (microsecondsPerQuarter >>> 16) & 0xff,
          (microsecondsPerQuarter >>> 8) & 0xff,
          microsecondsPerQuarter & 0xff,
        ]),
      },
      {
        tick: 0,
        order: -1,
        bytes: meta(0x58, [project.timeSignature.numerator, denominatorPower, 24, 8]),
      },
    ],
    endTick,
  );
  let melodicIndex = 0;
  const hasSolo = project.lanes.some((lane) => lane.solo && !lane.muted);
  const tracks = project.lanes.map((lane) => {
    const audible = !lane.muted && (!hasSolo || lane.solo);
    const track = laneTrack(project, lane, sequences, endTick, melodicIndex, audible);
    if (lane.kind === 'melodic') melodicIndex++;
    return track;
  });
  const header = chunk('MThd', [
    ...uint16(1),
    ...uint16(tracks.length + 1),
    ...uint16(TRANSPORT_PPQ),
  ]);
  return new Uint8Array([...header, ...conductor, ...tracks.flat()]);
}

export function sequencerMidiFilename(name: string): string {
  const safe = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${safe || 'contour-sequence'}.mid`;
}
