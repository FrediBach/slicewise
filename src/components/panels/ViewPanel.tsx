import { Rotate3d } from 'lucide-react';
import { Section } from '../ui/section';
import { FieldGroup, SelectControl, ValueControl } from '../controls/FormControls';

export function ViewPanel() {
  return (
    <Section
      title="View"
      badge={
        <>
          <Rotate3d size={12} /> drag canvas
        </>
      }
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
        <SelectControl
          id="lens"
          label="Camera lens"
          defaultValue="clean"
          randomizable
          rowClassName="select-row"
        >
          <option value="clean">50 mm · clean</option>
          <option value="wide">24 mm · wide barrel</option>
          <option value="fisheye">12 mm · fisheye</option>
          <option value="tele">85 mm · pincushion</option>
        </SelectControl>
        <ValueControl
          id="lensAmount"
          label="Distortion"
          min="0"
          max="200"
          step="1"
          value="100"
          unit="%"
          disabled
        />
      </FieldGroup>
    </Section>
  );
}
