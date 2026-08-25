import { Section } from '../ui/section';
import { FieldGroup, ValueControl } from '../controls/FormControls';

export function ViewPanel() {
  return (
    <Section
      title="View"
      description="Frame the model and set its projection on the page."
      badge="02"
    >
      <FieldGroup title="Orientation">
        <ValueControl id="az" label="Azimuth" min="-180" max="180" step="1" value="35" unit="°" />
        <ValueControl id="el" label="Elevation" min="-180" max="180" step="1" value="24" unit="°" />
        <ValueControl id="rl" label="Roll" min="-180" max="180" step="1" value="0" unit="°" />
      </FieldGroup>
      <FieldGroup title="Framing & lens">
        <ValueControl id="zoom" label="Scale" min="0.2" max="3" step="0.01" value="1" unit="×" />
        <ValueControl
          id="panX"
          label="Offset X"
          min="-2000"
          max="2000"
          step="0.1"
          value="0"
          unit="mm"
        />
        <ValueControl
          id="panY"
          label="Offset Y"
          min="-2000"
          max="2000"
          step="0.1"
          value="0"
          unit="mm"
        />
        <ValueControl
          id="lensFocalLength"
          label="Focal length"
          min="8"
          max="300"
          step="1"
          value="50"
          unit="mm"
        />
        <ValueControl
          id="lensDistortion"
          label="Lens distortion"
          min="-100"
          max="100"
          step="1"
          value="0"
          unit="%"
        />
      </FieldGroup>
    </Section>
  );
}
