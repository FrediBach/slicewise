import { Box, ChevronDown, FileUp } from 'lucide-react';
import { Section } from '../ui/section';
import { Checkbox, FieldGroup, ValueControl } from '../controls/FormControls';
import { GEN_DEFAULTS } from '../../lib/generativeMesh';

export function SourcePanel() {
  return (
    <Section title="Source model" badge="01">
      <div className="control-row demo-row">
        <label htmlFor="demo">Source</label>
        <div className="select-wrap">
          <select id="demo" defaultValue="knot">
            <optgroup label="Generate">
              <option value="generative">Generative mesh</option>
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
            </optgroup>
            <option value="upload" hidden>
              Uploaded model
            </option>
          </select>
          <ChevronDown size={14} />
        </div>
      </div>
      <FieldGroup title="Generative field" className="generative-controls">
        <div id="generativeControls" hidden>
          <div className="control-row select-row">
            <label htmlFor="genField">Field</label>
            <div className="select-wrap">
              <select id="genField" defaultValue={GEN_DEFAULTS.genField}>
                <option value="gyroid">Gyroid</option>
                <option value="schwarzP">Schwarz P</option>
                <option value="diamond">Diamond</option>
                <option value="neovius">Neovius</option>
                <option value="metaballs">Metaballs</option>
                <option value="supershape">Supershape</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
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
      <label className="dropzone" id="drop">
        <input type="file" id="file" accept=".stl,.obj,.ply,.svg,image/svg+xml" />
        <span className="drop-icon">
          <FileUp size={18} />
        </span>
        <strong>Drop a model here</strong>
        <em>or click to browse · STL, OBJ, PLY, SVG</em>
      </label>
      <FieldGroup title="SVG extrusion" className="svg-extrusion">
        <div id="svgExtrusion" hidden>
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
            morphable={false}
          />
          <p className="gradient-note">
            Depth is proportional to the SVG span. Roundness is relative to the largest safe edge
            radius.
          </p>
        </div>
      </FieldGroup>
      <div className="model-card">
        <div className="model-icon">
          <Box size={17} />
        </div>
        <div className="model-copy">
          <strong id="mName">demo · torus knot</strong>
          <span>
            <b id="mTris">—</b> triangles
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
