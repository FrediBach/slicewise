import { useEffect, useState, type CSSProperties } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Dices,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { DRUM_VOICE_OPTIONS } from '../../lib/sequencer-project';
import type { SequencerUiLane, SequencerUiState } from './sequencer-ui';

type SequencerTab = 'pattern' | 'sound' | 'mapping';

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

const contourFeatures = [
  ['area', 'Area'],
  ['length', 'Length'],
  ['pathCount', 'Fragments'],
  ['closedness', 'Closedness'],
  ['roughness', 'Roughness'],
  ['centroidX', 'Centroid X'],
  ['centroidY', 'Centroid Y'],
  ['level', 'Slice level'],
] as const;

const melodicSoundControls = [
  ['brightness', 'Brightness %', 'brightness', 0, 100, 1],
  ['resonance', 'Resonance', 'filter resonance', 0, 20, 0.1],
  ['subOscillator', 'Sub oscillator %', 'sub oscillator', 0, 100, 1],
  ['attack', 'Attack (s)', 'envelope attack', 0.001, 2, 0.001],
  ['decay', 'Decay (s)', 'envelope decay', 0.01, 3, 0.01],
  ['sustain', 'Sustain %', 'envelope sustain', 0, 100, 1],
  ['release', 'Release (s)', 'envelope release', 0.01, 5, 0.01],
] as const;

function SoundControls({ lane }: { lane: SequencerUiLane }) {
  if (lane.kind === 'drum')
    return (
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
    );
  return (
    <>
      <label>
        <span>Synth character</span>
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
          <option value="sine">Sine</option>
          <option value="triangle">Triangle</option>
          <option value="sawtooth">Sawtooth</option>
          <option value="square">Square / pulse</option>
        </select>
      </label>
      {melodicSoundControls.map(([key, label, aria, minimum, maximum, step]) => (
        <label key={key}>
          <span>{label}</span>
          <input
            aria-label={`${lane.name} ${aria}`}
            type="number"
            min={minimum}
            max={maximum}
            step={step}
            value={lane[key]}
            onChange={(event) =>
              numericCommand(
                `lane-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
                event.target.value,
                { laneId: lane.id },
              )
            }
          />
        </label>
      ))}
    </>
  );
}

function LaneRow({ lane, activeTab }: { lane: SequencerUiLane; activeTab: SequencerTab }) {
  const [collapsed, setCollapsed] = useState(false);
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
    <div
      className="sequencer-lane"
      data-kind={lane.kind}
      data-collapsed={collapsed ? '' : undefined}
      style={{ '--lane-color': lane.color } as CSSProperties}
    >
      <header className="sequencer-lane-header">
        <div className="sequencer-lane-title">
          <span className="sequencer-lane-kind" aria-hidden="true" />
          <div>
            <strong>{lane.name}</strong>
            <small>{lane.kind === 'melodic' ? 'Melodic voice' : 'Drum voice'}</small>
          </div>
        </div>
        <div className="sequencer-lane-actions">
          <button
            type="button"
            aria-label={`Randomize ${lane.name} ${activeTab} settings`}
            title={`Randomize visible ${activeTab} settings`}
            onClick={() => command('lane-randomize', { laneId: lane.id, section: activeTab })}
          >
            <Dices size={12} /> Randomize
          </button>
          <button
            type="button"
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${lane.name}`}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
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
      </header>
      <div className="sequencer-lane-body" hidden={collapsed}>
        <div className="sequencer-lane-settings">
          <div className="sequencer-tab-panel" hidden={activeTab !== 'pattern'}>
            <label>
              <span>Voice type</span>
              <select
                aria-label={`${lane.name} lane type`}
                value={lane.kind}
                onChange={(event) =>
                  command('lane-kind', { laneId: lane.id, kind: event.target.value })
                }
              >
                <option value="melodic">Melodic</option>
                <option value="drum">Drum</option>
              </select>
            </label>
            <label>
              <span>Starting sound</span>
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
            </label>
            <label>
              <span>Contour variation</span>
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
            </label>
            <label>
              <span>Clock divider</span>
              <select
                aria-label={`${lane.name} clock divider`}
                value={lane.clockDivision}
                onChange={(event) =>
                  command('lane-clock-division', {
                    laneId: lane.id,
                    division: event.target.value,
                  })
                }
              >
                <optgroup label="Grid clock">
                  <option value="1/4">1/4 note</option>
                  <option value="1/8">1/8 note</option>
                  <option value="1/16">1/16 note</option>
                  <option value="1/32">1/32 note</option>
                </optgroup>
                <optgroup label="Fit full cycle">
                  <option value="fit-1">Fit to 1 bar</option>
                  <option value="fit-2">Fit to 2 bars</option>
                  <option value="fit-4">Fit to 4 bars</option>
                </optgroup>
              </select>
            </label>
            <div className="sequencer-field-pair">
              <label>
                <span>Cycle steps</span>
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
                <span>Active pulses</span>
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
            </div>
          </div>
          <div className="sequencer-tab-panel" hidden={activeTab !== 'sound'}>
            <SoundControls lane={lane} />
          </div>
          <div className="sequencer-tab-panel" hidden={activeTab !== 'mapping'}>
            <label>
              <span>Slice travel</span>
              <select
                aria-label={`${lane.name} slice travel direction`}
                value={lane.direction}
                onChange={(event) =>
                  command('lane-direction', { laneId: lane.id, direction: event.target.value })
                }
              >
                <option value="forward">Forward</option>
                <option value="reverse">Reverse</option>
                <option value="ping-pong">Ping-pong</option>
              </select>
            </label>
            <label>
              <span>Contour point</span>
              <input
                aria-label={`${lane.name} position around contour`}
                type="number"
                min="0"
                max="100"
                value={lane.trackPosition}
                onChange={(event) =>
                  numericCommand('lane-track-position', event.target.value, { laneId: lane.id })
                }
              />
            </label>
            <div className="sequencer-field-pair">
              <label>
                <span>Range from</span>
                <input
                  aria-label={`${lane.name} slice range start`}
                  type="number"
                  min="0"
                  max={lane.traversalEnd}
                  value={lane.traversalStart}
                  onChange={(event) =>
                    numericCommand('lane-traversal-start', event.target.value, { laneId: lane.id })
                  }
                />
              </label>
              <label>
                <span>Range to</span>
                <input
                  aria-label={`${lane.name} slice range end`}
                  type="number"
                  min={lane.traversalStart}
                  max="100"
                  value={lane.traversalEnd}
                  onChange={(event) =>
                    numericCommand('lane-traversal-end', event.target.value, { laneId: lane.id })
                  }
                />
              </label>
            </div>
            <label>
              <span>Geometry warp</span>
              <select
                aria-label={`${lane.name} traversal geometry modulation`}
                value={lane.modulationSource}
                onChange={(event) =>
                  command('lane-traversal-source', { laneId: lane.id, source: event.target.value })
                }
              >
                <option value="off">Uniform</option>
                {contourFeatures.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sequencer-field-pair">
              <label>
                <span>Warp amount</span>
                <input
                  aria-label={`${lane.name} traversal modulation amount`}
                  type="number"
                  min="-100"
                  max="100"
                  value={lane.modulationAmount}
                  disabled={lane.modulationSource === 'off'}
                  onChange={(event) =>
                    numericCommand('lane-traversal-amount', event.target.value, { laneId: lane.id })
                  }
                />
              </label>
              <label>
                <span>Shape influence</span>
                <input
                  aria-label={`${lane.name} contour influence`}
                  type="number"
                  min="0"
                  max="100"
                  value={lane.contourInfluence}
                  onChange={(event) =>
                    numericCommand('lane-contour-influence', event.target.value, {
                      laneId: lane.id,
                    })
                  }
                />
              </label>
            </div>
          </div>
        </div>
        <div className="sequencer-sequence-panel">
          <div className="sequencer-sequence-heading">
            <span>Cycle preview</span>
            <small>Click a step to seek · hover to locate its contour</small>
          </div>
          <div className="sequencer-steps-scroll">
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
                  onFocus={() =>
                    previewSource({ laneId: lane.id, stepIndex: step.index, active: true })
                  }
                  onBlur={() => previewSource({ active: false })}
                  onClick={() => command('seek-step', { laneId: lane.id, stepIndex: step.index })}
                >
                  <span />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SequencerWorkspace() {
  const state = useSequencerUiState();
  const [activeTab, setActiveTab] = useState<SequencerTab>('pattern');

  useEffect(() => {
    if (state.mode !== 'sequencer') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
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
      <header className="sequencer-transport">
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
        <div className="sequencer-transport-divider" />
        <label className="sequencer-tempo">
          <span>Tempo</span>
          <span>
            <input
              aria-label="Sequencer tempo"
              type="number"
              min="40"
              max="240"
              value={state.tempo}
              onChange={(event) => numericCommand('tempo', event.target.value)}
            />
            BPM
          </span>
        </label>
        <span
          className={[
            'sequencer-pending',
            state.pendingShape ? 'is-pending' : '',
            !state.pendingShape && state.hasExactSource ? 'is-ready' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <i />
          {state.pendingShape
            ? 'Pending shape · next bar'
            : state.hasExactSource
              ? 'Exact shape ready'
              : 'Waiting for exact shape'}
        </span>
        <div className="sequencer-transport-spacer" />
        <div className="sequencer-export-group">
          <label>
            <span>Export length</span>
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
        </div>
      </header>
      <div className="sequencer-workspace-nav">
        <div
          className="sequencer-tabs"
          role="tablist"
          aria-label="Sequencer lane settings"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const tabsInOrder: SequencerTab[] = ['pattern', 'sound', 'mapping'];
            const offset = event.key === 'ArrowRight' ? 1 : -1;
            const nextTab = tabsInOrder[(tabsInOrder.indexOf(activeTab) + offset + 3) % 3];
            setActiveTab(nextTab);
            const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
            tabs[tabsInOrder.indexOf(nextTab)]?.focus();
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pattern'}
            tabIndex={activeTab === 'pattern' ? 0 : -1}
            onClick={() => setActiveTab('pattern')}
          >
            Pattern
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sound'}
            tabIndex={activeTab === 'sound' ? 0 : -1}
            onClick={() => setActiveTab('sound')}
          >
            Sound
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mapping'}
            tabIndex={activeTab === 'mapping' ? 0 : -1}
            onClick={() => setActiveTab('mapping')}
          >
            Shape mapping
          </button>
        </div>
        <p id={`sequencer-${activeTab}-description`}>
          {activeTab === 'pattern'
            ? 'Choose each lane’s role, rhythmic cycle, and the musical detail shaped by the contours.'
            : activeTab === 'sound'
              ? 'Shape each melodic envelope and timbre, or choose an 808/909-inspired percussion instrument.'
              : 'Choose a distinct point around the contour, then control how the lane travels through the slice stack.'}
        </p>
        <div className="sequencer-add-lanes">
          <button type="button" onClick={() => command('lane-add', { kind: 'melodic' })}>
            <Plus size={13} /> Melody
          </button>
          <button type="button" onClick={() => command('lane-add', { kind: 'drum' })}>
            <Plus size={13} /> Drum
          </button>
        </div>
      </div>
      <div className="sequencer-lanes">
        {state.lanes.map((lane) => (
          <LaneRow key={lane.id} lane={lane} activeTab={activeTab} />
        ))}
      </div>
    </section>
  );
}
