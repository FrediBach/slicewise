import { InstrumentChoice, InstrumentFader } from '../controls/InstrumentControls';
import type { SequencerUiLane } from './sequencer-ui';

type Props = {
  lane: SequencerUiLane;
  command: (type: string, detail: Record<string, unknown>) => void;
};
const contourFeatures = [
  ['off', 'Uniform'],
  ['area', 'Area'],
  ['length', 'Length'],
  ['pathCount', 'Fragments'],
  ['closedness', 'Closedness'],
  ['roughness', 'Roughness'],
  ['centroidX', 'Centroid X'],
  ['centroidY', 'Centroid Y'],
  ['level', 'Slice level'],
] as const;

export function PatternControls({ lane, command }: Props) {
  const send = (type: string, detail: Record<string, unknown>) =>
    command(type, { laneId: lane.id, ...detail });
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
    <div className="lane-control-rack pattern-rack">
      <fieldset className="sound-module lane-control-module">
        <legend>01 · Voice</legend>
        <span className="instrument-caption">Lane type</span>
        <InstrumentChoice
          label={`${lane.name} lane type`}
          value={lane.kind}
          options={[
            ['melodic', 'Melodic'],
            ['drum', 'Drum'],
          ]}
          onChange={(kind) => send('lane-kind', { kind })}
        />
        <label>
          <span>Starting preset</span>
          <select
            aria-label={`${lane.name} preset`}
            value={lane.preset}
            onChange={(event) => send('lane-preset', { preset: event.target.value })}
          >
            {presets.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <fieldset className="sound-module lane-control-module">
        <legend>02 · Rhythm</legend>
        <div className="instrument-rhythm-summary">
          <strong>
            {lane.pulses}
            <small> / {lane.steps}</small>
          </strong>
          <span>pulses per cycle</span>
        </div>
        <InstrumentFader
          label="Cycle length"
          ariaLabel={`${lane.name} steps`}
          value={lane.steps}
          min={1}
          max={64}
          unit=""
          onChange={(value) => send('lane-steps', { value })}
        />
        <InstrumentFader
          label="Active pulses"
          ariaLabel={`${lane.name} pulses`}
          value={lane.pulses}
          max={lane.steps}
          unit=""
          onChange={(value) => send('lane-pulses', { value })}
        />
      </fieldset>
      <fieldset className="sound-module lane-control-module">
        <legend>03 · Clock & expression</legend>
        <span className="instrument-caption">Grid clock · note division</span>
        <InstrumentChoice
          label={`${lane.name} clock divider`}
          value={lane.clockDivision}
          options={[
            ['1/4', '1/4'],
            ['1/8', '1/8'],
            ['1/16', '1/16'],
            ['1/32', '1/32'],
          ]}
          onChange={(division) => send('lane-clock-division', { division })}
        />
        <span className="instrument-caption">Or fit the whole cycle</span>
        <InstrumentChoice
          label={`${lane.name} fit cycle`}
          value={lane.clockDivision}
          options={[
            ['fit-1', '1 bar'],
            ['fit-2', '2 bars'],
            ['fit-4', '4 bars'],
          ]}
          onChange={(division) => send('lane-clock-division', { division })}
        />
        <label>
          <span>Contour variation</span>
          <select
            aria-label={`${lane.name} variation`}
            value={lane.variationTarget}
            onChange={(event) => send('lane-variation', { target: event.target.value })}
          >
            <option value="off">No variation</option>
            <option value="accent">Accent</option>
            {lane.kind === 'melodic' && <option value="octave">Octave</option>}
            <option value="articulation">Articulation</option>
            <option value="ratchet">Ratchet</option>
          </select>
        </label>
      </fieldset>
      <p className="sound-control-hint">
        Pulses are distributed across the cycle · Use the faders, −/+ buttons, or type a value
      </p>
    </div>
  );
}

export function MappingControls({ lane, command }: Props) {
  const send = (type: string, detail: Record<string, unknown>) =>
    command(type, { laneId: lane.id, ...detail });
  const pointAngle = (lane.trackPosition / 100) * Math.PI * 2 - Math.PI / 2;
  return (
    <div className="lane-control-rack mapping-rack">
      <fieldset className="sound-module lane-control-module">
        <legend>01 · Contour position</legend>
        <div className="contour-position-display">
          <svg
            viewBox="0 0 120 84"
            role="img"
            aria-label={`${lane.name} contour position: ${lane.trackPosition}%`}
          >
            <title>Normalized position around a contour; schematic, not the source geometry</title>
            <ellipse
              cx="60"
              cy="42"
              rx="42"
              ry="27"
              fill="none"
              stroke="currentColor"
              opacity="0.25"
              strokeWidth="2"
            />
            <path d="M 60 10 V 20" stroke="currentColor" />
            <circle
              cx={60 + Math.cos(pointAngle) * 42}
              cy={42 + Math.sin(pointAngle) * 27}
              r="5"
              fill="currentColor"
            />
            <text x="60" y="46" textAnchor="middle">
              {lane.trackPosition}%
            </text>
          </svg>
        </div>
        <InstrumentFader
          label="Around contour"
          ariaLabel={`${lane.name} position around contour`}
          value={lane.trackPosition}
          onChange={(value) => send('lane-track-position', { value })}
        />
        <p className="instrument-note">Choose where this lane follows the contour.</p>
      </fieldset>
      <fieldset className="sound-module lane-control-module">
        <legend>02 · Slice travel</legend>
        <InstrumentChoice
          label={`${lane.name} slice travel direction`}
          value={lane.direction}
          options={[
            ['forward', 'Forward →'],
            ['reverse', 'Reverse ←'],
            ['ping-pong', 'Ping-pong ↔'],
          ]}
          onChange={(direction) => send('lane-direction', { direction })}
        />
        <svg
          className="slice-window-display"
          viewBox="0 0 300 45"
          role="img"
          aria-label={`${lane.name} selected slice range: ${lane.traversalStart}% to ${lane.traversalEnd}%`}
        >
          {Array.from({ length: 21 }, (_, i) => (
            <path
              key={i}
              d={`M ${10 + i * 14} 10 V 35`}
              stroke="currentColor"
              opacity={i * 5 >= lane.traversalStart && i * 5 <= lane.traversalEnd ? 0.8 : 0.16}
              strokeWidth="3"
            />
          ))}
          <rect
            x={10 + lane.traversalStart * 2.8}
            y="5"
            width={Math.max(1, (lane.traversalEnd - lane.traversalStart) * 2.8)}
            height="35"
            fill="currentColor"
            fillOpacity="0.08"
            stroke="currentColor"
          />
        </svg>
        <InstrumentFader
          label="Range start"
          ariaLabel={`${lane.name} slice range start`}
          value={lane.traversalStart}
          max={lane.traversalEnd}
          onChange={(value) => send('lane-traversal-start', { value })}
        />
        <InstrumentFader
          label="Range end"
          ariaLabel={`${lane.name} slice range end`}
          value={lane.traversalEnd}
          min={lane.traversalStart}
          onChange={(value) => send('lane-traversal-end', { value })}
        />
      </fieldset>
      <fieldset className="sound-module lane-control-module">
        <legend>03 · Shape modulation</legend>
        <label>
          <span>Geometry warp source</span>
          <select
            aria-label={`${lane.name} traversal geometry modulation`}
            value={lane.modulationSource}
            onChange={(event) => send('lane-traversal-source', { source: event.target.value })}
          >
            {contourFeatures.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <InstrumentFader
          label="Warp amount"
          ariaLabel={`${lane.name} traversal modulation amount`}
          value={lane.modulationAmount}
          min={-100}
          bipolar
          disabled={lane.modulationSource === 'off'}
          onChange={(value) => send('lane-traversal-amount', { value })}
        />
        <InstrumentFader
          label="Shape influence"
          ariaLabel={`${lane.name} contour influence`}
          value={lane.contourInfluence}
          onChange={(value) => send('lane-contour-influence', { value })}
        />
        <p className="instrument-note">
          {lane.modulationSource === 'off'
            ? 'Choose a warp source to vary slice travel.'
            : 'Negative warp reverses the source’s influence on travel.'}{' '}
          Shape influence blends neutral and contour-derived music.
        </p>
      </fieldset>
      <p className="sound-control-hint">
        The selected route is highlighted on the shape · Hover a step to locate its source
      </p>
    </div>
  );
}
