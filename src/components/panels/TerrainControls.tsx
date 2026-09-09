import { TERRAIN_CONTROLS, TERRAIN_DEFAULTS } from '../../lib/generative-terrain';
import { FieldGroup, ValueControl } from '../controls/FormControls';

export function TerrainControls() {
  return (
    <FieldGroup title="Generative terrain" className="terrain-controls">
      <div id="terrainControls" hidden>
        {TERRAIN_CONTROLS.map((control) => (
          <ValueControl
            key={control.id}
            {...control}
            min={String(control.min)}
            max={String(control.max)}
            step={String(control.step)}
            randomizable={false}
            value={TERRAIN_DEFAULTS[control.id]}
          />
        ))}
        <p className="gradient-note">
          A square cut from a continuous landscape. Ridges and drainage erosion shape the mountains
          and valleys; open edges keep base and wall slices out of your drawing. Use Height contours
          and a high view elevation for a topographic map.
        </p>
      </div>
    </FieldGroup>
  );
}
