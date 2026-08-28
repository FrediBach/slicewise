import { Checkbox, SelectControl, ValueControl } from '../../controls/FormControls';

export function SampleAndHoldControls() {
  return (
    <>
      <Checkbox id="sampleAndHold" randomizable>
        Sample-and-hold
      </Checkbox>
      <div className="effect-controls">
        <SelectControl
          id="sampleAndHoldAxis"
          label="Hold axis"
          defaultValue="y"
          randomizable
          disabled
          disabledReason="Turn on Sample-and-hold to choose an axis."
          rowClassName="select-row"
          controlId="sampleAndHoldAxisControl"
          optionDescriptions={{
            y: 'Holds Y values to create horizontal oscilloscope-like steps.',
            x: 'Holds X values to create vertical steps.',
          }}
        >
          <option value="y">Y — horizontal steps</option>
          <option value="x">X — vertical steps</option>
        </SelectControl>
        <ValueControl
          id="sampleAndHoldSpacing"
          label="Sample spacing"
          min="0.2"
          max="20"
          step="0.1"
          value="2"
          unit="mm"
          disabled
          disabledReason="Turn on Sample-and-hold to edit this parameter."
        />
        <ValueControl
          id="sampleAndHoldLength"
          label="Hold length"
          min="2"
          max="32"
          step="1"
          value="4"
          unit="samples"
          disabled
          disabledReason="Turn on Sample-and-hold to edit this parameter."
        />
        <ValueControl
          id="sampleAndHoldMix"
          label="Hold mix"
          min="0"
          max="100"
          step="1"
          value="100"
          unit="%"
          disabled
          disabledReason="Turn on Sample-and-hold to edit this parameter."
        />
        <p className="gradient-note blueprint-note">
          Resamples paths by distance, then holds one coordinate across groups of samples.
        </p>
      </div>
    </>
  );
}
