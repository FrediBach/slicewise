import { Section } from '../ui/section';
import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../controls/FormControls';

export function ContoursPanel() {
  return (
    <Section
      title="Contours"
      description="Shape the slice density, spacing, and path construction."
      badge="03"
      defaultOpen
    >
      <FieldGroup title="Density & finish">
        <ValueControl id="lines" label="Line count" min="1" max="200" step="1" value="40" />
        <ValueControl id="quality" label="Curve quality" min="1" max="10" step="1" value="7" />
      </FieldGroup>
      <FieldGroup title="Line spacing">
        <SelectControl
          id="gapEase"
          label="Gap easing"
          defaultValue="linear"
          randomizable
          rowClassName="select-row"
          controlId="gapEaseControl"
          optionDescriptions={{
            linear: 'Spaces contour levels evenly across the slice range.',
            'sine-in':
              'Uses a gentle sine-in curve to shift contour spacing toward the start of the range.',
            'sine-out':
              'Uses a gentle sine-out curve to shift contour spacing toward the end of the range.',
            'sine-in-out': 'Uses a smooth sine curve around an adjustable centre point.',
            'sine-out-in': 'Uses a reversed smooth sine curve around an adjustable centre point.',
            'ease-in':
              'Uses quadratic acceleration to shift contour spacing toward the start of the range.',
            'ease-out':
              'Uses quadratic deceleration to shift contour spacing toward the end of the range.',
            'ease-in-out': 'Uses a quadratic curve around an adjustable centre point.',
            'ease-out-in': 'Uses a reversed quadratic curve around an adjustable centre point.',
            'cubic-in':
              'Uses stronger cubic acceleration to shift contour spacing toward the start of the range.',
            'cubic-out':
              'Uses stronger cubic deceleration to shift contour spacing toward the end of the range.',
            'cubic-in-out': 'Uses a strong cubic curve around an adjustable centre point.',
            'cubic-out-in': 'Uses a reversed cubic curve around an adjustable centre point.',
          }}
        >
          <option value="linear">Linear</option>
          <optgroup label="Sine">
            <option value="sine-in">Sine · in</option>
            <option value="sine-out">Sine · out</option>
            <option value="sine-in-out">Sine · in &amp; out</option>
            <option value="sine-out-in">Sine · out &amp; in</option>
          </optgroup>
          <optgroup label="Quadratic">
            <option value="ease-in">Quadratic · in</option>
            <option value="ease-out">Quadratic · out</option>
            <option value="ease-in-out">Quadratic · in &amp; out</option>
            <option value="ease-out-in">Quadratic · out &amp; in</option>
          </optgroup>
          <optgroup label="Cubic">
            <option value="cubic-in">Cubic · in</option>
            <option value="cubic-out">Cubic · out</option>
            <option value="cubic-in-out">Cubic · in &amp; out</option>
            <option value="cubic-out-in">Cubic · out &amp; in</option>
          </optgroup>
        </SelectControl>
        <ValueControl
          id="easeStrength"
          label="Ease strength"
          min="0"
          max="300"
          step="1"
          value="100"
          unit="%"
        />
        <ValueControl id="easeCycles" label="Ease cycles" min="1" max="12" step="1" value="1" />
        <ValueControl
          id="easeCenter"
          label="Ease centre"
          min="5"
          max="95"
          step="1"
          value="50"
          unit="%"
          disabled
          disabledReason="Choose an in & out or out & in gap easing mode to edit the easing centre."
        />
      </FieldGroup>
      <FieldGroup title="Slice field">
        <SelectControl
          id="axis"
          label="Slice field"
          defaultValue="up"
          randomizable
          rowClassName="select-row"
          optionDescriptions={{
            up: 'Slices by model-space height to create familiar topographic contours.',
            cam: 'Slices along the current viewing direction, so orbiting the camera changes the contour field.',
            x: 'Slices across the model width using parallel model-space planes.',
            y: 'Slices across the model depth using parallel model-space planes.',
            custom: 'Uses parallel planes oriented by the custom azimuth and elevation controls.',
            spherical:
              'Slices with expanding spherical shells around a configurable model-space centre.',
            cylindrical: 'Slices with concentric cylinders around a configurable centre and axis.',
            geodesic: 'Measures distance along mesh edges from one or two surface seeds.',
            curvature: 'Contours a normalized estimate of the mesh surface curvature.',
          }}
        >
          <option value="up">Height · topographic</option>
          <option value="cam">View depth · camera</option>
          <option value="x">Model width</option>
          <option value="y">Model depth</option>
          <option value="custom">Custom plane angle</option>
          <option value="spherical">Spherical wavefront</option>
          <option value="cylindrical">Cylindrical wavefront</option>
          <option value="geodesic">Geodesic distance · mesh</option>
          <option value="curvature">Mesh curvature</option>
        </SelectControl>
        <div className="custom-axis" id="customAxis" hidden>
          <ValueControl
            id="cutAz"
            label="Azimuth"
            min="-180"
            max="180"
            step="1"
            value="0"
            unit="°"
          />
          <ValueControl
            id="cutEl"
            label="Elevation"
            min="-90"
            max="90"
            step="1"
            value="90"
            unit="°"
          />
        </div>
        <div id="wavefrontControls" hidden>
          <ValueControl
            id="waveCenterX"
            label="Centre X"
            min="-100"
            max="100"
            step="1"
            value="0"
            unit="% radius"
          />
          <ValueControl
            id="waveCenterY"
            label="Centre Y"
            min="-100"
            max="100"
            step="1"
            value="0"
            unit="% radius"
          />
          <ValueControl
            id="waveCenterZ"
            label="Centre Z"
            min="-100"
            max="100"
            step="1"
            value="0"
            unit="% radius"
          />
          <div id="cylinderAxisControls" hidden>
            <ValueControl
              id="cylinderAzimuth"
              label="Cylinder azimuth"
              min="-180"
              max="180"
              step="1"
              value="0"
              unit="°"
            />
            <ValueControl
              id="cylinderElevation"
              label="Cylinder elevation"
              min="-90"
              max="90"
              step="1"
              value="90"
              unit="°"
            />
          </div>
          <p className="gradient-note blueprint-note">
            Curved fields use model-space distance. Centre values are percentages of the normalized
            model radius.
          </p>
        </div>
        <div id="geodesicControls" hidden>
          <SelectControl
            id="geodesicMode"
            label="Geodesic mode"
            defaultValue="single"
            randomizable
            rowClassName="select-row"
            controlId="geodesicModeControl"
            optionDescriptions={{
              single: 'Contours surface distance outward from seed A.',
              nearest: 'Contours the shorter surface distance to either seed A or seed B.',
              difference:
                'Contours the signed difference between distances to the two seeds, including the zero level.',
              voronoi: 'Draws the single surface boundary where the nearest seed changes.',
            }}
          >
            <option value="single">Single source</option>
            <option value="nearest">Nearest of two sources</option>
            <option value="difference">Distance difference</option>
            <option value="voronoi">Voronoi boundary</option>
          </SelectControl>
          <ValueControl
            id="geodesicSeedAzimuth"
            label="Seed A azimuth"
            min="-180"
            max="180"
            step="1"
            value="0"
            unit="°"
          />
          <ValueControl
            id="geodesicSeedElevation"
            label="Seed A elevation"
            min="-90"
            max="90"
            step="1"
            value="90"
            unit="°"
          />
          <div id="geodesicSecondSeedControls" hidden>
            <ValueControl
              id="geodesicSeedBAzimuth"
              label="Seed B azimuth"
              min="-180"
              max="180"
              step="1"
              value="0"
              unit="°"
            />
            <ValueControl
              id="geodesicSeedBElevation"
              label="Seed B elevation"
              min="-90"
              max="90"
              step="1"
              value="-90"
              unit="°"
            />
          </div>
          <p className="gradient-note blueprint-note">
            Directional extremes select mesh vertices. Distances follow mesh edges; difference mode
            uses symmetric levels and always includes zero.
          </p>
        </div>
        <div id="curvatureControls" hidden>
          <SelectControl
            id="curvatureMethod"
            label="Curvature field"
            defaultValue="gaussian"
            randomizable
            rowClassName="select-row"
            controlId="curvatureMethodControl"
            optionDescriptions={{
              gaussian:
                'Measures intrinsic angle defect, highlighting locally dome-like and saddle-like regions.',
              mean: 'Measures signed bending relative to the oriented vertex normals.',
            }}
          >
            <option value="gaussian">Gaussian curvature</option>
            <option value="mean">Signed mean curvature</option>
          </SelectControl>
          <ValueControl
            id="curvatureSmoothing"
            label="Field smoothing"
            min="0"
            max="20"
            step="1"
            value="2"
            unit="iterations"
          />
          <ValueControl
            id="curvatureRange"
            label="Robust range"
            min="80"
            max="100"
            step="1"
            value="98"
            unit="percentile"
          />
          <ValueControl
            id="curvatureContrast"
            label="Curvature contrast"
            min="25"
            max="200"
            step="1"
            value="100"
            unit="%"
          />
          <Checkbox id="curvatureIncludeZero" defaultChecked randomizable>
            Include zero curvature
          </Checkbox>
          <p className="gradient-note blueprint-note">
            Boundary, degenerate, and non-manifold samples are masked. The robust range clips
            outliers symmetrically before contrast is applied.
          </p>
        </div>
        <ValueControl
          id="divergence"
          label="Divergence"
          min="0"
          max="160"
          step="1"
          value="0"
          unit="°"
          morphable={false}
          randomizable
        />
        <Checkbox id="sliceLfo" randomizable>
          Modulate slice planes
        </Checkbox>
        <div className="effect-controls">
          <ValueControl
            id="sliceLfoAmplitude"
            label="LFO amplitude"
            min="0"
            max="400"
            step="1"
            value="75"
            unit="% gap"
            disabled
            disabledReason="Turn on Modulate slice planes to edit this parameter."
          />
          <ValueControl
            id="sliceLfoCycles"
            label="LFO cycles"
            min="0.25"
            max="12"
            step="0.25"
            value="2"
            disabled
            disabledReason="Turn on Modulate slice planes to edit this parameter."
          />
          <ValueControl
            id="sliceLfoAngle"
            label="LFO direction"
            min="0"
            max="180"
            step="1"
            value="0"
            unit="°"
            disabled
            disabledReason="Turn on Modulate slice planes to edit this parameter."
          />
          <ValueControl
            id="sliceLfoPhase"
            label="LFO phase"
            min="0"
            max="360"
            step="1"
            value="0"
            unit="°"
            disabled
            disabledReason="Turn on Modulate slice planes to edit this parameter."
          />
          <SelectControl
            id="sliceLfoWaveform"
            label="Waveform"
            defaultValue="sine"
            disabled
            disabledReason="Turn on Modulate slice planes to edit this parameter."
            rowClassName="select-row"
            controlId="sliceLfoWaveformControl"
            optionDescriptions={{
              sine: 'Applies a smooth periodic displacement to the cutting surface.',
              triangle: 'Applies a linear back-and-forth displacement with sharper turning points.',
            }}
          >
            <option value="sine">Sine</option>
            <option value="triangle">Triangle</option>
          </SelectControl>
          <Checkbox id="sliceLfoModulation" randomizable>
            Modulate LFO
          </Checkbox>
          <div className="effect-controls">
            <SelectControl
              id="sliceLfoModulationMode"
              label="Mode"
              defaultValue="amplitude"
              disabled
              disabledReason="Turn on Modulate slice planes and Modulate LFO to edit this parameter."
              rowClassName="select-row"
              controlId="sliceLfoModulationModeControl"
              optionDescriptions={{
                amplitude: 'Varies the LFO displacement strength over the modulation cycle.',
                frequency:
                  'Varies how tightly the LFO oscillations are packed over the modulation cycle.',
              }}
            >
              <option value="amplitude">Amplitude</option>
              <option value="frequency">Frequency</option>
            </SelectControl>
            <ValueControl
              id="sliceLfoModulationDepth"
              label="Mod depth"
              min="0"
              max="100"
              step="1"
              value="50"
              unit="%"
              disabled
              disabledReason="Turn on Modulate slice planes and Modulate LFO to edit this parameter."
            />
            <ValueControl
              id="sliceLfoModulationCycles"
              label="Mod cycles"
              min="0.25"
              max="8"
              step="0.25"
              value="1"
              disabled
              disabledReason="Turn on Modulate slice planes and Modulate LFO to edit this parameter."
            />
            <ValueControl
              id="sliceLfoModulationPhase"
              label="Mod phase"
              min="0"
              max="360"
              step="1"
              value="0"
              unit="°"
              disabled
              disabledReason="Turn on Modulate slice planes and Modulate LFO to edit this parameter."
            />
          </div>
          <p className="gradient-note blueprint-note">
            Warps the cutting surface itself. Curve quality controls intersection precision and
            smoothness.
          </p>
        </div>
      </FieldGroup>
      <FieldGroup title="Path construction" className="field-group--checks">
        <div className="check-grid">
          <Checkbox id="spiral" randomizable>
            Continuous spiral
          </Checkbox>
          <Checkbox id="hide" defaultChecked randomizable>
            Remove hidden lines
          </Checkbox>
          <Checkbox id="sil" defaultChecked randomizable>
            Add outer silhouette
          </Checkbox>
        </div>
      </FieldGroup>
    </Section>
  );
}
