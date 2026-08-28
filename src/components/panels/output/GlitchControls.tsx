import { Checkbox, SelectControl, ValueControl } from '../../controls/FormControls';

export function GlitchControls() {
  return (
    <>
      <Checkbox id="blockGlitch" randomizable>
        Block glitch
      </Checkbox>
      <div className="effect-controls">
        <ValueControl
          id="blockGlitchCount"
          label="Blocks"
          min="1"
          max="24"
          step="1"
          value="3"
          disabled
          disabledReason="Turn on Block glitch to edit this parameter."
        />
        <ValueControl
          id="blockGlitchWidth"
          label="Block width"
          min="2"
          max="60"
          step="1"
          value="18"
          unit="%"
          disabled
          disabledReason="Turn on Block glitch to edit this parameter."
        />
        <ValueControl
          id="blockGlitchHeight"
          label="Block height"
          min="1"
          max="40"
          step="1"
          value="6"
          unit="%"
          disabled
          disabledReason="Turn on Block glitch to edit this parameter."
        />
        <ValueControl
          id="blockGlitchDisplacement"
          label="Displacement"
          min="0.5"
          max="60"
          step="0.5"
          value="8"
          unit="mm"
          disabled
          disabledReason="Turn on Block glitch to edit this parameter."
        />
        <SelectControl
          id="blockGlitchDirection"
          label="Direction"
          defaultValue="horizontal"
          randomizable
          disabled
          disabledReason="Turn on Block glitch to choose a direction."
          rowClassName="select-row"
          controlId="blockGlitchDirectionControl"
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
          <option value="both">Any direction</option>
        </SelectControl>
        <ValueControl
          id="blockGlitchSeed"
          label="Seed"
          min="0"
          max="9999"
          step="1"
          value="1"
          morphable={false}
          randomizable
          disabled
          disabledReason="Turn on Block glitch to edit this parameter."
        />
        <Checkbox id="blockGlitchClearDestination" randomizable>
          Clear destination
        </Checkbox>
        <p className="gradient-note blueprint-note">
          Cuts stable rectangular fragments from the linework and moves their real SVG and plotter
          paths.
        </p>
      </div>
      <Checkbox id="scanBandGlitch" randomizable>
        Scan-band glitch
      </Checkbox>
      <div className="effect-controls">
        <SelectControl
          id="scanBandGlitchOrientation"
          label="Band orientation"
          defaultValue="horizontal"
          randomizable
          disabled
          disabledReason="Turn on Scan-band glitch to choose an orientation."
          rowClassName="select-row"
          controlId="scanBandGlitchOrientationControl"
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </SelectControl>
        <ValueControl
          id="scanBandGlitchCount"
          label="Bands"
          min="2"
          max="64"
          step="1"
          value="12"
          disabled
          disabledReason="Turn on Scan-band glitch to edit this parameter."
        />
        <ValueControl
          id="scanBandGlitchThickness"
          label="Band thickness"
          min="5"
          max="100"
          step="1"
          value="55"
          unit="%"
          disabled
          disabledReason="Turn on Scan-band glitch to edit this parameter."
        />
        <ValueControl
          id="scanBandGlitchDensity"
          label="Affected bands"
          min="1"
          max="100"
          step="1"
          value="50"
          unit="%"
          disabled
          disabledReason="Turn on Scan-band glitch to edit this parameter."
        />
        <ValueControl
          id="scanBandGlitchDisplacement"
          label="Band displacement"
          min="0.5"
          max="40"
          step="0.5"
          value="6"
          unit="mm"
          disabled
          disabledReason="Turn on Scan-band glitch to edit this parameter."
        />
        <ValueControl
          id="scanBandGlitchSeed"
          label="Band seed"
          min="0"
          max="9999"
          step="1"
          value="2"
          morphable={false}
          randomizable
          disabled
          disabledReason="Turn on Scan-band glitch to edit this parameter."
        />
        <p className="gradient-note blueprint-note">
          Shifts selected strips along their long axis for a deterministic video-sync tear.
        </p>
      </div>
    </>
  );
}
