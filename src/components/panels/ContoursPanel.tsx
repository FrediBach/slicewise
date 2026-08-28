import { SliceFieldControls } from './contours/SliceFieldControls';
import { Section } from '../ui/section';
import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../controls/FormControls';

export function ContoursPanel() {
  return (
    <Section
      title="Contours"
      description="Shape the slice density, spacing, and path construction."
      badge="03"
      defaultOpen
    >
      <FieldGroup title="Density & finish">
        <ValueControl id="lines" label="Line count" min="1" max="200" step="1" value="40" />
        <ValueControl id="quality" label="Curve quality" min="1" max="10" step="1" value="7" />
      </FieldGroup>
      <FieldGroup title="Line spacing">
        <SelectControl
          id="gapEase"
          label="Gap easing"
          defaultValue="linear"
          randomizable
          rowClassName="select-row"
          controlId="gapEaseControl"
          optionDescriptions={{
            linear: 'Spaces contour levels evenly across the slice range.',
            'sine-in':
              'Uses a gentle sine-in curve to shift contour spacing toward the start of the range.',
            'sine-out':
              'Uses a gentle sine-out curve to shift contour spacing toward the end of the range.',
            'sine-in-out': 'Uses a smooth sine curve around an adjustable centre point.',
            'sine-out-in': 'Uses a reversed smooth sine curve around an adjustable centre point.',
            'ease-in':
              'Uses quadratic acceleration to shift contour spacing toward the start of the range.',
            'ease-out':
              'Uses quadratic deceleration to shift contour spacing toward the end of the range.',
            'ease-in-out': 'Uses a quadratic curve around an adjustable centre point.',
            'ease-out-in': 'Uses a reversed quadratic curve around an adjustable centre point.',
            'cubic-in':
              'Uses stronger cubic acceleration to shift contour spacing toward the start of the range.',
            'cubic-out':
              'Uses stronger cubic deceleration to shift contour spacing toward the end of the range.',
            'cubic-in-out': 'Uses a strong cubic curve around an adjustable centre point.',
            'cubic-out-in': 'Uses a reversed cubic curve around an adjustable centre point.',
          }}
        >
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
        </SelectControl>
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
          disabledReason="Choose an in & out or out & in gap easing mode to edit the easing centre."
        />
      </FieldGroup>
      <SliceFieldControls />
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
