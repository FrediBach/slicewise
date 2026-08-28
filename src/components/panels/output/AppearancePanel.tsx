import {
  BackgroundColorControl,
  FieldGroup,
  InkColorControl,
  SelectControl,
  ValueControl,
} from '../../controls/FormControls';
import { GradientChooser } from '../../controls/GradientChooser';
import { Section } from '../../ui/section';

export function AppearancePanel() {
  return (
    <Section
      title="Appearance"
      description="Set the contour weight, inks, and colour treatment."
      badge="04"
    >
      <FieldGroup title="Line style">
        <ValueControl
          id="sw"
          label="Stroke"
          min="0.05"
          max="2"
          step="0.05"
          value="0.35"
          unit="mm"
        />
        <SelectControl
          id="lineWeightMode"
          label="Line-weight variation"
          defaultValue="uniform"
          randomizable
          rowClassName="select-row"
          optionDescriptions={{
            uniform: 'Uses the same stroke width for every contour.',
            index: 'Emphasizes every nth contour according to the interval setting.',
            wave: 'Cycles stroke thickness periodically across contour indices.',
            center: 'Makes central contour levels heavier than levels near the range edges.',
          }}
        >
          <option value="uniform">Uniform · off</option>
          <option value="index">Index contours</option>
          <option value="wave">Thickness wave</option>
          <option value="center">Centre weighted</option>
        </SelectControl>
        <div className="effect-controls">
          <ValueControl
            id="lineWeightInterval"
            label="Interval"
            min="2"
            max="20"
            step="1"
            value="5"
            disabled
            disabledReason="Choose Index contours or Thickness wave to edit the interval."
          />
          <ValueControl
            id="lineWeightAmount"
            label="Variation"
            min="0"
            max="300"
            step="5"
            value="100"
            unit="%"
            disabled
            disabledReason="Choose a line-weight variation mode to edit the variation amount."
          />
        </div>
        <InkColorControl />
        <BackgroundColorControl />
        <GradientChooser />
      </FieldGroup>
    </Section>
  );
}
