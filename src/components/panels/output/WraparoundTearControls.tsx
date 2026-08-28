import { Checkbox, SelectControl, ValueControl } from '../../controls/FormControls';

export function WraparoundTearControls() {
  return (
    <>
      <Checkbox id="wraparoundTear" randomizable>
        Wraparound tear
      </Checkbox>
      <div className="effect-controls">
        <SelectControl
          id="wraparoundTearOrientation"
          label="Tear orientation"
          defaultValue="horizontal"
          randomizable
          disabled
          disabledReason="Turn on Wraparound tear to choose an orientation."
          rowClassName="select-row"
          controlId="wraparoundTearOrientationControl"
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </SelectControl>
        <ValueControl
          id="wraparoundTearPosition"
          label="Band position"
          min="0"
          max="100"
          step="1"
          value="50"
          unit="%"
          disabled
          disabledReason="Turn on Wraparound tear to edit this parameter."
        />
        <ValueControl
          id="wraparoundTearSize"
          label="Band size"
          min="1"
          max="100"
          step="1"
          value="18"
          unit="%"
          disabled
          disabledReason="Turn on Wraparound tear to edit this parameter."
        />
        <ValueControl
          id="wraparoundTearShift"
          label="Wrap shift"
          min="-200"
          max="200"
          step="0.5"
          value="20"
          unit="mm"
          disabled
          disabledReason="Turn on Wraparound tear to edit this parameter."
        />
        <p className="gradient-note blueprint-note">
          Shifts one full-span band and wraps overflow to the opposite drawable edge.
        </p>
      </div>
    </>
  );
}
