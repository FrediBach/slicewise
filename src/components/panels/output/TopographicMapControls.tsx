import { Checkbox, ValueControl } from '../../controls/FormControls';
import { MAP_CONTROLS } from '../../../lib/map-settings';

export function TopographicMapControls() {
  return (
    <>
      <Checkbox id="topographicMap" randomizable>
        Topographic map
      </Checkbox>
      <div className="effect-controls">
        <p className="gradient-note">
          Set a count to 0 to omit that layer. Counts are placement targets; crowded maps may fit
          fewer features.
        </p>
        {(['Features', 'Water & routes', 'Lettering', 'Layout'] as const).map((group) => (
          <details key={group} className="map-control-group" open={group === 'Features'}>
            <summary>{group}</summary>
            {MAP_CONTROLS.map(({ id, label, min, max, value, group: controlGroup }) =>
              controlGroup === group ? (
                <ValueControl
                  key={id}
                  id={id}
                  label={label}
                  min={String(min)}
                  max={String(max)}
                  step="1"
                  value={value}
                  unit={id.endsWith('Scale') ? '%' : ''}
                  morphable={false}
                  randomizable
                  disabled
                  disabledReason="Turn on Topographic map to edit this parameter."
                />
              ) : null,
            )}
          </details>
        ))}
        <p className="gradient-note">
          Houses, churches, towers, ruins, campsites, summits, woodland, double-line roads and water
          features are illustrative. Elevations use contour levels, not surveyed heights. All marks
          and clearances are included in plotter output.
        </p>
      </div>
    </>
  );
}
