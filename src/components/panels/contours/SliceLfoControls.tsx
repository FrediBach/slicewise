import { Checkbox, SelectControl, ValueControl } from '../../controls/FormControls';

export function SliceLfoControls() {
  return (
    <>
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
          disabledReason="Turn on Modulate slice planes to edit this parameter."
        />
        <ValueControl
          id="sliceLfoCycles"
          label="LFO cycles"
          min="0.25"
          max="12"
          step="0.25"
          value="2"
          disabled
          disabledReason="Turn on Modulate slice planes to edit this parameter."
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
          disabledReason="Turn on Modulate slice planes to edit this parameter."
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
          disabledReason="Turn on Modulate slice planes to edit this parameter."
        />
        <SelectControl
          id="sliceLfoWaveform"
          label="Waveform"
          defaultValue="sine"
          disabled
          disabledReason="Turn on Modulate slice planes to edit this parameter."
          rowClassName="select-row"
          controlId="sliceLfoWaveformControl"
          optionDescriptions={{
            sine: 'Applies a smooth periodic displacement to the cutting surface.',
            triangle: 'Applies a linear back-and-forth displacement with sharper turning points.',
          }}
        >
          <option value="sine">Sine</option>
          <option value="triangle">Triangle</option>
        </SelectControl>
        <Checkbox id="sliceLfoModulation" randomizable>
          Modulate LFO
        </Checkbox>
        <div className="effect-controls">
          <SelectControl
            id="sliceLfoModulationMode"
            label="Mode"
            defaultValue="amplitude"
            disabled
            disabledReason="Turn on Modulate slice planes and Modulate LFO to edit this parameter."
            rowClassName="select-row"
            controlId="sliceLfoModulationModeControl"
            optionDescriptions={{
              amplitude: 'Varies the LFO displacement strength over the modulation cycle.',
              frequency:
                'Varies how tightly the LFO oscillations are packed over the modulation cycle.',
            }}
          >
            <option value="amplitude">Amplitude</option>
            <option value="frequency">Frequency</option>
          </SelectControl>
          <ValueControl
            id="sliceLfoModulationDepth"
            label="Mod depth"
            min="0"
            max="100"
            step="1"
            value="50"
            unit="%"
            disabled
            disabledReason="Turn on Modulate slice planes and Modulate LFO to edit this parameter."
          />
          <ValueControl
            id="sliceLfoModulationCycles"
            label="Mod cycles"
            min="0.25"
            max="8"
            step="0.25"
            value="1"
            disabled
            disabledReason="Turn on Modulate slice planes and Modulate LFO to edit this parameter."
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
            disabledReason="Turn on Modulate slice planes and Modulate LFO to edit this parameter."
          />
        </div>
        <p className="gradient-note blueprint-note">
          Warps the cutting surface itself. Curve quality controls intersection precision and
          smoothness.
        </p>
      </div>
    </>
  );
}
