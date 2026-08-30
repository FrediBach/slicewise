import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../../controls/FormControls';
import { Section } from '../../ui/section';

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
          <div className="gcode-preflight" aria-labelledby="gcodePreflightHeading">
            <div className="gcode-preflight__heading">
              <span id="gcodePreflightHeading">Machine preflight</span>
              <strong id="gcodePreflightStatus" role="status" aria-live="polite">
                Waiting for an exact render
              </strong>
            </div>
            <svg
              id="gcodePathPreview"
              viewBox="0 0 1 1"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="Validated G-code drawing and pen-up travel preview"
            >
              <rect id="gcodePreviewSheet" x="0" y="0" width="1" height="1" />
              <path id="gcodePreviewTravel" />
              <path id="gcodePreviewDraw" />
              <circle id="gcodePreviewOrigin" cx="0" cy="0" r="0.01" />
            </svg>
            <div className="gcode-preflight__legend" aria-hidden="true">
              <span className="gcode-preflight__draw">Pen down</span>
              <span className="gcode-preflight__travel">Pen-up travel</span>
            </div>
            <p id="gcodePreflightStats">No machine path available yet.</p>
            <p id="gcodePreflightIssue" className="gcode-preflight__issue" />
            <p className="gradient-note">
              Preflight checks the file itself. Confirm its placement in Universal Gcode Sender and
              frame the sheet with the pen raised before plotting.
            </p>
          </div>
        </div>
      </FieldGroup>
    </Section>
  );
}
