import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../controls/FormControls';
import { Button } from '../ui/button';
import { Section } from '../ui/section';
import { OBJECT_CONTROLS, OBJECT_GROUPS } from '../../lib/object-settings';

export function ObjectPanel() {
  return (
    <Section badge="02" title="Object" description="Reshape the 3D model before slicing.">
      <Checkbox id="objectEnabled" randomizable>
        Enable object transformations
      </Checkbox>
      <p className="gradient-note blueprint-note" id="objectStatus">
        Stretch → taper → twist → bend → rotate. Axes follow the source model; rotation positions
        the reshaped object relative to the cutting field.
      </p>
      {OBJECT_GROUPS.map(({ id: group, label }) => (
        <FieldGroup key={group} title={label}>
          <Checkbox id={group} defaultChecked randomizable>
            Enable {label.toLowerCase()}
          </Checkbox>
          {['objectTaper', 'objectTwist', 'objectBend'].includes(group) && (
            <SelectControl
              id={`${group}Axis`}
              label={`${label} axis`}
              defaultValue="z"
              randomizable
            >
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </SelectControl>
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
                  step="0.1"
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
        Positive taper narrows the positive end of its axis. Bend direction 0° points toward +Y for
        axis X, +Z for axis Y, and +X for axis Z. Strong bends can fold the surface over itself.
        Terrain roads and rivers are unavailable while the object is reshaped.
      </p>
      <Button id="resetObject" variant="outline">
        Reset object
      </Button>
    </Section>
  );
}
