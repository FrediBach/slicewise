import { Checkbox, ColorControl, SelectControl, ValueControl } from '../../controls/FormControls';
import { WEAVE_CONTROLS, WEAVE_PATTERNS, WEAVE_OUTPUTS } from '../../../lib/contour-weave-settings';

export function ContourWeaveControls() {
  const reason = 'Turn on Contour Weave to edit this parameter.';
  return (
    <>
      <Checkbox id="contourWeave" randomizable>
        Contour Weave
      </Checkbox>
      <div className="effect-controls">
        <p className="gradient-note blueprint-note">
          Weave two thread families on the same 3D mesh. Line count sets warp density; fabric
          orientation replaces the slice field while weaving. Both families follow the surface and
          share hidden-line removal. Zero ribbon width draws single threads.
        </p>
        {WEAVE_CONTROLS.map((control) => (
          <ValueControl
            key={control.id}
            {...control}
            min={String(control.min)}
            max={String(control.max)}
            step={String(control.step)}
            value={String(control.value)}
            disabled
            disabledReason={reason}
          />
        ))}
        <SelectControl
          id="weavePattern"
          label="Weave pattern"
          defaultValue="plain"
          randomizable
          disabled
          disabledReason={reason}
          rowClassName="select-row"
          controlId="weavePatternControl"
        >
          {Object.entries(WEAVE_PATTERNS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectControl>
        <SelectControl
          id="weaveOutput"
          label="Weave output"
          defaultValue="both"
          randomizable
          disabled
          disabledReason={reason}
          rowClassName="select-row"
          controlId="weaveOutputControl"
        >
          {Object.entries(WEAVE_OUTPUTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectControl>
        <ColorControl
          id="weaveColor"
          label="Weft ink"
          defaultValue="#b87333"
          swatchId="weaveColorSwatch"
          disabled
          disabledReason={reason}
        />
        <p className="gradient-note blueprint-note">
          Twist and slide the fabric across the surface, or isolate a family for stitches and lace.
          Gap protection limits cuts to their fabric cells. Match the inks for a single-pen weave.
        </p>
      </div>
    </>
  );
}
