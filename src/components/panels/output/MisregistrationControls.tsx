import { Checkbox, ColorControl, SelectControl, ValueControl } from '../../controls/FormControls';

export function MisregistrationControls() {
  const reason = 'Turn on Misregistration to edit this parameter.';
  return (
    <>
      <Checkbox id="misregistration" randomizable>
        Misregistration
      </Checkbox>
      <div className="effect-controls">
        <ValueControl
          id="misregistrationCopies"
          label="Registration copies"
          min="1"
          max="3"
          step="1"
          value="2"
          disabled
          disabledReason={reason}
        />
        <ValueControl
          id="misregistrationOffset"
          label="Registration offset"
          min="0"
          max="20"
          step="0.1"
          value="2"
          unit="mm"
          disabled
          disabledReason={reason}
        />
        <ValueControl
          id="misregistrationRotation"
          label="Registration rotation"
          min="0"
          max="5"
          step="0.1"
          value="0.5"
          unit="°"
          disabled
          disabledReason={reason}
        />
        <SelectControl
          id="misregistrationScope"
          label="Copy scope"
          defaultValue="contours"
          randomizable
          disabled
          disabledReason="Turn on Misregistration to choose a scope."
          rowClassName="select-row"
          controlId="misregistrationScopeControl"
          optionDescriptions={{
            contours: 'Copies primary contours and silhouettes only.',
            all: 'Also copies plotter annotations, mask outlines, and vector-zoom guides.',
          }}
        >
          <option value="contours">Contours only</option>
          <option value="all">All plotter linework</option>
        </SelectControl>
        <ColorControl
          id="misregistrationColor1"
          label="Copy 1 colour"
          defaultValue="#00a7e1"
          swatchId="misregistrationColor1Swatch"
          morphable={false}
          disabled
          disabledReason={reason}
        />
        <ColorControl
          id="misregistrationColor2"
          label="Copy 2 colour"
          defaultValue="#ec008c"
          swatchId="misregistrationColor2Swatch"
          morphable={false}
          disabled
          disabledReason={reason}
        />
        <ColorControl
          id="misregistrationColor3"
          label="Copy 3 colour"
          defaultValue="#ffd400"
          swatchId="misregistrationColor3Swatch"
          morphable={false}
          disabled
          disabledReason={reason}
        />
        <p className="gradient-note blueprint-note">
          Adds offset physical pen groups; unlike Chromatic aberration, every copy is plotted.
        </p>
      </div>
    </>
  );
}
