import type { DrumSequenceStep, MelodicSequenceStep } from './contour-sequence';
import {
  compileProjectEvents,
  eventArticulation,
  eventMidiNote,
  eventRatchetCount,
  eventVelocity,
  type LaneSequenceMap,
  type PlayableSequencerEvent,
} from './sequencer-events';
import { laneStepDuration, nextBarTick, tickValue, TRANSPORT_PPQ } from './sequencer-playback';
import type { SequencerProject } from './sequencer-project';

export interface WebAudioEngineOptions {
  contextFactory?: () => AudioContext;
  pollMilliseconds?: number;
  lookAheadSeconds?: number;
  startLatencySeconds?: number;
  setIntervalFn?: (callback: () => void, milliseconds: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  renderEvent?: (context: AudioContext, event: PlayableSequencerEvent, when: number) => void;
  onSequenceSwap?: (tick: number) => void;
}

type ActiveVoice = {
  sources: AudioScheduledSourceNode[];
  stop: (when: number) => void;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const defaultContextFactory = (): AudioContext => {
  const Context =
    globalThis.AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Context) throw new Error('Web Audio is not supported in this browser');
  return new Context();
};

const midiFrequency = (midiNote: number): number => 440 * 2 ** ((midiNote - 69) / 12);

export class WebAudioEngine {
  private readonly options: Required<
    Pick<WebAudioEngineOptions, 'pollMilliseconds' | 'lookAheadSeconds' | 'startLatencySeconds'>
  > &
    WebAudioEngineOptions;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private project: SequencerProject | null = null;
  private sequences: LaneSequenceMap = new Map();
  private originAudioTime = 0;
  private originTick = 0;
  private pausedTick = 0;
  private scheduledUntil = 0;
  private running = false;
  private pendingSwap: {
    project: SequencerProject;
    sequences: LaneSequenceMap;
    tick: number;
  } | null = null;
  private readonly activeVoices = new Set<ActiveVoice>();
  private readonly chokeGroups = new Map<string, ActiveVoice>();

  constructor(options: WebAudioEngineOptions = {}) {
    this.options = {
      pollMilliseconds: 25,
      lookAheadSeconds: 0.1,
      startLatencySeconds: 0.02,
      ...options,
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  get playheadTick(): number {
    if (!this.running || !this.context || !this.project) return this.pausedTick;
    const elapsed = Math.max(0, this.context.currentTime - this.originAudioTime);
    return this.originTick + this.secondsToTicks(elapsed, this.project.tempo);
  }

  async start(
    project: SequencerProject,
    sequences: LaneSequenceMap,
    startTick = this.pausedTick,
  ): Promise<void> {
    this.project = project;
    this.sequences = sequences;
    this.pendingSwap = null;
    if (!this.context || this.context.state === 'closed') {
      this.context = (this.options.contextFactory ?? defaultContextFactory)();
      if (!this.options.renderEvent) {
        this.master = this.context.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.context.destination);
      }
    }
    await this.context.resume();
    this.clearTimer();
    this.running = true;
    this.originTick = Math.max(0, startTick);
    this.pausedTick = this.originTick;
    this.originAudioTime = this.context.currentTime + this.options.startLatencySeconds;
    this.scheduledUntil = this.originAudioTime;
    this.scheduleWindow();
    const setIntervalFn = this.options.setIntervalFn ?? setInterval;
    this.interval = setIntervalFn(() => this.scheduleWindow(), this.options.pollMilliseconds);
  }

  async pause(): Promise<void> {
    if (!this.context || !this.running) return;
    this.pausedTick = this.playheadTick;
    this.running = false;
    this.clearTimer();
    this.stopActiveVoices(this.context.currentTime);
    await this.context.suspend();
  }

  seek(tick: number): void {
    this.pausedTick = Math.max(0, Number.isFinite(tick) ? tick : 0);
    if (!this.running || !this.context) return;
    this.stopActiveVoices(this.context.currentTime);
    this.originTick = this.pausedTick;
    this.originAudioTime = this.context.currentTime + this.options.startLatencySeconds;
    this.scheduledUntil = this.originAudioTime;
    this.scheduleWindow();
  }

  /** Replaces a stopped phrase immediately or queues a running phrase at a safe bar boundary. */
  setPhrase(
    project: SequencerProject,
    sequences: LaneSequenceMap,
    requestedSwapTick?: number,
  ): number | null {
    if (!this.running || !this.context || !this.project) {
      this.project = project;
      this.sequences = sequences;
      this.pendingSwap = null;
      return null;
    }
    const scheduledTick =
      this.originTick +
      this.secondsToTicks(
        Math.max(0, this.scheduledUntil - this.originAudioTime),
        this.project.tempo,
      );
    const requested = Math.max(this.playheadTick, requestedSwapTick ?? this.playheadTick);
    const tick = requested <= scheduledTick ? nextBarTick(this.project, scheduledTick) : requested;
    this.pendingSwap = { project, sequences, tick };
    return tick;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.pausedTick = 0;
    this.clearTimer();
    this.pendingSwap = null;
    if (!this.context) return;
    this.stopActiveVoices(this.context.currentTime);
    this.master?.disconnect();
    await this.context.close();
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  private clearTimer(): void {
    if (this.interval === null) return;
    (this.options.clearIntervalFn ?? clearInterval)(this.interval);
    this.interval = null;
  }

  private secondsToTicks(seconds: number, tempo: number): number {
    return seconds * (clamp(tempo, 40, 240) / 60) * TRANSPORT_PPQ;
  }

  private tickToAudioTime(tick: number): number {
    const tempo = clamp(this.project?.tempo ?? 120, 40, 240);
    return this.originAudioTime + ((tick - this.originTick) / TRANSPORT_PPQ) * (60 / tempo);
  }

  private scheduleWindow(): void {
    if (!this.running || !this.context || !this.project) return;
    const windowStart = Math.max(this.scheduledUntil, this.context.currentTime);
    const windowEnd = Math.max(
      windowStart,
      this.context.currentTime + this.options.lookAheadSeconds,
      this.originAudioTime,
    );
    if (windowEnd <= windowStart) return;
    const fromTick = this.audioTimeToTick(windowStart);
    const toTick = this.audioTimeToTick(windowEnd);
    const swap = this.pendingSwap;
    if (swap && swap.tick < fromTick) swap.tick = nextBarTick(this.project, fromTick);
    if (swap && swap.tick >= fromTick && swap.tick < toTick) {
      this.scheduleEvents(this.project, this.sequences, fromTick, swap.tick);
      const swapAudioTime = this.tickToAudioTime(swap.tick);
      this.project = swap.project;
      this.sequences = swap.sequences;
      this.originTick = swap.tick;
      this.originAudioTime = swapAudioTime;
      this.pendingSwap = null;
      this.options.onSequenceSwap?.(swap.tick);
      this.scheduleEvents(this.project, this.sequences, swap.tick, this.audioTimeToTick(windowEnd));
    } else {
      this.scheduleEvents(this.project, this.sequences, fromTick, toTick);
    }
    this.scheduledUntil = windowEnd;
  }

  private audioTimeToTick(audioTime: number): number {
    return (
      this.originTick +
      this.secondsToTicks(audioTime - this.originAudioTime, this.project?.tempo ?? 120)
    );
  }

  private scheduleEvents(
    project: SequencerProject,
    sequences: LaneSequenceMap,
    fromTick: number,
    toTick: number,
  ): void {
    for (const event of compileProjectEvents(project, sequences, fromTick, toTick)) {
      const when = this.tickToAudioTime(tickValue(event.tick));
      const ratchets = eventRatchetCount(event);
      const stepSeconds =
        (tickValue(laneStepDuration(project, event.lane)) / TRANSPORT_PPQ) *
        (60 / clamp(project.tempo, 40, 240));
      for (let ratchet = 0; ratchet < ratchets; ratchet++) {
        const ratchetWhen = when + (ratchet * stepSeconds) / ratchets;
        if (this.options.renderEvent) this.options.renderEvent(this.context, event, ratchetWhen);
        else this.renderBuiltInVoice(event, ratchetWhen);
      }
    }
  }

  private renderBuiltInVoice(event: PlayableSequencerEvent, when: number): void {
    if (!this.context || !this.master) return;
    if (event.step.kind === 'melodic') this.renderMelodic(event, event.step, when);
    else this.renderDrum(event, event.step, when);
  }

  private outputForPan(pan: number): AudioNode {
    if (!this.context || !this.master) throw new Error('Audio output is not initialized');
    if (typeof this.context.createStereoPanner !== 'function') return this.master;
    const panner = this.context.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    panner.connect(this.master);
    return panner;
  }

  private renderMelodic(
    event: PlayableSequencerEvent,
    step: MelodicSequenceStep,
    when: number,
  ): void {
    const context = this.context!;
    const lane = event.lane.kind === 'melodic' ? event.lane : null;
    if (!lane) return;
    const stepTicks = tickValue(laneStepDuration(this.project!, lane));
    const duration = clamp(
      ((stepTicks / TRANSPORT_PPQ) *
        (60 / clamp(this.project!.tempo, 40, 240)) *
        step.gate *
        eventArticulation(event)) /
        eventRatchetCount(event),
      0.025,
      3,
    );
    const oscillator = context.createOscillator();
    const subOscillator = context.createOscillator();
    const subGain = context.createGain();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const frequency = midiFrequency(eventMidiNote(event));
    oscillator.type = lane.melody.oscillator;
    oscillator.frequency.setValueAtTime(frequency, when);
    subOscillator.type = 'sine';
    subOscillator.frequency.setValueAtTime(frequency / 2, when);
    subGain.gain.value = lane.melody.subOscillator * 0.55;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(
      clamp(180 + lane.melody.brightness ** 2 * 12_000 * (0.65 + step.velocity * 0.35), 80, 18_000),
      when,
    );
    filter.Q.value = lane.melody.resonance;
    const peak = eventVelocity(event) * 0.25;
    const attack = Math.min(lane.melody.attack, duration * 0.8);
    const gateEnd = when + duration;
    const attackEnd = when + attack;
    const decayEnd = Math.min(gateEnd, attackEnd + lane.melody.decay);
    const sustainGain = Math.max(0.0001, peak * lane.melody.sustain);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, attackEnd);
    gain.gain.exponentialRampToValueAtTime(sustainGain, decayEnd);
    gain.gain.setValueAtTime(sustainGain, gateEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, gateEnd + lane.melody.release);
    oscillator.connect(filter);
    subOscillator.connect(subGain).connect(filter);
    filter.connect(gain).connect(this.master!);
    oscillator.start(when);
    subOscillator.start(when);
    oscillator.stop(gateEnd + lane.melody.release + 0.02);
    subOscillator.stop(gateEnd + lane.melody.release + 0.02);
    this.registerVoice([oscillator, subOscillator]);
  }

  private renderDrum(event: PlayableSequencerEvent, step: DrumSequenceStep, when: number): void {
    const lane = event.lane.kind === 'drum' ? event.lane : null;
    if (!lane) return;
    const chokeGroup = lane.drum.chokeGroup;
    if (chokeGroup) this.choke(chokeGroup, when);
    const expressiveStep = {
      ...step,
      velocity: eventVelocity(event),
      decay: (step.decay * eventArticulation(event)) / eventRatchetCount(event),
    };
    if (step.voice === 'kick') this.renderKick(expressiveStep, when, chokeGroup);
    else if (step.voice === 'snare') this.renderSnare(expressiveStep, when, chokeGroup);
    else if (step.voice.endsWith('-tom') || step.voice.endsWith('-conga'))
      this.renderPitchedDrum(expressiveStep, when, chokeGroup);
    else if (step.voice === 'rimshot') this.renderRimshot(expressiveStep, when, chokeGroup);
    else if (step.voice === 'cowbell') this.renderCowbell(expressiveStep, when, chokeGroup);
    else if (step.voice === 'crash' || step.voice === 'ride')
      this.renderCymbal(expressiveStep, when, chokeGroup);
    else this.renderNoiseDrum(expressiveStep, when, chokeGroup);
  }

  private renderKick(step: DrumSequenceStep, when: number, chokeGroup: string | null): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(150 + step.tone * 70, when);
    oscillator.frequency.exponentialRampToValueAtTime(42 + step.tone * 18, when + 0.09);
    gain.gain.setValueAtTime(clamp(step.velocity, 0, 1) * 0.75, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + clamp(step.decay, 0.08, 1.2));
    oscillator.connect(gain).connect(this.outputForPan(step.pan));
    oscillator.start(when);
    oscillator.stop(when + clamp(step.decay, 0.08, 1.2) + 0.03);
    this.registerVoice([oscillator], chokeGroup);
  }

  private renderPitchedDrum(step: DrumSequenceStep, when: number, chokeGroup: string | null): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = step.voice.endsWith('-conga') ? 'triangle' : 'sine';
    const voiceBase = step.voice.startsWith('low-')
      ? 82
      : step.voice.startsWith('high-')
        ? 165
        : 118;
    const frequency = voiceBase * (0.8 + step.tone * 0.5);
    oscillator.frequency.setValueAtTime(frequency * 1.35, when);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, when + 0.06);
    gain.gain.setValueAtTime(step.velocity * 0.55, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + clamp(step.decay, 0.08, 1));
    oscillator.connect(gain).connect(this.outputForPan(step.pan));
    oscillator.start(when);
    oscillator.stop(when + clamp(step.decay, 0.08, 1) + 0.02);
    this.registerVoice([oscillator], chokeGroup);
  }

  private renderRimshot(step: DrumSequenceStep, when: number, chokeGroup: string | null): void {
    const context = this.context!;
    const high = context.createOscillator();
    const low = context.createOscillator();
    const gain = context.createGain();
    high.type = 'square';
    low.type = 'sine';
    high.frequency.value = 1350 + step.tone * 650;
    low.frequency.value = 420 + step.tone * 180;
    gain.gain.setValueAtTime(step.velocity * 0.22, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + clamp(step.decay, 0.025, 0.12));
    high.connect(gain);
    low.connect(gain).connect(this.outputForPan(step.pan));
    high.start(when);
    low.start(when);
    high.stop(when + 0.13);
    low.stop(when + 0.13);
    this.registerVoice([high, low], chokeGroup);
  }

  private renderCowbell(step: DrumSequenceStep, when: number, chokeGroup: string | null): void {
    const context = this.context!;
    const first = context.createOscillator();
    const second = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    first.type = second.type = 'square';
    first.frequency.value = 540 + step.tone * 80;
    second.frequency.value = 800 + step.tone * 120;
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 3;
    const duration = clamp(step.decay, 0.08, 0.7);
    gain.gain.setValueAtTime(step.velocity * 0.18, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    first.connect(filter);
    second.connect(filter);
    filter.connect(gain).connect(this.outputForPan(step.pan));
    first.start(when);
    second.start(when);
    first.stop(when + duration + 0.02);
    second.stop(when + duration + 0.02);
    this.registerVoice([first, second], chokeGroup);
  }

  private renderCymbal(step: DrumSequenceStep, when: number, chokeGroup: string | null): void {
    const context = this.context!;
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const sources: OscillatorNode[] = [];
    const duration =
      step.voice === 'crash' ? clamp(step.decay, 0.35, 2.4) : clamp(step.decay, 0.2, 1.5);
    filter.type = 'highpass';
    filter.frequency.value = step.voice === 'crash' ? 2800 : 4200;
    gain.gain.setValueAtTime(step.velocity * 0.12, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    for (const ratio of [1, 1.34, 1.79, 2.31, 2.93, 3.61]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = (310 + step.tone * 170) * ratio;
      oscillator.connect(filter);
      oscillator.start(when);
      oscillator.stop(when + duration + 0.02);
      sources.push(oscillator);
    }
    filter.connect(gain).connect(this.outputForPan(step.pan));
    this.registerVoice(sources, chokeGroup);
  }

  private renderSnare(step: DrumSequenceStep, when: number, chokeGroup: string | null): void {
    const context = this.context!;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const body = context.createOscillator();
    const bodyGain = context.createGain();
    const duration = clamp(step.decay, 0.08, 0.7);
    noise.buffer = this.getNoiseBuffer();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 900 + step.tone * 1800;
    noiseGain.gain.setValueAtTime(step.velocity * 0.42, when);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    body.type = 'triangle';
    body.frequency.value = 150 + step.tone * 90;
    bodyGain.gain.setValueAtTime(step.velocity * 0.18, when);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + Math.min(0.16, duration));
    const output = this.outputForPan(step.pan);
    noise.connect(noiseFilter).connect(noiseGain).connect(output);
    body.connect(bodyGain).connect(output);
    noise.start(when);
    noise.stop(when + duration + 0.01);
    body.start(when);
    body.stop(when + Math.min(0.18, duration + 0.01));
    this.registerVoice([noise, body], chokeGroup);
  }

  private renderNoiseDrum(step: DrumSequenceStep, when: number, chokeGroup: string | null): void {
    const context = this.context!;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const duration =
      step.voice === 'closed-hat'
        ? clamp(step.decay, 0.025, 0.12)
        : step.voice === 'open-hat'
          ? clamp(step.decay, 0.18, 0.9)
          : clamp(step.decay, 0.12, 0.45);
    noise.buffer = this.getNoiseBuffer();
    filter.type = 'highpass';
    filter.frequency.value = step.voice === 'clap' ? 700 : 4800 + step.tone * 3500;
    gain.gain.setValueAtTime(step.velocity * (step.voice === 'clap' ? 0.35 : 0.22), when);
    if (step.voice === 'clap') {
      gain.gain.setValueAtTime(0.0001, when + 0.012);
      gain.gain.setValueAtTime(step.velocity * 0.28, when + 0.022);
      gain.gain.setValueAtTime(0.0001, when + 0.035);
      gain.gain.setValueAtTime(step.velocity * 0.2, when + 0.045);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    noise.connect(filter).connect(gain).connect(this.outputForPan(step.pan));
    noise.start(when);
    noise.stop(when + duration + 0.01);
    this.registerVoice([noise], chokeGroup);
  }

  private getNoiseBuffer(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const context = this.context!;
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 0x9e3779b9;
    for (let index = 0; index < data.length; index++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[index] = ((state >>> 0) / 0x80000000 - 1) * 0.9;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private registerVoice(sources: AudioScheduledSourceNode[], chokeGroup?: string | null): void {
    const voice: ActiveVoice = {
      sources,
      stop: (when) => {
        for (const source of sources)
          try {
            source.stop(when);
          } catch {
            // Already stopped sources are harmless during pause/choke cleanup.
          }
      },
    };
    let remaining = sources.length;
    const finish = (): void => {
      remaining--;
      if (remaining > 0) return;
      this.activeVoices.delete(voice);
      if (chokeGroup && this.chokeGroups.get(chokeGroup) === voice)
        this.chokeGroups.delete(chokeGroup);
    };
    for (const source of sources) source.addEventListener('ended', finish, { once: true });
    this.activeVoices.add(voice);
    if (chokeGroup) this.chokeGroups.set(chokeGroup, voice);
  }

  private choke(group: string, when: number): void {
    const voice = this.chokeGroups.get(group);
    if (!voice) return;
    voice.stop(when);
    this.chokeGroups.delete(group);
  }

  private stopActiveVoices(when: number): void {
    for (const voice of this.activeVoices) voice.stop(when);
    this.activeVoices.clear();
    this.chokeGroups.clear();
  }
}
