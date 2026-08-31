import { useEffect, useState, type CSSProperties } from 'react';
import { Download, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { SequencerUiLane, SequencerUiState } from './sequencer-ui';

const initialSequencerUiState: SequencerUiState = {
  mode: 'config',
  playing: false,
  playheadTick: 0,
  bar: 1,
  beat: 1,
  tempo: 110,
  pendingShape: false,
  hasExactSource: false,
  canExport: false,
  exportBars: 4,
  lanes: [],
};

function useSequencerUiState(): SequencerUiState {
  const [state, setState] = useState(initialSequencerUiState);
  useEffect(() => {
    const update = (event: CustomEvent<SequencerUiState>) => setState(event.detail);
    document.addEventListener('sequencerstatechange', update);
    document.dispatchEvent(new CustomEvent('sequencerstaterequest'));
    return () => document.removeEventListener('sequencerstatechange', update);
  }, []);
  return state;
}

const command = (type: string, detail: Record<string, unknown> = {}) =>
  document.dispatchEvent(new CustomEvent('sequencercommand', { detail: { type, ...detail } }));

const previewSource = (detail: Record<string, unknown>) =>
  document.dispatchEvent(new CustomEvent('sequencerpreviewchange', { detail }));

function numericCommand(type: string, value: string, detail: Record<string, unknown> = {}): void {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) command(type, { ...detail, value: numeric });
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function LaneRow({ lane }: { lane: SequencerUiLane }) {
  const presets =
    lane.kind === 'melodic'
      ? [
          ['contour-pluck', 'Contour pluck'],
          ['body-bass', 'Body / bass'],
          ['fragmentation-pluck', 'Fragment / pluck'],
        ]
      : [
          ['contour-kick', 'Contour kick'],
          ['fragmented-snare', 'Fragment / snare'],
          ['roughness-percussion', 'Rough percussion'],
        ];
  return (
    <div className="sequencer-lane" data-kind={lane.kind}>
      <div className="sequencer-lane-settings">
        <strong>{lane.name}</strong>
        <select
          aria-label={`${lane.name} lane type`}
          value={lane.kind}
          onChange={(event) => command('lane-kind', { laneId: lane.id, kind: event.target.value })}
        >
          <option value="melodic">Melodic</option>
          <option value="drum">Drum</option>
        </select>
        <select
          aria-label={`${lane.name} preset`}
          value={lane.preset}
          onChange={(event) =>
            command('lane-preset', { laneId: lane.id, preset: event.target.value })
          }
        >
          {presets.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label={`${lane.name} variation`}
          value={lane.variationTarget}
          onChange={(event) =>
            command('lane-variation', { laneId: lane.id, target: event.target.value })
          }
        >
          <option value="off">No variation</option>
          <option value="accent">Accent</option>
          {lane.kind === 'melodic' && <option value="octave">Octave</option>}
          <option value="articulation">Articulation</option>
          <option value="ratchet">Ratchet</option>
        </select>
        <label>
          Steps
          <input
            aria-label={`${lane.name} steps`}
            type="number"
            min="1"
            max="64"
            value={lane.steps}
            onChange={(event) =>
              numericCommand('lane-steps', event.target.value, { laneId: lane.id })
            }
          />
        </label>
        <label>
          Pulses
          <input
            aria-label={`${lane.name} pulses`}
            type="number"
            min="0"
            max={lane.steps}
            value={lane.pulses}
            onChange={(event) =>
              numericCommand('lane-pulses', event.target.value, { laneId: lane.id })
            }
          />
        </label>
        <button
          type="button"
          className={lane.muted ? 'is-active' : ''}
          aria-pressed={lane.muted}
          onClick={() => command('lane-mute', { laneId: lane.id })}
        >
          Mute
        </button>
        <button
          type="button"
          className={lane.solo ? 'is-active' : ''}
          aria-pressed={lane.solo}
          onClick={() => command('lane-solo', { laneId: lane.id })}
        >
          Solo
        </button>
        <button
          type="button"
          aria-label={`Delete ${lane.name}`}
          onClick={() => command('lane-delete', { laneId: lane.id })}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div
        className="sequencer-steps"
        aria-label={`${lane.name} sequence`}
        style={{ '--lane-steps': lane.steps } as CSSProperties}
      >
        {lane.sequence.map((step) => (
          <button
            type="button"
            key={step.index}
            className={[
              step.candidateHit ? 'is-hit' : '',
              step.candidateHit && !step.willFire ? 'is-skipped' : '',
              step.expressive ? 'is-expressive' : '',
              lane.activeStep === step.index ? 'is-current' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--step-value': step.value } as CSSProperties}
            aria-label={`${lane.name} step ${step.index + 1}: ${step.label}`}
            aria-current={lane.activeStep === step.index ? 'step' : undefined}
            onPointerEnter={() =>
              previewSource({ laneId: lane.id, stepIndex: step.index, active: true })
            }
            onPointerLeave={() => previewSource({ active: false })}
            onFocus={() => previewSource({ laneId: lane.id, stepIndex: step.index, active: true })}
            onBlur={() => previewSource({ active: false })}
            onClick={() => command('seek-step', { laneId: lane.id, stepIndex: step.index })}
          >
            <span />
          </button>
        ))}
      </div>
    </div>
  );
}

export function SequencerWorkspace() {
  const state = useSequencerUiState();

  useEffect(() => {
    if (state.mode !== 'sequencer') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      let handled = true;
      if (event.code === 'Space') command('play-toggle');
      else if (event.key === 'Home') command('seek', { tick: 0 });
      else if (event.key === 'ArrowLeft') command('step-transport', { amount: -1 });
      else if (event.key === 'ArrowRight') command('step-transport', { amount: 1 });
      else handled = false;
      if (handled) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state.mode]);

  if (state.mode !== 'sequencer') return null;

  return (
    <section className="sequencer-workspace" aria-label="Contour sequencer">
      <div className="sequencer-transport">
        <div className="sequencer-playback" aria-label="Sequencer playback controls">
          <button
            type="button"
            aria-label="Return sequencer to start"
            onClick={() => command('seek', { tick: 0 })}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            aria-label={state.playing ? 'Pause sequencer' : 'Play sequencer'}
            disabled={!state.hasExactSource}
            onClick={() => command('play-toggle')}
          >
            {state.playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>
        <output className="sequencer-position" aria-label="Sequencer position">
          Bar {state.bar} · Beat {state.beat.toFixed(2)}
        </output>
        <label>
          Tempo
          <input
            aria-label="Sequencer tempo"
            type="number"
            min="40"
            max="240"
            value={state.tempo}
            onChange={(event) => numericCommand('tempo', event.target.value)}
          />
          BPM
        </label>
        <div className="sequencer-add-lanes">
          <button type="button" onClick={() => command('lane-add', { kind: 'melodic' })}>
            <Plus size={13} /> Melody
          </button>
          <button type="button" onClick={() => command('lane-add', { kind: 'drum' })}>
            <Plus size={13} /> Drum
          </button>
        </div>
        <label>
          Export
          <select
            aria-label="MIDI export bars"
            value={state.exportBars}
            onChange={(event) => numericCommand('export-bars', event.target.value)}
          >
            {[1, 2, 4, 8, 16, 32].map((bars) => (
              <option key={bars} value={bars}>
                {bars} bars
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="sequencer-midi-export"
          disabled={!state.canExport}
          onClick={() => command('export-midi')}
        >
          <Download size={13} /> MIDI
        </button>
        <span className={state.pendingShape ? 'sequencer-pending is-pending' : 'sequencer-pending'}>
          {state.pendingShape
            ? 'Pending shape · next bar'
            : state.hasExactSource
              ? 'Exact shape ready'
              : 'Waiting for exact shape'}
        </span>
      </div>
      <div className="sequencer-ruler" aria-hidden="true">
        <span>Lanes</span>
        <div>
          {Array.from({ length: 16 }, (_, index) => (
            <i key={index}>{index + 1}</i>
          ))}
        </div>
      </div>
      <div className="sequencer-lanes">
        {state.lanes.map((lane) => (
          <LaneRow key={lane.id} lane={lane} />
        ))}
      </div>
    </section>
  );
}
