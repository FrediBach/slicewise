import { useRef, useState, type CSSProperties } from 'react';
import { DRUM_VOICE_OPTIONS } from '../../lib/sequencer-project';
import type { SequencerUiLane } from './sequencer-ui';

type Command = (type: string, detail: Record<string, unknown>) => void;
const parameters = {
  brightness: ['Brightness', 'brightness', 0, 100, 1, '%'],
  resonance: ['Resonance', 'filter resonance', 0, 20, 0.1, 'Q'],
  subOscillator: ['Sub level', 'sub oscillator', 0, 100, 1, '%'],
  attack: ['Attack', 'envelope attack', 1, 2000, 1, 'ms'],
  decay: ['Decay', 'envelope decay', 10, 3000, 1, 'ms'],
  sustain: ['Sustain', 'envelope sustain', 0, 100, 1, '%'],
  release: ['Release', 'envelope release', 10, 5000, 1, 'ms'],
} as const;
type Parameter = keyof typeof parameters;

function SoundKnob({
  lane,
  parameter,
  command,
}: {
  lane: SequencerUiLane;
  parameter: Parameter;
  command: Command;
}) {
  const [label, aria, min, max, step, unit] = parameters[parameter];
  const scale = unit === 'ms' ? 1000 : 1;
  const value = lane[parameter] * scale;
  const [draft, setDraft] = useState<string | null>(null);
  const drag = useRef<{ y: number; position: number } | null>(null);
  const normalize = (v: number) =>
    unit === 'ms' ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  const position = normalize(Math.max(min, Math.min(max, value)));
  const rounded = Number(value.toFixed(step < 1 ? 1 : 0));
  const update = (v: number) => {
    const next = Math.max(min, Math.min(max, Math.round(v / step) * step));
    command(`lane-${parameter.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, {
      laneId: lane.id,
      value: Number((next / scale).toFixed(4)),
    });
  };
  return (
    <div className="sound-knob">
      <span className="sound-knob-label">{label}</span>
      <div
        className="sound-knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={`${lane.name} ${aria} knob`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={rounded}
        aria-valuetext={`${rounded} ${unit}`}
        title="Drag up/down · Shift for fine adjustment · Arrow keys to adjust"
        style={
          {
            '--knob-angle': `${-135 + position * 270}deg`,
            '--knob-fill': `${position * 270}deg`,
          } as CSSProperties
        }
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, position };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const next = Math.max(
            0,
            Math.min(
              1,
              drag.current.position +
                (drag.current.y - event.clientY) / (event.shiftKey ? 1600 : 160),
            ),
          );
          update(unit === 'ms' ? min * (max / min) ** next : min + next * (max - min));
          drag.current = { y: event.clientY, position: next };
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          const direction = ['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key)
            ? 1
            : ['ArrowDown', 'ArrowLeft', 'PageDown'].includes(event.key)
              ? -1
              : 0;
          if (direction) {
            event.preventDefault();
            update(value + direction * step * (event.key.startsWith('Page') ? 10 : 1));
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            update(event.key === 'Home' ? min : max);
          }
        }}
      >
        <span />
      </div>
      <label className="sound-knob-value">
        <input
          aria-label={`${lane.name} ${aria}`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft ?? rounded}
          onFocus={(event) => {
            setDraft(String(rounded));
            event.target.select();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (
              draft !== null &&
              draft.trim() !== '' &&
              Number.isFinite(Number(draft)) &&
              Number(draft) !== rounded
            )
              update(Number(draft));
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(null);
              event.preventDefault();
            }
          }}
        />
        <span>{unit}</span>
      </label>
    </div>
  );
}

export function SoundControls({ lane, command }: { lane: SequencerUiLane; command: Command }) {
  const knob = (parameter: Parameter) => (
    <SoundKnob key={parameter} lane={lane} parameter={parameter} command={command} />
  );
  if (lane.kind === 'drum')
    return (
      <fieldset className="sound-module sound-drum-module">
        <legend>Percussion</legend>
        <label>
          <span>Drum instrument</span>
          <select
            aria-label={`${lane.name} drum instrument`}
            value={lane.soundVoice}
            onChange={(event) =>
              command('lane-drum-voice', { laneId: lane.id, voice: event.target.value })
            }
          >
            {DRUM_VOICE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="sound-drum-pads" role="group" aria-label={`${lane.name} drum sounds`}>
          {DRUM_VOICE_OPTIONS.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              aria-pressed={lane.soundVoice === value}
              onClick={() => command('lane-drum-voice', { laneId: lane.id, voice: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  // A schematic envelope: time stages use a log scale to keep short transients legible.
  const attackX = 12 + (60 * Math.log1p(lane.attack * 1000)) / Math.log1p(2000);
  const decayX = attackX + 20 + (65 * Math.log1p(lane.decay * 1000)) / Math.log1p(3000);
  const releaseX = decayX + 45;
  const endX = releaseX + 20 + (65 * Math.log1p(lane.release * 1000)) / Math.log1p(5000);
  const sustainY = 65 - lane.sustain * 0.5;
  const curve = `M 12 65 L ${attackX} 15 Q ${attackX + 8} ${sustainY} ${decayX} ${sustainY} L ${releaseX} ${sustainY} Q ${releaseX + 12} 65 ${endX} 65`;
  return (
    <div className="sound-rack">
      <fieldset className="sound-module sound-oscillator">
        <legend>01 · Oscillator</legend>
        <label>
          <span>Character</span>
          <select
            aria-label={`${lane.name} synth character`}
            value={lane.soundVoice}
            onChange={(event) =>
              command('lane-melodic-voice', { laneId: lane.id, voice: event.target.value })
            }
          >
            <option value="pluck">Pluck</option>
            <option value="bass">Bass</option>
            <option value="soft-lead">Soft lead</option>
          </select>
        </label>
        <label>
          <span>Waveform</span>
          <select
            aria-label={`${lane.name} oscillator waveform`}
            value={lane.oscillator}
            onChange={(event) =>
              command('lane-oscillator', { laneId: lane.id, oscillator: event.target.value })
            }
          >
            <option value="sine">Sine ∿</option>
            <option value="triangle">Triangle ⋀</option>
            <option value="sawtooth">Sawtooth ⩘</option>
            <option value="square">Square / pulse ⊓</option>
          </select>
        </label>
        {knob('subOscillator')}
      </fieldset>
      <fieldset className="sound-module sound-filter">
        <legend>02 · Filter</legend>
        <div className="sound-module-caption">Low-pass filter</div>
        <div className="sound-knob-row">
          {knob('brightness')}
          {knob('resonance')}
        </div>
      </fieldset>
      <fieldset className="sound-module sound-envelope">
        <legend>03 · Amplitude envelope</legend>
        <svg
          className="sound-envelope-display"
          viewBox="0 0 310 80"
          role="img"
          aria-label={`${lane.name} ADSR envelope`}
        >
          <title>
            ADSR shape preview; time spacing is logarithmic. Playback follows the note gate.
          </title>
          <path className="sound-envelope-grid" d="M 12 15 H 298 M 12 40 H 298 M 12 65 H 298" />
          <path className="sound-envelope-fill" d={`${curve} Z`} />
          <path className="sound-envelope-line" d={curve} />
          {[
            [attackX, 15],
            [decayX, sustainY],
            [releaseX, sustainY],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="2.5" />
          ))}
        </svg>
        <div className="sound-knob-row">
          {knob('attack')}
          {knob('decay')}
          {knob('sustain')}
          {knob('release')}
        </div>
      </fieldset>
      <p className="sound-control-hint">
        Drag knobs ↑↓ · Shift for fine control · Click a value to type
      </p>
    </div>
  );
}
