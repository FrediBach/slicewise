import { Checkbox, ColorControl, SelectControl, ValueControl } from '../../controls/FormControls';

const zoomCorners = (
  <>
    <option value="top-left">Top left</option>
    <option value="top-right">Top right</option>
    <option value="bottom-left">Bottom left</option>
    <option value="bottom-right">Bottom right</option>
  </>
);
export function VectorZoomControls() {
  return (
    <div className="vector-zoom-controls">
      <p className="gradient-note blueprint-note">
        Crop vector detail into a corner inset. Source borders and leaders are real dashed plotter
        paths; inset size sets its longest edge.
      </p>
      {Array.from({ length: 4 }, (_, offset) => {
        const index = offset + 1;
        const prefix = `vectorZoom${index}`;
        const reason = `Turn on Vector zoom ${index} to edit this parameter.`;
        return (
          <details className="vector-zoom-slot" key={prefix} open={index === 1}>
            <summary>Vector zoom {index}</summary>
            <Checkbox id={`${prefix}Enabled`} randomizable>
              Enable zoom {index}
            </Checkbox>
            <div className="effect-controls" id={`${prefix}Controls`}>
              <SelectControl
                id={`${prefix}Shape`}
                label="Area shape"
                defaultValue="rectangle"
                disabled
                disabledReason={reason}
                rowClassName="select-row"
                controlId={`${prefix}ShapeControl`}
                randomizable
              >
                <option value="rectangle">Rectangle</option>
                <option value="circle">Circle</option>
              </SelectControl>
              <ValueControl
                id={`${prefix}CenterX`}
                label="Area centre X"
                min="0"
                max="100"
                step="1"
                value={index % 2 ? 45 : 55}
                unit="%"
                disabled
                disabledReason={reason}
              />
              <ValueControl
                id={`${prefix}CenterY`}
                label="Area centre Y"
                min="0"
                max="100"
                step="1"
                value={index <= 2 ? 45 : 55}
                unit="%"
                disabled
                disabledReason={reason}
              />
              <ValueControl
                id={`${prefix}Width`}
                label="Area width"
                min="2"
                max="80"
                step="1"
                value="20"
                unit="%"
                disabled
                disabledReason={reason}
              />
              <ValueControl
                id={`${prefix}Height`}
                label="Area height"
                min="2"
                max="80"
                step="1"
                value="20"
                unit="%"
                disabled
                disabledReason={reason}
              />
              <SelectControl
                id={`${prefix}Corner`}
                label="Inset corner"
                defaultValue={['top-right', 'top-left', 'bottom-right', 'bottom-left'][offset]}
                disabled
                disabledReason={reason}
                rowClassName="select-row"
                controlId={`${prefix}CornerControl`}
                randomizable
              >
                {zoomCorners}
              </SelectControl>
              <ValueControl
                id={`${prefix}Size`}
                label="Inset size"
                min="10"
                max="60"
                step="1"
                value="30"
                unit="%"
                disabled
                disabledReason={reason}
              />
              <ValueControl
                id={`${prefix}Margin`}
                label="Edge margin"
                min="0"
                max="40"
                step="1"
                value="14"
                unit="mm"
                disabled
                disabledReason={reason}
              />
              <ColorControl
                id={`${prefix}Color`}
                label="Guide colour"
                defaultValue="#15181a"
                swatchId={`${prefix}ColorSwatch`}
                morphable={false}
                disabled
                disabledReason={reason}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}
