import { Box, FileUp } from 'lucide-react';
import { Section } from '../ui/section';
import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../controls/FormControls';
import { GEN_DEFAULTS } from '../../lib/generativeMesh';
import { HYPERBOLIC_TILING_DEFAULTS } from '../../lib/hyperbolic-tiling';

export function SourcePanel() {
  return (
    <Section
      title="Source"
      description="Choose, generate, or import the geometry to contour."
      badge="01"
      defaultOpen
    >
      <SelectControl
        id="demo"
        label="Source"
        defaultValue="knot"
        rowClassName="demo-row"
        optionDescriptions={{
          generative: 'Builds a configurable implicit-surface mesh locally in the browser.',
          'hyperbolic-tiling': 'Generates line art from a regular tiling of the Poincaré disk.',
          knot: 'Loads a looping torus knot with strong depth and silhouette variation.',
          ripple: 'Loads a sphere with rhythmic radial waves across its surface.',
          cube: 'Loads a softened cube with broad faces and rounded transitions.',
          diamond: 'Loads a smooth faceted form with pointed vertical poles.',
          torus: 'Loads a simple ring torus for clear circular contour studies.',
          twist: 'Loads a twisted, petal-like form with rotational symmetry.',
          hourglass: 'Loads a pinched rotational form with a narrow waist.',
          tetrapod: 'Loads a four-lobed branching form with complex overlaps.',
          radish: 'Loads a rounded radish-like form with a deep upper cleft and tapered root.',
          upload: 'Uses the model or SVG artwork loaded from this device.',
        }}
      >
        <optgroup label="Generate">
          <option value="generative">Generative mesh</option>
          <option value="hyperbolic-tiling">Hyperbolic tiling</option>
        </optgroup>
        <optgroup label="Demo meshes">
          <option value="knot">Torus knot</option>
          <option value="ripple">Ripple sphere</option>
          <option value="cube">Rounded cube</option>
          <option value="diamond">Soft diamond</option>
          <option value="torus">Ring torus</option>
          <option value="twist">Twisted bloom</option>
          <option value="hourglass">Hourglass</option>
          <option value="tetrapod">Tetrapod</option>
          <option value="radish">Radish</option>
        </optgroup>
        <option value="upload" hidden>
          Uploaded model
        </option>
      </SelectControl>
      <FieldGroup title="Generative field" className="generative-controls">
        <div id="generativeControls" hidden>
          <SelectControl
            id="genField"
            label="Field"
            defaultValue={GEN_DEFAULTS.genField}
            rowClassName="select-row"
            optionDescriptions={{
              gyroid: 'Creates a smooth triply periodic surface with winding passages.',
              schwarzP: 'Creates a cubic periodic surface with rounded chambers and necks.',
              diamond: 'Creates a highly connected diamond-family periodic surface.',
              neovius: 'Creates a dense periodic surface with strong spherical chambers.',
              metaballs: 'Blends seeded soft volumes into an organic connected solid.',
              supershape: 'Builds a sculptural radial form from superformula profiles.',
              relief: 'Creates a closed circular terrain medallion designed for height contours.',
            }}
          >
            <option value="gyroid">Gyroid</option>
            <option value="schwarzP">Schwarz P</option>
            <option value="diamond">Diamond</option>
            <option value="neovius">Neovius</option>
            <option value="metaballs">Metaballs</option>
            <option value="supershape">Supershape</option>
            <option value="relief">Relief · topographic</option>
          </SelectControl>
          <ValueControl
            id="genSeed"
            label="Seed"
            min="0"
            max="9999"
            step="1"
            value={GEN_DEFAULTS.genSeed}
            morphable={false}
          />
          <ValueControl
            id="genBlend"
            label="Carve"
            min="0"
            max="100"
            step="1"
            value={GEN_DEFAULTS.genBlend}
            unit="%"
            morphable={false}
          />
          <ValueControl
            id="genFreq"
            label="Frequency"
            min="0.5"
            max="8"
            step="0.1"
            value={GEN_DEFAULTS.genFreq}
            morphable={false}
          />
          <ValueControl
            id="genAniso"
            label="Z anisotropy"
            min="-100"
            max="100"
            step="1"
            value={GEN_DEFAULTS.genAniso}
            unit="%"
            morphable={false}
          />
          <ValueControl
            id="genIso"
            label="Level set"
            min="-1.4"
            max="1.4"
            step="0.01"
            value={GEN_DEFAULTS.genIso}
            morphable={false}
          />
          <ValueControl
            id="genTwist"
            label="Twist"
            min="-180"
            max="180"
            step="1"
            value={GEN_DEFAULTS.genTwist}
            unit="°"
            morphable={false}
          />
          <ValueControl
            id="genNoise"
            label="Noise"
            min="0"
            max="100"
            step="1"
            value={GEN_DEFAULTS.genNoise}
            unit="%"
            morphable={false}
          />
          <ValueControl
            id="genRes"
            label="Resolution"
            min="32"
            max="192"
            step="1"
            value={GEN_DEFAULTS.genRes}
            morphable={false}
          />
          <p className="gradient-note">
            The mesh rebuilds live. Higher resolutions are smoother but take longer to generate.
          </p>
        </div>
      </FieldGroup>
      <FieldGroup title="Hyperbolic tiling" className="tiling-controls">
        <div id="tilingControls" hidden>
          <ValueControl
            id="tilingP"
            label="Polygon sides"
            min="3"
            max="12"
            step="1"
            value={HYPERBOLIC_TILING_DEFAULTS.tilingP}
            morphable={false}
          />
          <ValueControl
            id="tilingQ"
            label="Polygons per vertex"
            min="3"
            max="12"
            step="1"
            value={HYPERBOLIC_TILING_DEFAULTS.tilingQ}
            morphable={false}
          />
          <ValueControl
            id="tilingDepth"
            label="Generation depth"
            min="0"
            max="6"
            step="1"
            value={HYPERBOLIC_TILING_DEFAULTS.tilingDepth}
            morphable={false}
          />
          <ValueControl
            id="tilingDiskScale"
            label="Disk scale"
            min="10"
            max="100"
            step="1"
            value={HYPERBOLIC_TILING_DEFAULTS.tilingDiskScale}
            unit="%"
          />
          <p className="gradient-note">
            Requires (p − 2)(q − 2) &gt; 4. Use Hyperbolic Möbius in View to rotate or navigate the
            disk.
          </p>
        </div>
      </FieldGroup>
      <label className="dropzone" id="drop">
        <input type="file" id="file" accept=".stl,.obj,.ply,.svg,image/svg+xml" />
        <span className="drop-icon">
          <FileUp size={18} />
        </span>
        <strong>Drop a model here</strong>
        <em>or click to browse · STL, OBJ, PLY, SVG</em>
      </label>
      <FieldGroup title="SVG artwork" className="svg-extrusion">
        <div id="svgExtrusion" hidden>
          <SelectControl
            id="svgMode"
            label="Interpretation"
            defaultValue="extrude"
            rowClassName="select-row"
            optionDescriptions={{
              extrude:
                'Turns filled SVG artwork into a shallow 3D mesh that can be sliced from any view.',
              centerline:
                'Extracts plotter-ready medial lines and bypasses mesh-only slicing fields.',
            }}
          >
            <option value="extrude">Extruded shape</option>
            <option value="centerline">Single-line centreline</option>
          </SelectControl>
          <div id="svgExtrusionControls">
            <ValueControl
              id="svgDepth"
              label="Extrusion"
              min="0.5"
              max="100"
              step="0.1"
              value="12"
              unit="%"
              morphable={false}
            />
            <Checkbox id="svgRounded">Round extruded edges</Checkbox>
            <ValueControl
              id="svgRoundness"
              label="Roundness"
              min="0"
              max="100"
              step="0.5"
              value="25"
              unit="%"
              disabled
              disabledReason="Turn on Round extruded edges to edit roundness."
              morphable={false}
            />
            <p className="gradient-note">
              Depth is proportional to the SVG span. Roundness is relative to the largest safe edge
              radius.
            </p>
          </div>
          <div id="svgCenterlineControls" hidden>
            <ValueControl
              id="svgCenterlinePruning"
              label="Branch pruning"
              min="1"
              max="4"
              step="0.1"
              value="2"
              morphable={false}
            />
            <p className="gradient-note">
              Higher values remove small medial-axis branches caused by fine edge details.
            </p>
          </div>
        </div>
      </FieldGroup>
      <div className="model-card">
        <div className="model-icon">
          <Box size={17} />
        </div>
        <div className="model-copy">
          <strong id="mName">demo · torus knot</strong>
          <span>
            <b id="mTris">—</b> <span id="mUnits">triangles</span>
          </span>
        </div>
        <span className="status-dot" title="Model loaded" />
      </div>
      <div className="axis-row">
        <span>Model up axis</span>
        <div className="segmented">
          <button type="button" id="upZ" aria-pressed="true">
            Z up
          </button>
          <button type="button" id="upY" aria-pressed="false">
            Y up
          </button>
        </div>
      </div>
      <p className="error" id="mErr" hidden />
    </Section>
  );
}
