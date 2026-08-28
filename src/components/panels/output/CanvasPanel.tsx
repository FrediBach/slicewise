import {
  Checkbox,
  ControlLabel,
  FieldGroup,
  SelectControl,
  ValueControl,
} from '../../controls/FormControls';
import { Section } from '../../ui/section';
import { GenerativeMaskControls } from '../GenerativeMaskControls';

export function CanvasPanel() {
  return (
    <Section
      title="Canvas"
      description="Define the physical sheet, margins, and clipping boundary."
      badge="05"
    >
      <FieldGroup title="Artboard">
        <SelectControl
          id="paperPreset"
          label="Paper size"
          defaultValue="custom"
          rowClassName="select-row"
          optionDescriptions={{
            custom: 'Keeps the width and height fields independently editable.',
            '*': 'Sets the artboard dimensions to the selected standard paper size.',
          }}
        >
          <option value="custom">Custom</option>
          <optgroup label="ISO A series">
            <option value="a6">A6 · 105 × 148 mm</option>
            <option value="a5">A5 · 148 × 210 mm</option>
            <option value="a4">A4 · 210 × 297 mm</option>
            <option value="a3">A3 · 297 × 420 mm</option>
            <option value="a2">A2 · 420 × 594 mm</option>
            <option value="a1">A1 · 594 × 841 mm</option>
            <option value="a0">A0 · 841 × 1189 mm</option>
          </optgroup>
          <optgroup label="US sizes">
            <option value="letter">Letter · 216 × 279 mm</option>
            <option value="legal">Legal · 216 × 356 mm</option>
            <option value="tabloid">Tabloid · 279 × 432 mm</option>
          </optgroup>
        </SelectControl>
        <div className="control-row">
          <ControlLabel htmlFor="pw">Dimensions</ControlLabel>
          <div className="sheet-control">
            <input
              type="number"
              id="pw"
              min="10"
              max="2000"
              step="1"
              defaultValue="210"
              aria-label="Artboard width"
            />
            <span>×</span>
            <input
              type="number"
              id="ph"
              min="10"
              max="2000"
              step="1"
              defaultValue="210"
              aria-label="Artboard height"
            />
            <span className="unit">mm</span>
          </div>
        </div>
        <ValueControl id="margin" label="Margin" min="0" max="40" step="1" value="14" unit="mm" />
        <Checkbox id="clipToArtboard" defaultChecked>
          Clip paths to artboard
        </Checkbox>
        <Checkbox id="bg" defaultChecked>
          Include sheet background
        </Checkbox>
      </FieldGroup>
      <GenerativeMaskControls />
    </Section>
  );
}
