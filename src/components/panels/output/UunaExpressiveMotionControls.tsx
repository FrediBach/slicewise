import { Checkbox, SelectControl, ValueControl } from '../../controls/FormControls';

export function UunaExpressiveMotionControls() {
  return (
    <div id="uunaExpressiveMotionSection">
      <Checkbox id="uunaExpressiveMotionEnabled">Expressive 3-axis motion</Checkbox>
      <p className="gradient-note">
        Opt in to coordinated X/Y/Z output for UUNA TEK. Calibrate the physical pen setup and run a
        pen-free test before plotting.
      </p>
      <div id="uunaExpressiveMotionControls" hidden>
        <SelectControl
          id="uunaExpressiveMode"
          label="Z behavior"
          defaultValue="constant"
          rowClassName="select-row"
          optionDescriptions={{
            constant: 'Draws at Contact Z without additional pressure.',
            tapered: 'Eases from contact into the selected press depth and back at every stroke.',
            modulated: 'Varies pressure periodically by final-path arc length.',
            curvature: 'Relieves pressure around tight turns while preserving straighter spans.',
          }}
        >
          <option value="constant">Constant contact</option>
          <option value="tapered">Tapered pressure</option>
          <option value="modulated">Pressure modulation</option>
          <option value="curvature">Curvature relief</option>
        </SelectControl>
        <ValueControl
          id="uunaExpressiveContactZ"
          label="Contact Z"
          min="-20"
          max="50"
          step="0.1"
          value="-3"
          unit="mm"
          morphable={false}
        />
        <div id="uunaExpressivePressureControls" hidden>
          <ValueControl
            id="uunaExpressiveMaximumPressDepth"
            label="Max press"
            min="0"
            max="5"
            step="0.1"
            value="0"
            unit="mm"
            morphable={false}
          />
          <div id="uunaExpressiveModulationControls" hidden>
            <ValueControl
              id="uunaExpressiveModulationDepth"
              label="Modulation depth"
              min="0"
              max="100"
              step="1"
              value="0"
              unit="%"
              morphable={false}
            />
            <ValueControl
              id="uunaExpressiveModulationPeriod"
              label="Wavelength"
              min="2"
              max="200"
              step="1"
              value="20"
              unit="mm"
              morphable={false}
            />
            <ValueControl
              id="uunaExpressiveModulationPhase"
              label="Phase"
              min="0"
              max="359"
              step="1"
              value="0"
              unit="°"
              morphable={false}
            />
          </div>
          <div id="uunaExpressiveCurvatureControls" hidden>
            <ValueControl
              id="uunaExpressiveCurvatureRelief"
              label="Corner relief"
              min="0"
              max="100"
              step="1"
              value="0"
              unit="%"
              morphable={false}
            />
          </div>
          <ValueControl
            id="uunaExpressiveLeadIn"
            label="Lead-in"
            min="0.5"
            max="50"
            step="0.5"
            value="2"
            unit="mm"
            morphable={false}
          />
          <ValueControl
            id="uunaExpressiveLeadOut"
            label="Lead-out"
            min="0.5"
            max="50"
            step="0.5"
            value="2"
            unit="mm"
            morphable={false}
          />
        </div>
        <div className="uuna-angle-guide">
          <svg viewBox="0 0 120 50" role="img" aria-label="Pen angle above the paper">
            <path d="M8 41H112" className="uuna-angle-guide__paper" />
            <path d="M55 40L76 8" className="uuna-angle-guide__pen" />
            <path d="M70 40A15 15 0 0 0 62 27" className="uuna-angle-guide__arc" />
            <text x="75" y="31">
              angle
            </text>
            <text x="8" y="49">
              paper · 90° is vertical
            </text>
          </svg>
        </div>
        <ValueControl
          id="uunaExpressivePenAngle"
          label="Pen angle"
          min="15"
          max="90"
          step="1"
          value="90"
          unit="°"
          morphable={false}
        />
        <ValueControl
          id="uunaExpressiveTiltDirection"
          label="Tilt direction"
          min="0"
          max="359"
          step="1"
          value="0"
          unit="°"
          morphable={false}
        />
        <Checkbox id="uunaExpressiveTipCompensation" defaultChecked>
          Compensate angled-tip offset
        </Checkbox>
        <Checkbox id="uunaExpressivePreserveDirection" defaultChecked>
          Preserve stroke direction
        </Checkbox>
        <ValueControl
          id="uunaExpressiveNibWidth"
          label="Nib width"
          min="0"
          max="20"
          step="0.1"
          value="0"
          unit="mm"
          morphable={false}
        />
        <p className="gradient-note">
          Direction is measured clockwise on the canvas from +X. Auto-rotation carries it into
          machine coordinates. Compensation uses Contact Z as the zero-offset plane. Nib width adds
          an approximate footprint preview and warns about nearby strokes; zero turns it off.
        </p>
        <button type="button" id="uunaCalibrationDownload" className="uuna-calibration">
          Download calibration G-code
        </button>
        <p className="gradient-note">
          Creates a 120 × 90 mm contact ladder, angle crosses, and taper fan using these settings.
          Start with zero Max press.
        </p>
      </div>
    </div>
  );
}
