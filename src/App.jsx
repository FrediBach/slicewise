import { useEffect } from "react";
import { Box, Check, ChevronDown, Clipboard, Download, FileUp, Rotate3d } from "lucide-react";
import { Button } from "./components/ui/button";
import { Section } from "./components/ui/section";

function ValueControl({ id, label, min, max, step, value, unit }) {
  return (
    <div className="control-row">
      <label htmlFor={id}>{label}</label>
      <div className="control-inputs">
        <input type="range" id={id} min={min} max={max} step={step} defaultValue={value} />
        <input type="number" id={`${id}N`} min={min} max={max} step={step} defaultValue={value} />
        {unit && <span className="unit">{unit}</span>}
      </div>
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
            <span>Local processing · SVG output</span>
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
            <ValueControl id="az" label="Azimuth" min="-180" max="180" step="1" value="35" />
            <ValueControl id="el" label="Elevation" min="-180" max="180" step="1" value="24" />
            <ValueControl id="rl" label="Roll" min="-180" max="180" step="1" value="0" />
            <ValueControl id="zoom" label="Scale" min="0.2" max="3" step="0.01" value="1" />
          </Section>

          <Section title="Contours" badge="02">
            <ValueControl id="lines" label="Line count" min="1" max="200" step="1" value="40" />
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
            <ValueControl id="quality" label="Curve quality" min="1" max="10" step="1" value="7" />
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
              <ValueControl id="cutAz" label="Azimuth" min="-180" max="180" step="1" value="0" />
              <ValueControl id="cutEl" label="Elevation" min="-90" max="90" step="1" value="90" />
            </div>
            <div className="check-grid">
              <Checkbox id="hide" defaultChecked>Remove hidden lines</Checkbox>
              <Checkbox id="sil" defaultChecked>Add outer silhouette</Checkbox>
            </div>
          </Section>

          <Section title="Output" badge="03">
            <ValueControl id="sw" label="Stroke" min="0.05" max="2" step="0.05" value="0.35" unit="mm" />
            <div className="control-row">
              <label htmlFor="colorHex">Ink colour</label>
              <div className="color-control">
                <span className="swatch" id="swatch" style={{ background: "#15181a" }}><input type="color" id="color" defaultValue="#15181a" /></span>
                <input type="text" id="colorHex" defaultValue="#15181a" spellCheck="false" />
              </div>
            </div>
            <div className="control-row">
              <label htmlFor="pw">Sheet size</label>
              <div className="sheet-control"><input type="number" id="pw" min="10" max="2000" step="1" defaultValue="210" /><span>×</span><input type="number" id="ph" min="10" max="2000" step="1" defaultValue="210" /><span className="unit">mm</span></div>
            </div>
            <ValueControl id="margin" label="Margin" min="0" max="40" step="1" value="14" unit="mm" />
            <Checkbox id="bg">Include white sheet background</Checkbox>
            <div className="effect-divider" />
            <Checkbox id="chroma">Chromatic aberration</Checkbox>
            <ValueControl id="chromaAmount" label="RGB split" min="0.1" max="6" step="0.1" value="1.5" unit="mm" />
          </Section>
        </div>

        <footer className="actions">
          <div className="action-buttons">
            <Button id="save"><Download size={15} />Export SVG</Button>
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
          <div className="orbit-hint"><Rotate3d size={14} />Drag to orbit <kbd>Shift</kbd> + drag to roll</div>
          <div className="toast" id="toast" />
        </div>
      </main>
    </div>
  );
}
