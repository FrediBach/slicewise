import { Section } from '../ui/section';
import {
  BackgroundColorControl,
  Checkbox,
  ControlLabel,
  FieldGroup,
  InkColorControl,
  SelectControl,
  ValueControl,
} from '../controls/FormControls';
import { GradientChooser } from '../controls/GradientChooser';
import { GenerativeMaskControls } from './GenerativeMaskControls';

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

const zoomCorners = (
  <>
    <option value="top-left">Top left</option>
    <option value="top-right">Top right</option>
    <option value="bottom-left">Bottom left</option>
    <option value="bottom-right">Bottom right</option>
  </>
);

function VectorZoomControls() {
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
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function AppearancePanel() {
  return (
    <Section
      title="Appearance"
      description="Set the contour weight, inks, and colour treatment."
      badge="04"
    >
      <FieldGroup title="Line style">
        <ValueControl
          id="sw"
          label="Stroke"
          min="0.05"
          max="2"
          step="0.05"
          value="0.35"
          unit="mm"
        />
        <SelectControl
          id="lineWeightMode"
          label="Line-weight variation"
          defaultValue="uniform"
          randomizable
          rowClassName="select-row"
          optionDescriptions={{
            uniform: 'Uses the same stroke width for every contour.',
            index: 'Emphasizes every nth contour according to the interval setting.',
            wave: 'Cycles stroke thickness periodically across contour indices.',
            center: 'Makes central contour levels heavier than levels near the range edges.',
          }}
        >
          <option value="uniform">Uniform · off</option>
          <option value="index">Index contours</option>
          <option value="wave">Thickness wave</option>
          <option value="center">Centre weighted</option>
        </SelectControl>
        <div className="effect-controls">
          <ValueControl
            id="lineWeightInterval"
            label="Interval"
            min="2"
            max="20"
            step="1"
            value="5"
            disabled
            disabledReason="Choose Index contours or Thickness wave to edit the interval."
          />
          <ValueControl
            id="lineWeightAmount"
            label="Variation"
            min="0"
            max="300"
            step="5"
            value="100"
            unit="%"
            disabled
            disabledReason="Choose a line-weight variation mode to edit the variation amount."
          />
        </div>
        <InkColorControl />
        <BackgroundColorControl />
        <GradientChooser />
      </FieldGroup>
    </Section>
  );
}

export function CanvasPanel() {
  return (
    <Section
      title="Canvas"
      description="Define the physical sheet, margins, and clipping boundary."
      badge="05"
    >
      <FieldGroup title="Artboard">
        <SelectControl
          id="paperPreset"
          label="Paper size"
          defaultValue="custom"
          rowClassName="select-row"
          optionDescriptions={{
            custom: 'Keeps the width and height fields independently editable.',
            '*': 'Sets the artboard dimensions to the selected standard paper size.',
          }}
        >
          <option value="custom">Custom</option>
          <optgroup label="ISO A series">
            <option value="a6">A6 · 105 × 148 mm</option>
            <option value="a5">A5 · 148 × 210 mm</option>
            <option value="a4">A4 · 210 × 297 mm</option>
            <option value="a3">A3 · 297 × 420 mm</option>
            <option value="a2">A2 · 420 × 594 mm</option>
            <option value="a1">A1 · 594 × 841 mm</option>
            <option value="a0">A0 · 841 × 1189 mm</option>
          </optgroup>
          <optgroup label="US sizes">
            <option value="letter">Letter · 216 × 279 mm</option>
            <option value="legal">Legal · 216 × 356 mm</option>
            <option value="tabloid">Tabloid · 279 × 432 mm</option>
          </optgroup>
        </SelectControl>
        <div className="control-row">
          <ControlLabel htmlFor="pw">Dimensions</ControlLabel>
          <div className="sheet-control">
            <input
              type="number"
              id="pw"
              min="10"
              max="2000"
              step="1"
              defaultValue="210"
              aria-label="Artboard width"
            />
            <span>×</span>
            <input
              type="number"
              id="ph"
              min="10"
              max="2000"
              step="1"
              defaultValue="210"
              aria-label="Artboard height"
            />
            <span className="unit">mm</span>
          </div>
        </div>
        <ValueControl id="margin" label="Margin" min="0" max="40" step="1" value="14" unit="mm" />
        <Checkbox id="clipToArtboard" defaultChecked>
          Clip paths to artboard
        </Checkbox>
        <Checkbox id="bg" defaultChecked>
          Include sheet background
        </Checkbox>
      </FieldGroup>
      <GenerativeMaskControls />
    </Section>
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

export function ExportPanel() {
  return (
    <Section
      title="Export"
      description="Choose the final format and configure plotter motion."
      badge="08"
    >
      <FieldGroup title="Export format">
        <SelectControl
          id="exportFormat"
          label="File type"
          defaultValue="svg"
          rowClassName="select-row"
          optionDescriptions={{
            svg: 'Exports scalable vector artwork for editing, printing, or plotter software.',
            gcode: 'Exports machine motion commands using the selected plotter profile and speeds.',
          }}
        >
          <option value="svg">SVG · vector</option>
          <option value="gcode">G-code · plotter</option>
        </SelectControl>
        <div className="gcode-controls" id="gcodeControls" hidden>
          <SelectControl
            id="gcodeProfile"
            label="Machine"
            defaultValue="uunatek3"
            rowClassName="select-row"
            optionDescriptions={{
              uunatek3:
                'Uses rear-left origin conventions and pen settings tuned for the UUNA TEK 3.0.',
              generic:
                'Uses a bottom-left origin and conservative defaults for a generic Z-axis plotter.',
            }}
          >
            <option value="uunatek3">UUNA TEK 3.0 · A3</option>
            <option value="generic">Generic Z-axis plotter</option>
          </SelectControl>
          <ValueControl
            id="drawFeed"
            label="Draw speed"
            min="50"
            max="12000"
            step="50"
            value="3000"
            unit="mm/m"
            morphable={false}
          />
          <ValueControl
            id="travelFeed"
            label="Travel speed"
            min="50"
            max="15000"
            step="50"
            value="6000"
            unit="mm/m"
            morphable={false}
          />
          <Checkbox id="optimizeTravel" defaultChecked>
            Optimize pen-up travel
          </Checkbox>
          <ValueControl
            id="mergeTolerance"
            label="Join tolerance"
            min="0"
            max="1"
            step="0.05"
            value="0.15"
            unit="mm"
            morphable={false}
          />
          <ValueControl
            id="penUp"
            label="Pen up Z"
            min="-20"
            max="50"
            step="0.1"
            value="0"
            unit="mm"
            morphable={false}
          />
          <ValueControl
            id="penDown"
            label="Pen down Z"
            min="-20"
            max="50"
            step="0.1"
            value="-3"
            unit="mm"
            morphable={false}
          />
          <ValueControl
            id="zFeed"
            label="Z speed"
            min="10"
            max="12000"
            step="10"
            value="2000"
            unit="mm/m"
            morphable={false}
          />
          <p className="gradient-note" id="gcodeProfileNote">
            UUNA TEK rear-left origin with 3 mm pen drop. Set the machine origin at the sheet’s
            rear-left corner before plotting.
          </p>
        </div>
      </FieldGroup>
    </Section>
  );
}
