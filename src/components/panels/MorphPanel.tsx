import { Section } from '../ui/section';
import { Checkbox, FieldGroup, ValueControl } from '../controls/FormControls';

export function MorphPanel() {
  return (
    <Section title="Morph" badge="multi instance">
      <FieldGroup title="Parameter interpolation">
        <Checkbox id="morphEnabled">Enable morph instances</Checkbox>
        <div className="morph-settings" id="morphSettings">
          <ValueControl
            id="morphSteps"
            label="X steps"
            min="2"
            max="24"
            step="1"
            value="4"
            morphable={false}
          />
          <Checkbox id="morphSecondEnabled">Add Y dimension</Checkbox>
          <div className="morph-second-settings" id="morphSecondSettings">
            <ValueControl
              id="morphStepsY"
              label="Y steps"
              min="2"
              max="24"
              step="1"
              value="4"
              morphable={false}
            />
          </div>
          <p className="gradient-note morph-note">
            Cycle each arrow through no morph, X only, and X + Y. X and Y targets combine into a
            matrix of variations.
          </p>
        </div>
      </FieldGroup>
    </Section>
  );
}
