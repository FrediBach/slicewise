import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../../controls/FormControls';
import { Section } from '../../ui/section';
import { GlitchControls } from './GlitchControls';
import { StaggeredSliceControls } from './StaggeredSliceControls';
import { VectorZoomControls } from './VectorZoomControls';
import { WraparoundTearControls } from './WraparoundTearControls';

function TopographicMapControl() {
  return (
    <>
      <Checkbox id="topographicMap" randomizable>
        Topographic map
      </Checkbox>
      <div className="effect-controls">
        <p className="gradient-note blueprint-note">
          Adds masked elevation labels, generated place names and location markers. Placements
          remain stable for the same contour geometry.
        </p>
      </div>
    </>
  );
}

export function EffectsPanel() {
  return (
    <Section
      title="Effects"
      description="Layer plotter-safe texture, colour, and annotations."
      badge="06"
    >
      <FieldGroup title="Post-processing">
        <ValueControl
          id="explodeAmount"
          label="Slice explode"
          min="0"
          max="300"
          step="1"
          value="0"
          unit="%"
        />
        <p className="gradient-note blueprint-note">
          Separates contour layers along their slice-plane normals. At 100%, the original spacing is
          doubled.
        </p>
        <GlitchControls />
        <StaggeredSliceControls />
        <WraparoundTearControls />
        <Checkbox id="kaleidoscope" randomizable>
          Kaleidoscope
        </Checkbox>
        <div className="effect-controls">
          <ValueControl
            id="kaleidoscopeSegments"
            label="Segments"
            min="3"
            max="24"
            step="1"
            value="6"
            disabled
            disabledReason="Turn on Kaleidoscope to edit this parameter."
          />
          <ValueControl
            id="kaleidoscopeRotation"
            label="Rotation"
            min="-180"
            max="180"
            step="1"
            value="0"
            unit="°"
            disabled
            disabledReason="Turn on Kaleidoscope to edit this parameter."
          />
          <p className="gradient-note blueprint-note">
            Mirrors one radial slice around the centre of the artboard for SVG and plotter output.
          </p>
        </div>
        <VectorZoomControls />
        <Checkbox id="halftone" randomizable>
          Halftone stroke
        </Checkbox>
        <div className="effect-controls">
          <ValueControl
            id="halftoneSize"
            label="Dot spacing"
            min="0.5"
            max="8"
            step="0.1"
            value="2.4"
            unit="mm"
            disabled
            disabledReason="Turn on Halftone stroke to edit this parameter."
          />
          <ValueControl
            id="halftoneContrast"
            label="Contrast"
            min="0"
            max="100"
            step="1"
            value="75"
            unit="%"
            disabled
            disabledReason="Turn on Halftone stroke to edit this parameter."
          />
          <ValueControl
            id="halftoneCycles"
            label="Depth cycles"
            min="1"
            max="8"
            step="1"
            value="2"
            disabled
            disabledReason="Turn on Halftone stroke to edit this parameter."
          />
        </div>
        <Checkbox id="chroma" randomizable>
          Chromatic aberration
        </Checkbox>
        <div className="effect-controls">
          <ValueControl
            id="chromaAmount"
            label="RGB split"
            min="0.1"
            max="6"
            step="0.1"
            value="1.5"
            unit="mm"
            disabled
            disabledReason="Turn on Chromatic aberration to edit the RGB split."
          />
        </div>
        <Checkbox id="humanizer" randomizable>
          Humanizer
        </Checkbox>
        <div className="effect-controls">
          <ValueControl
            id="humanizerAmount"
            label="Human touch"
            min="0"
            max="100"
            step="1"
            value="30"
            unit="%"
            disabled
            disabledReason="Turn on Humanizer to edit the human touch amount."
          />
          <p className="gradient-note blueprint-note">
            Adds stable, small hand-drawn variations to contour lines and plotter paths.
          </p>
        </div>
        <Checkbox id="yarnCurl" randomizable>
          Yarn cut &amp; curl
        </Checkbox>
        <div className="effect-controls">
          <ValueControl
            id="yarnCutPercent"
            label="Lines to cut"
            min="1"
            max="500"
            step="1"
            value="15"
            unit="%"
            disabled
            disabledReason="Turn on Yarn cut & curl to edit this parameter."
          />
          <ValueControl
            id="yarnCurlSize"
            label="Curl size"
            min="25"
            max="250"
            step="5"
            value="100"
            unit="%"
            disabled
            disabledReason="Turn on Yarn cut & curl to edit this parameter."
          />
          <p className="gradient-note blueprint-note">
            Opens random contour lines and curls their new ends in stable, organic directions.
          </p>
        </div>
        <Checkbox id="blueprint" randomizable>
          Technical blueprint
        </Checkbox>
        <div className="effect-controls">
          <SelectControl
            id="blueprintStyle"
            label="Document stock"
            defaultValue="blue"
            disabled
            disabledReason="Turn on Technical blueprint to choose the document stock."
            rowClassName="select-row"
            controlId="blueprintStyleControl"
            optionDescriptions={{
              blue: 'Uses traditional blueprint blue stock with white technical linework.',
              black: 'Uses black technical stock with white drafting linework.',
            }}
          >
            <option value="blue">Blueprint blue · white ink</option>
            <option value="black">Technical black · white ink</option>
          </SelectControl>
          <p className="gradient-note blueprint-note">
            Adds a drafting grid, measured border, callouts, formula notes and a technical title
            block to the SVG.
          </p>
        </div>
        <TopographicMapControl />
      </FieldGroup>
    </Section>
  );
}
