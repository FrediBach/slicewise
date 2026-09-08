import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../controls/FormControls';
import { Button } from '../ui/button';
import { Section } from '../ui/section';
import { OBJECT_CONTROLS, OBJECT_DESCRIPTION, OBJECT_GROUPS } from '../../lib/object-settings';

export function ObjectPanel() {
  return (
    <Section badge="02" title="Object" description="Reshape the 3D model before slicing.">
      <Checkbox id="objectEnabled" randomizable>
        Enable object transformations
      </Checkbox>
      <p className="gradient-note blueprint-note" id="objectStatus">
        {OBJECT_DESCRIPTION}
      </p>
      {OBJECT_GROUPS.map(({ id: group, label, axis }) => (
        <FieldGroup key={group} title={label}>
          <Checkbox id={group} defaultChecked randomizable>
            Enable {label.toLowerCase()}
          </Checkbox>
          {axis && (
            <SelectControl id={axis} label={`${label} axis`} defaultValue="z" randomizable>
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </SelectControl>
          )}
          {group === 'objectBulge' && (
            <p className="gradient-note blueprint-note">
              Positive amounts swell the surface; negative amounts pinch it. Centre places the peak
              along the axis. Width controls the affected band as a percentage of the object’s
              length.
            </p>
          )}
          {group === 'objectRipple' && (
            <p className="gradient-note blueprint-note">
              Waves cross-sections sideways along the selected axis. Amount is a percentage of the
              longest dimension; wavelength is a percentage of axis length. Phase shifts the wave.
            </p>
          )}
          {group === 'objectNoise' && (
            <p className="gradient-note blueprint-note">
              Smooth seeded displacement in X, Y, and Z. Amount and feature size are percentages of
              the longest dimension. Larger features make broader organic shapes; the same seed
              repeats the pattern.
            </p>
          )}
          {group === 'objectShear' && (
            <p className="gradient-note blueprint-note">
              Slides cross-sections sideways around the axis midpoint. At 100%, the offset between
              the two ends equals the object’s length along that axis.
            </p>
          )}
          {OBJECT_CONTROLS.map(
            ({ id, label: controlLabel, group: controlGroup, min, max, value, unit }) =>
              controlGroup === group ? (
                <ValueControl
                  key={id}
                  id={id}
                  label={controlLabel}
                  min={String(min)}
                  max={String(max)}
                  step={id === 'objectNoiseSeed' ? '1' : '0.1'}
                  value={String(value)}
                  unit={unit}
                  disabled
                  disabledReason="Enable object transformations and this transformation to edit it."
                />
              ) : null,
          )}
        </FieldGroup>
      ))}
      <p className="gradient-note blueprint-note">
        Positive taper narrows the positive end of its axis. Bend, shear, and ripple direction 0°
        point toward +Y for axis X, +Z for axis Y, and +X for axis Z. Strong bends can fold the
        surface over itself. Terrain roads and rivers are unavailable while the object is reshaped.
      </p>
      <Button id="resetObject" variant="outline" className="object-reset-button">
        Reset object
      </Button>
    </Section>
  );
}
