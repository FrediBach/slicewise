import { Checkbox, SelectControl, ValueControl } from '../../controls/FormControls';

export function StaggeredSliceControls() {
  return (
    <>
      <Checkbox id="staggeredSlices" randomizable>
        Staggered slices
      </Checkbox>
      <div className="effect-controls">
        <SelectControl
          id="staggeredSlicesOrientation"
          label="Slice orientation"
          defaultValue="horizontal"
          randomizable
          disabled
          disabledReason="Turn on Staggered slices to choose an orientation."
          rowClassName="select-row"
          controlId="staggeredSlicesOrientationControl"
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </SelectControl>
        <SelectControl
          id="staggeredSlicesPattern"
          label="Stagger pattern"
          defaultValue="ramp"
          randomizable
          disabled
          disabledReason="Turn on Staggered slices to choose a pattern."
          rowClassName="select-row"
          controlId="staggeredSlicesPatternControl"
          optionDescriptions={{
            ramp: 'Progressively shifts strips from negative to positive displacement.',
            alternating: 'Moves adjacent strips in opposing directions.',
            seeded: 'Assigns each strip a stable irregular displacement.',
          }}
        >
          <option value="ramp">Ramp</option>
          <option value="alternating">Alternating</option>
          <option value="seeded">Seeded irregular</option>
        </SelectControl>
        <ValueControl
          id="staggeredSlicesCount"
          label="Slices"
          min="2"
          max="48"
          step="1"
          value="12"
          disabled
          disabledReason="Turn on Staggered slices to edit this parameter."
        />
        <ValueControl
          id="staggeredSlicesExtent"
          label="Region extent"
          min="10"
          max="100"
          step="1"
          value="70"
          unit="%"
          disabled
          disabledReason="Turn on Staggered slices to edit this parameter."
        />
        <ValueControl
          id="staggeredSlicesDisplacement"
          label="Maximum stagger"
          min="0.5"
          max="60"
          step="0.5"
          value="10"
          unit="mm"
          disabled
          disabledReason="Turn on Staggered slices to edit this parameter."
        />
        <ValueControl
          id="staggeredSlicesSeed"
          label="Stagger seed"
          min="0"
          max="9999"
          step="1"
          value="3"
          morphable={false}
          randomizable
          disabled
          disabledReason="Choose Seeded irregular to edit this parameter."
        />
        <p className="gradient-note blueprint-note">
          Divides a centred region into touching strips and shifts every strip along its long axis.
        </p>
      </div>
    </>
  );
}
