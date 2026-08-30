import { Checkbox, FieldGroup, SelectControl, ValueControl } from '../../controls/FormControls';
import { Section } from '../../ui/section';
import {
  DEFAULT_GCODE_PROFILE_ID,
  GCODE_PROFILES,
  type GCodeProfileId,
} from '../../../lib/gcode-profiles';

const uunaProfileIds: GCodeProfileId[] = [
  'uunatek3-a3',
  'uunatek3-a2',
  'uunatek3-a1',
  'uunatek3-a0',
];

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
            defaultValue={DEFAULT_GCODE_PROFILE_ID}
            rowClassName="select-row"
            optionDescriptions={{
              ...Object.fromEntries(
                uunaProfileIds.map((id) => [
                  id,
                  `Uses the ${GCODE_PROFILES[id].workingArea!.width} × ${GCODE_PROFILES[id].workingArea!.height} mm rear-left working area and UUNA TEK motion defaults.`,
                ]),
              ),
              generic:
                'Uses a bottom-left origin and conservative defaults for a generic Z-axis plotter.',
            }}
          >
            {uunaProfileIds.map((id) => {
              const profile = GCODE_PROFILES[id];
              return (
                <option key={id} value={id}>
                  {profile.label} · {profile.workingArea!.width} × {profile.workingArea!.height} mm
                </option>
              );
            })}
            <option value="generic">Generic Z-axis plotter</option>
          </SelectControl>
          <Checkbox id="gcodeAutoRotate" defaultChecked>
            Auto-rotate portrait to fit
          </Checkbox>
          <p className="gradient-note">
            Rotates 90° clockwise only when the canvas does not fit directly but its swapped
            dimensions fit the selected machine.
          </p>
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
            {GCODE_PROFILES[DEFAULT_GCODE_PROFILE_ID].note}
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
            <p id="gcodePreflightLayout">No machine layout available yet.</p>
            <p id="gcodePreflightStats">No machine path available yet.</p>
            <p id="gcodePreflightIssue" className="gcode-preflight__issue" />
            <p className="gradient-note">
              Preflight checks the file itself. Confirm its placement in Universal Gcode Sender and
              frame the sheet with the pen raised before plotting.
            </p>
          </div>
          <div className="gcode-serial" aria-labelledby="gcodeSerialHeading">
            <div className="gcode-preflight__heading">
              <span id="gcodeSerialHeading">Direct connection · GRBL</span>
              <strong id="gcodeSerialStatus" role="status" aria-live="polite">
                Not connected
              </strong>
            </div>
            <div className="gcode-serial__actions">
              <button type="button" id="gcodeSerialConnect">
                Connect
              </button>
              <button type="button" id="gcodeSerialSend" disabled>
                Send to plotter
              </button>
              <button type="button" id="gcodeSerialStop" disabled>
                Stop
              </button>
            </div>
            <progress
              id="gcodeSerialProgress"
              className="gcode-serial__progress"
              max="1"
              value="0"
              aria-label="G-code transmission progress"
            />
            <p className="gradient-note" id="gcodeSerialNote">
              Connects at 115200 baud in Chrome or Edge. Commands stay local and are sent one at a
              time after GRBL acknowledges them.
            </p>
          </div>
        </div>
      </FieldGroup>
    </Section>
  );
}
