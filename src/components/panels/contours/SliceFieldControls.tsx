import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../../controls/FormControls';
import { SliceLfoControls } from './SliceLfoControls';

export function SliceFieldControls() {
  return (
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
        <ValueControl id="cutAz" label="Azimuth" min="-180" max="180" step="1" value="0" unit="°" />
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
          Boundary, degenerate, and non-manifold samples are masked. The robust range clips outliers
          symmetrically before contrast is applied.
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
      <SliceLfoControls />
    </FieldGroup>
  );
}
