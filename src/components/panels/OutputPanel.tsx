import { ChevronDown } from 'lucide-react';
import { Section } from '../ui/section';
import {
  BackgroundColorControl,
  Checkbox,
  FieldGroup,
  InkColorControl,
  RandomLock,
  ValueControl,
} from '../controls/FormControls';
import { GradientChooser } from '../controls/GradientChooser';

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

export function OutputPanel() {
  return (
    <Section title="Output" badge="03">
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
        <div className="control-row select-row">
          <div className="control-label">
            <label htmlFor="lineWeightMode">Line-weight variation</label>
            <RandomLock id="lineWeightMode" label="Line-weight variation" />
          </div>
          <div className="select-wrap">
            <select id="lineWeightMode" defaultValue="uniform">
              <option value="uniform">Uniform · off</option>
              <option value="index">Index contours</option>
              <option value="wave">Thickness wave</option>
              <option value="center">Centre weighted</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="effect-controls">
          <ValueControl
            id="lineWeightInterval"
            label="Interval"
            min="2"
            max="20"
            step="1"
            value="5"
            disabled
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
          />
        </div>
        <InkColorControl />
        <BackgroundColorControl />
        <GradientChooser />
      </FieldGroup>
      <FieldGroup title="Artboard">
        <div className="control-row select-row">
          <label htmlFor="paperPreset">Paper size</label>
          <div className="select-wrap">
            <select id="paperPreset" defaultValue="custom">
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
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="control-row">
          <label htmlFor="pw">Dimensions</label>
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
      <FieldGroup title="Post-processing">
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
          />
          <ValueControl
            id="halftoneCycles"
            label="Depth cycles"
            min="1"
            max="8"
            step="1"
            value="2"
            disabled
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
          />
          <p className="gradient-note blueprint-note">
            Adds stable, small hand-drawn variations to contour lines and plotter paths.
          </p>
        </div>
        <Checkbox id="blueprint" randomizable>
          Technical blueprint
        </Checkbox>
        <div className="effect-controls">
          <div className="control-row select-row is-disabled" id="blueprintStyleControl">
            <label className="blueprint-stock-label" htmlFor="blueprintStyle">
              Document stock
            </label>
            <div className="select-wrap">
              <select id="blueprintStyle" defaultValue="blue" disabled>
                <option value="blue">Blueprint blue · white ink</option>
                <option value="black">Technical black · white ink</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
          <p className="gradient-note blueprint-note">
            Adds a drafting grid, measured border, callouts, formula notes and a technical title
            block to the SVG.
          </p>
        </div>
        <TopographicMapControl />
      </FieldGroup>
      <FieldGroup title="Export format">
        <div className="control-row select-row">
          <label htmlFor="exportFormat">File type</label>
          <div className="select-wrap">
            <select id="exportFormat" defaultValue="svg">
              <option value="svg">SVG · vector</option>
              <option value="gcode">G-code · plotter</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="gcode-controls" id="gcodeControls" hidden>
          <div className="control-row select-row">
            <label htmlFor="gcodeProfile">Machine</label>
            <div className="select-wrap">
              <select id="gcodeProfile" defaultValue="uunatek3">
                <option value="uunatek3">UUNA TEK 3.0 · A3</option>
                <option value="generic">Generic Z-axis plotter</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
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
