import { Checkbox, FieldGroup, ValueControl } from '../controls/FormControls';

export function GenerativeMaskControls() {
  return (
    <FieldGroup title="Generative mask">
      <Checkbox id="maskEnabled" randomizable>
        Clip to generative shape
      </Checkbox>
      <Checkbox id="maskOutline" randomizable>
        Draw mask outline
      </Checkbox>
      <div className="effect-controls">
        <ValueControl
          id="maskRoundness"
          label="Roundness"
          min="0"
          max="100"
          step="1"
          value="100"
          unit="%"
          disabled
        />
        <ValueControl
          id="maskScaleX"
          label="Width"
          min="10"
          max="100"
          step="1"
          value="100"
          unit="%"
          disabled
        />
        <ValueControl
          id="maskScaleY"
          label="Height"
          min="10"
          max="100"
          step="1"
          value="100"
          unit="%"
          disabled
        />
        <ValueControl
          id="maskOffsetX"
          label="Offset X"
          min="-100"
          max="100"
          step="1"
          value="0"
          unit="%"
          disabled
        />
        <ValueControl
          id="maskOffsetY"
          label="Offset Y"
          min="-100"
          max="100"
          step="1"
          value="0"
          unit="%"
          disabled
        />
        <p className="gradient-note blueprint-note">
          Roundness morphs from rectangle to ellipse. Two angular LFOs reshape the boundary; wave
          morph moves continuously from sine through triangle to a rounded square wave.
        </p>
        <ValueControl
          id="maskLfo1Amplitude"
          label="LFO 1 amplitude"
          min="0"
          max="45"
          step="1"
          value="0"
          unit="%"
          disabled
        />
        <ValueControl
          id="maskLfo1Cycles"
          label="LFO 1 cycles"
          min="1"
          max="12"
          step="0.25"
          value="3"
          disabled
        />
        <ValueControl
          id="maskLfo1Phase"
          label="LFO 1 phase"
          min="0"
          max="360"
          step="1"
          value="0"
          unit="°"
          disabled
        />
        <ValueControl
          id="maskLfo1Waveform"
          label="LFO 1 wave morph"
          min="0"
          max="100"
          step="1"
          value="0"
          unit="%"
          disabled
        />
        <ValueControl
          id="maskLfo2Amplitude"
          label="LFO 2 amplitude"
          min="0"
          max="45"
          step="1"
          value="0"
          unit="%"
          disabled
        />
        <ValueControl
          id="maskLfo2Cycles"
          label="LFO 2 cycles"
          min="1"
          max="12"
          step="0.25"
          value="5"
          disabled
        />
        <ValueControl
          id="maskLfo2Phase"
          label="LFO 2 phase"
          min="0"
          max="360"
          step="1"
          value="90"
          unit="°"
          disabled
        />
        <ValueControl
          id="maskLfo2Waveform"
          label="LFO 2 wave morph"
          min="0"
          max="100"
          step="1"
          value="0"
          unit="%"
          disabled
        />
      </div>
    </FieldGroup>
  );
}
