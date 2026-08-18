import { useEffect, useRef, useState } from "react";
import { Box, Check, ChevronDown, Clipboard, Dices, Download, FileUp, Plus, Rotate3d, Trash2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Section } from "./components/ui/section";

function ValueControl({ id, label, min, max, step, value, unit, disabled = false }) {
  return (
    <div className={`control-row${disabled ? " is-disabled" : ""}`} id={`${id}Control`}>
      <label htmlFor={id}>{label}</label>
      <div className="control-inputs">
        <input type="range" id={id} min={min} max={max} step={step} defaultValue={value} disabled={disabled} />
        <span className={`value-field${unit ? " has-unit" : ""}`}>
          <input type="number" id={`${id}N`} min={min} max={max} step={step} defaultValue={value} disabled={disabled}
            aria-label={`${label}${unit ? ` in ${unit}` : ""}`} />
          <span className="unit" aria-hidden="true">{unit || ""}</span>
        </span>
      </div>
    </div>
  );
}

function FieldGroup({ title, children, className = "" }) {
  return (
    <div className={`field-group ${className}`}>
      <div className="field-group-title"><span>{title}</span></div>
      <div className="field-group-body">{children}</div>
    </div>
  );
}

function Checkbox({ id, children, defaultChecked = false }) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" id={id} defaultChecked={defaultChecked} />
      <span className="checkbox-box"><Check size={11} strokeWidth={3} /></span>
      <span>{children}</span>
    </label>
  );
}

const GRADIENT_PRESETS = [
  { name: "Rainbow", stops: [[0,"#ef4444"],[.2,"#f59e0b"],[.4,"#84cc16"],[.6,"#06b6d4"],[.8,"#3b82f6"],[1,"#8b5cf6"]] },
  { name: "Sunset", stops: [[0,"#4c1d95"],[.42,"#db2777"],[.72,"#f97316"],[1,"#facc15"]] },
  { name: "Ocean", stops: [[0,"#082f49"],[.5,"#0891b2"],[1,"#a7f3d0"]] },
  { name: "Earth", stops: [[0,"#292524"],[.42,"#854d0e"],[.7,"#65a30d"],[1,"#d9f99d"]] },
  { name: "Mono", stops: [[0,"#111827"],[1,"#d1d5db"]] },
];

function GradientChooser() {
  const rootRef = useRef(null);
  const [stops, setStops] = useState(GRADIENT_PRESETS[0].stops);
  const [preset, setPreset] = useState("Rainbow");

  useEffect(() => {
    rootRef.current?.dispatchEvent(new CustomEvent("gradientchange", {
      bubbles: true,
      detail: { stops: stops.map(([position, color]) => ({ position, color })) },
    }));
  }, [stops]);

  const updateStop = (index, next) => {
    setPreset("");
    setStops(current => current.map((stop, i) => i === index ? next : stop).sort((a,b) => a[0]-b[0]));
  };
  const removeStop = index => {
    if (stops.length <= 2) return;
    setPreset("");
    setStops(current => current.filter((_, i) => i !== index));
  };
  const addStop = () => {
    let widest = -1, insertAt = 0;
    for (let i=0;i<stops.length-1;i++) {
      const gap = stops[i+1][0]-stops[i][0];
      if (gap > widest) { widest = gap; insertAt = i; }
    }
    const a=stops[insertAt], b=stops[insertAt+1];
    setPreset("");
    setStops(current => [...current, [(a[0]+b[0])/2, a[1]]].sort((x,y) => x[0]-y[0]));
  };

  const cssGradient = `linear-gradient(90deg, ${stops.map(([p,c]) => `${c} ${Math.round(p*100)}%`).join(", ")})`;
  return (
    <div className="gradient-editor" id="gradientEditor" ref={rootRef}>
      <Checkbox id="gradientEnabled">Use colour gradient</Checkbox>
      <div className="gradient-panel" id="gradientPanel">
        <div className="gradient-preview" style={{ background: cssGradient }} aria-label="Current gradient preview" />
        <div className="gradient-presets" aria-label="Gradient presets">
          {GRADIENT_PRESETS.map(item => (
            <button key={item.name} type="button" className={preset === item.name ? "active" : ""}
              onClick={() => { setPreset(item.name); setStops(item.stops); }}>
              <span style={{ background: `linear-gradient(90deg, ${item.stops.map(([p,c]) => `${c} ${p*100}%`).join(", ")})` }} />
              {item.name}
            </button>
          ))}
        </div>
        <div className="gradient-stops">
          {stops.map(([position, color], index) => (
            <div className="gradient-stop" key={index}>
              <input type="color" value={color} aria-label={`Stop ${index+1} colour`}
                onChange={e => updateStop(index, [position, e.target.value])} />
              <input type="range" min="0" max="100" step="1" value={Math.round(position*100)} aria-label={`Stop ${index+1} position`}
                onChange={e => updateStop(index, [Number(e.target.value)/100, color])} />
              <span>{Math.round(position*100)}%</span>
              <button type="button" onClick={() => removeStop(index)} disabled={stops.length <= 2} aria-label={`Remove stop ${index+1}`}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="add-stop" onClick={addStop}><Plus size={12} /> Add colour stop</button>
        <ValueControl id="gradientColors" label="Pen colours" min="2" max="24" step="1" value="6" />
        <p className="gradient-note">The gradient is sampled into separate, plotter-ready paths.</p>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => { import("./lib/slicer.js"); }, []);

  return (
    <div className="app-shell">
      <aside className="rail">
        <header className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <div><h1>Slicewise</h1><p>Mesh to contour studio</p></div>
          <span className="version">01</span>
        </header>

        <div className="rail-scroll">
          <div className="intro">
            <p>Transform a 3D model into precise, plotter-ready contour lines.</p>
            <span>Local processing · SVG + G-code output</span>
          </div>

          <Section title="Source model" badge="01">
            <div className="control-row demo-row">
              <label htmlFor="demo">Demo</label>
              <div className="select-wrap">
                <select id="demo" defaultValue="knot">
                  <option value="knot">Torus knot</option>
                  <option value="ripple">Ripple sphere</option>
                  <option value="cube">Rounded cube</option>
                  <option value="torus">Ring torus</option>
                  <option value="upload" hidden>Uploaded model</option>
                </select>
                <ChevronDown size={14} />
              </div>
            </div>
            <label className="dropzone" id="drop">
              <input type="file" id="file" accept=".stl,.obj,.ply" />
              <span className="drop-icon"><FileUp size={18} /></span>
              <strong>Drop a model here</strong>
              <em>or click to browse · STL, OBJ, PLY</em>
            </label>
            <div className="model-card">
              <div className="model-icon"><Box size={17} /></div>
              <div className="model-copy"><strong id="mName">demo · torus knot</strong><span><b id="mTris">—</b> triangles</span></div>
              <span className="status-dot" title="Model loaded" />
            </div>
            <div className="axis-row">
              <span>Model up axis</span>
              <div className="segmented">
                <button type="button" id="upZ" aria-pressed="true">Z up</button>
                <button type="button" id="upY" aria-pressed="false">Y up</button>
              </div>
            </div>
            <p className="error" id="mErr" hidden />
          </Section>

          <Section title="View" badge={<><Rotate3d size={12} /> drag canvas</>}>
            <FieldGroup title="Orientation">
              <ValueControl id="az" label="Azimuth" min="-180" max="180" step="1" value="35" unit="°" />
              <ValueControl id="el" label="Elevation" min="-180" max="180" step="1" value="24" unit="°" />
              <ValueControl id="rl" label="Roll" min="-180" max="180" step="1" value="0" unit="°" />
            </FieldGroup>
            <FieldGroup title="Framing & lens">
              <ValueControl id="zoom" label="Scale" min="0.2" max="3" step="0.01" value="1" unit="×" />
              <ValueControl id="panX" label="Offset X" min="-2000" max="2000" step="0.1" value="0" unit="mm" />
              <ValueControl id="panY" label="Offset Y" min="-2000" max="2000" step="0.1" value="0" unit="mm" />
              <div className="control-row select-row">
                <label htmlFor="lens">Camera lens</label>
                <div className="select-wrap">
                  <select id="lens" defaultValue="clean">
                    <option value="clean">50 mm · clean</option>
                    <option value="wide">24 mm · wide barrel</option>
                    <option value="fisheye">12 mm · fisheye</option>
                    <option value="tele">85 mm · pincushion</option>
                  </select>
                  <ChevronDown size={14} />
                </div>
              </div>
              <ValueControl id="lensAmount" label="Distortion" min="0" max="200" step="1" value="100" unit="%" disabled />
            </FieldGroup>
          </Section>

          <Section title="Contours" badge="02">
            <FieldGroup title="Density & finish">
              <ValueControl id="lines" label="Line count" min="1" max="200" step="1" value="40" />
              <ValueControl id="quality" label="Curve quality" min="1" max="10" step="1" value="7" />
            </FieldGroup>
            <FieldGroup title="Line spacing">
              <div className="control-row select-row">
                <label htmlFor="gapEase">Gap easing</label>
                <div className="select-wrap">
                  <select id="gapEase" defaultValue="linear">
                    <option value="linear">Linear</option>
                    <optgroup label="Sine">
                      <option value="sine-in">Sine · in</option>
                      <option value="sine-out">Sine · out</option>
                      <option value="sine-in-out">Sine · in &amp; out</option>
                      <option value="sine-out-in">Sine · out &amp; in</option>
                    </optgroup>
                    <optgroup label="Quadratic">
                      <option value="ease-in">Quadratic · in</option>
                      <option value="ease-out">Quadratic · out</option>
                      <option value="ease-in-out">Quadratic · in &amp; out</option>
                      <option value="ease-out-in">Quadratic · out &amp; in</option>
                    </optgroup>
                    <optgroup label="Cubic">
                      <option value="cubic-in">Cubic · in</option>
                      <option value="cubic-out">Cubic · out</option>
                      <option value="cubic-in-out">Cubic · in &amp; out</option>
                      <option value="cubic-out-in">Cubic · out &amp; in</option>
                    </optgroup>
                  </select>
                  <ChevronDown size={14} />
                </div>
              </div>
              <ValueControl id="easeStrength" label="Ease strength" min="0" max="300" step="1" value="100" unit="%" />
              <ValueControl id="easeCycles" label="Ease cycles" min="1" max="12" step="1" value="1" />
              <ValueControl id="easeCenter" label="Ease centre" min="5" max="95" step="1" value="50" unit="%" disabled />
            </FieldGroup>
            <FieldGroup title="Slice plane">
              <div className="control-row select-row">
                <label htmlFor="axis">Slice axis</label>
                <div className="select-wrap">
                  <select id="axis" defaultValue="up">
                    <option value="up">Height · topographic</option>
                    <option value="cam">View depth · camera</option>
                    <option value="x">Model width</option>
                    <option value="y">Model depth</option>
                    <option value="custom">Custom plane angle</option>
                  </select>
                  <ChevronDown size={14} />
                </div>
              </div>
              <div className="custom-axis" id="customAxis" hidden>
                <ValueControl id="cutAz" label="Azimuth" min="-180" max="180" step="1" value="0" unit="°" />
                <ValueControl id="cutEl" label="Elevation" min="-90" max="90" step="1" value="90" unit="°" />
              </div>
            </FieldGroup>
            <FieldGroup title="Path construction" className="field-group--checks">
              <div className="check-grid">
                <Checkbox id="spiral">Continuous spiral</Checkbox>
                <Checkbox id="hide" defaultChecked>Remove hidden lines</Checkbox>
                <Checkbox id="sil" defaultChecked>Add outer silhouette</Checkbox>
              </div>
            </FieldGroup>
          </Section>

          <Section title="Output" badge="03">
            <FieldGroup title="Line style">
              <ValueControl id="sw" label="Stroke" min="0.05" max="2" step="0.05" value="0.35" unit="mm" />
              <div className="control-row">
                <label htmlFor="colorHex">Ink colour</label>
                <div className="color-control">
                  <span className="swatch" id="swatch" style={{ background: "#15181a" }}><input type="color" id="color" defaultValue="#15181a" /></span>
                  <input type="text" id="colorHex" defaultValue="#15181a" spellCheck="false" />
                </div>
              </div>
              <GradientChooser />
            </FieldGroup>
            <FieldGroup title="Artboard">
              <div className="control-row">
                <label htmlFor="pw">Sheet size</label>
                <div className="sheet-control"><input type="number" id="pw" min="10" max="2000" step="1" defaultValue="210" /><span>×</span><input type="number" id="ph" min="10" max="2000" step="1" defaultValue="210" /><span className="unit">mm</span></div>
              </div>
              <ValueControl id="margin" label="Margin" min="0" max="40" step="1" value="14" unit="mm" />
              <Checkbox id="bg">Include white sheet background</Checkbox>
            </FieldGroup>
            <FieldGroup title="Post-processing">
              <Checkbox id="halftone">Halftone stroke</Checkbox>
              <div className="effect-controls">
                <ValueControl id="halftoneSize" label="Dot spacing" min="0.5" max="8" step="0.1" value="2.4" unit="mm" disabled />
                <ValueControl id="halftoneContrast" label="Contrast" min="0" max="100" step="1" value="75" unit="%" disabled />
                <ValueControl id="halftoneCycles" label="Depth cycles" min="1" max="8" step="1" value="2" disabled />
              </div>
              <Checkbox id="chroma">Chromatic aberration</Checkbox>
              <div className="effect-controls">
                <ValueControl id="chromaAmount" label="RGB split" min="0.1" max="6" step="0.1" value="1.5" unit="mm" disabled />
              </div>
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
                <ValueControl id="drawFeed" label="Draw speed" min="50" max="12000" step="50" value="3000" unit="mm/m" />
                <ValueControl id="travelFeed" label="Travel speed" min="50" max="15000" step="50" value="6000" unit="mm/m" />
                <ValueControl id="penUp" label="Pen up Z" min="-20" max="50" step="0.1" value="0" unit="mm" />
                <ValueControl id="penDown" label="Pen down Z" min="-20" max="50" step="0.1" value="-3" unit="mm" />
                <ValueControl id="zFeed" label="Z speed" min="10" max="12000" step="10" value="2000" unit="mm/m" />
                <p className="gradient-note" id="gcodeProfileNote">UUNA TEK rear-left origin with 3 mm pen drop. Set the machine origin at the sheet’s rear-left corner before plotting.</p>
              </div>
            </FieldGroup>
          </Section>
        </div>

        <footer className="actions">
          <Button id="randomize" variant="outline" className="randomize-button"><Dices size={15} />Randomize parameters</Button>
          <div className="action-buttons">
            <Button id="save"><Download size={15} /><span id="exportLabel">Export SVG</span></Button>
            <Button id="copy" variant="outline" aria-label="Copy SVG markup"><Clipboard size={15} /></Button>
          </div>
          <p>© 2026 Fredi Bach</p>
        </footer>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="workspace-title"><span className="live-dot" />Preview <span>/ contour study</span></div>
          <div className="readout">
            <span>Paths <b id="rPaths">0</b></span>
            <span>Nodes <b id="rPts">0</b></span>
            <span>File <b id="rSize">0 kB</b></span>
            <span>Render <b id="rMs">0 ms</b></span>
          </div>
        </header>
        <div className="bedwrap" id="bedwrap">
          <div className="canvas-grid" />
          <div className="canvas-label canvas-label--top">210 × 210 MM</div>
          <div className="canvas-label canvas-label--side">VECTOR PREVIEW</div>
          <div className="bed" id="bed" aria-label="Contour SVG preview" />
          <div className="orbit-hint"><Rotate3d size={14} />Drag to orbit <kbd>Shift</kbd> + drag to roll <kbd>Space</kbd> + drag to pan · Double-click to fit</div>
          <div className="toast" id="toast" />
        </div>
      </main>
    </div>
  );
}
