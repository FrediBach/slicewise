import { Checkbox, FieldGroup, ValueControl } from '../../controls/FormControls';
import { SLICE_RAY_CONTROLS } from '../../../lib/slice-rays-settings';

export function SliceRayControls() {
  return (
    <FieldGroup title="Slice rays">
      <Checkbox id="sliceRays" randomizable>
        Enable slice rays
      </Checkbox>
      <p className="gradient-note blueprint-note">
        Spherical rays travel away from the origin; cylindrical rays travel away from the axis. Only
        exit crossings emit rays. Fade adds pen-plottable gaps.
      </p>
      <div className="effect-controls">
        {SLICE_RAY_CONTROLS.map(({ id, label, min, max, value, unit }) => (
          <ValueControl
            key={id}
            id={id}
            label={label}
            min={String(min)}
            max={String(max)}
            step="1"
            value={String(value)}
            unit={unit}
            disabled
            disabledReason="Enable slice rays to edit this parameter."
          />
        ))}
      </div>
    </FieldGroup>
  );
}
