import { ChevronDown } from 'lucide-react';
import { Section } from '../ui/section';
import { Checkbox, FieldGroup, RandomLock, ValueControl } from '../controls/FormControls';

export function ContoursPanel() {
  return (
    <Section title="Contours" badge="02">
      <FieldGroup title="Density & finish">
        <ValueControl id="lines" label="Line count" min="1" max="200" step="1" value="40" />
        <ValueControl id="quality" label="Curve quality" min="1" max="10" step="1" value="7" />
      </FieldGroup>
      <FieldGroup title="Line spacing">
        <div className="control-row select-row">
          <div className="control-label">
            <label htmlFor="gapEase">Gap easing</label>
            <RandomLock id="gapEase" label="Gap easing" />
          </div>
          <div className="select-wrap">
            <select id="gapEase" defaultValue="linear">
              <option value="linear">Linear</option>
              <optgroup label="Sine">
                <option value="sine-in">Sine · in</option>
                <option value="sine-out">Sine · out</option>
                <option value="sine-in-out">Sine · in &amp; out</option>
                <option value="sine-out-in">Sine · out &amp; in</option>
              </optgroup>
              <optgroup label="Quadratic">
                <option value="ease-in">Quadratic · in</option>
                <option value="ease-out">Quadratic · out</option>
                <option value="ease-in-out">Quadratic · in &amp; out</option>
                <option value="ease-out-in">Quadratic · out &amp; in</option>
              </optgroup>
              <optgroup label="Cubic">
                <option value="cubic-in">Cubic · in</option>
                <option value="cubic-out">Cubic · out</option>
                <option value="cubic-in-out">Cubic · in &amp; out</option>
                <option value="cubic-out-in">Cubic · out &amp; in</option>
              </optgroup>
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <ValueControl
          id="easeStrength"
          label="Ease strength"
          min="0"
          max="300"
          step="1"
          value="100"
          unit="%"
        />
        <ValueControl id="easeCycles" label="Ease cycles" min="1" max="12" step="1" value="1" />
        <ValueControl
          id="easeCenter"
          label="Ease centre"
          min="5"
          max="95"
          step="1"
          value="50"
          unit="%"
          disabled
        />
      </FieldGroup>
      <FieldGroup title="Slice plane">
        <div className="control-row select-row">
          <div className="control-label">
            <label htmlFor="axis">Slice axis</label>
            <RandomLock id="axis" label="Slice axis" />
          </div>
          <div className="select-wrap">
            <select id="axis" defaultValue="up">
              <option value="up">Height · topographic</option>
              <option value="cam">View depth · camera</option>
              <option value="x">Model width</option>
              <option value="y">Model depth</option>
              <option value="custom">Custom plane angle</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="custom-axis" id="customAxis" hidden>
          <ValueControl
            id="cutAz"
            label="Azimuth"
            min="-180"
            max="180"
            step="1"
            value="0"
            unit="°"
          />
          <ValueControl
            id="cutEl"
            label="Elevation"
            min="-90"
            max="90"
            step="1"
            value="90"
            unit="°"
          />
        </div>
        <ValueControl
          id="divergence"
          label="Divergence"
          min="0"
          max="160"
          step="1"
          value="0"
          unit="°"
          morphable={false}
          randomizable
        />
        <Checkbox id="sliceLfo" randomizable>
          Modulate slice planes
        </Checkbox>
        <div className="effect-controls">
          <ValueControl
            id="sliceLfoAmplitude"
            label="LFO amplitude"
            min="0"
            max="400"
            step="1"
            value="75"
            unit="% gap"
            disabled
          />
          <ValueControl
            id="sliceLfoCycles"
            label="LFO cycles"
            min="0.25"
            max="12"
            step="0.25"
            value="2"
            disabled
          />
          <ValueControl
            id="sliceLfoAngle"
            label="LFO direction"
            min="0"
            max="180"
            step="1"
            value="0"
            unit="°"
            disabled
          />
          <ValueControl
            id="sliceLfoPhase"
            label="LFO phase"
            min="0"
            max="360"
            step="1"
            value="0"
            unit="°"
            disabled
          />
          <div className="control-row select-row is-disabled" id="sliceLfoWaveformControl">
            <label htmlFor="sliceLfoWaveform">Waveform</label>
            <div className="select-wrap">
              <select id="sliceLfoWaveform" defaultValue="sine" disabled>
                <option value="sine">Sine</option>
                <option value="triangle">Triangle</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
          <Checkbox id="sliceLfoModulation" randomizable>
            Modulate LFO
          </Checkbox>
          <div className="effect-controls">
            <div className="control-row select-row is-disabled" id="sliceLfoModulationModeControl">
              <label htmlFor="sliceLfoModulationMode">Mode</label>
              <div className="select-wrap">
                <select id="sliceLfoModulationMode" defaultValue="amplitude" disabled>
                  <option value="amplitude">Amplitude</option>
                  <option value="frequency">Frequency</option>
                </select>
                <ChevronDown size={14} />
              </div>
            </div>
            <ValueControl
              id="sliceLfoModulationDepth"
              label="Mod depth"
              min="0"
              max="100"
              step="1"
              value="50"
              unit="%"
              disabled
            />
            <ValueControl
              id="sliceLfoModulationCycles"
              label="Mod cycles"
              min="0.25"
              max="8"
              step="0.25"
              value="1"
              disabled
            />
            <ValueControl
              id="sliceLfoModulationPhase"
              label="Mod phase"
              min="0"
              max="360"
              step="1"
              value="0"
              unit="°"
              disabled
            />
          </div>
          <p className="gradient-note blueprint-note">
            Warps the cutting surface itself. Curve quality controls intersection precision and
            smoothness.
          </p>
        </div>
      </FieldGroup>
      <FieldGroup title="Path construction" className="field-group--checks">
        <div className="check-grid">
          <Checkbox id="spiral" randomizable>
            Continuous spiral
          </Checkbox>
          <Checkbox id="hide" defaultChecked randomizable>
            Remove hidden lines
          </Checkbox>
          <Checkbox id="sil" defaultChecked randomizable>
            Add outer silhouette
          </Checkbox>
        </div>
      </FieldGroup>
    </Section>
  );
}
