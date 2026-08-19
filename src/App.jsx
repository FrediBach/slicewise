import { useEffect, useRef, useState } from "react";
import { Box, Check, ChevronDown, Clipboard, Dices, Download, FileUp, Lock, LockOpen, Plus, Redo2, Rotate3d, Trash2, Undo2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Section } from "./components/ui/section";
import { GEN_DEFAULTS } from "./lib/generativeMesh";

function MorphIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h7m0 0L7 2m2 2L7 6M14 12H7m0 0 2-2m-2 2 2 2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RandomLock({ id, label }) {
  const [locked, setLocked] = useState(false);
  const toggle = () => {
    const next = !locked;
    setLocked(next);
    document.dispatchEvent(new CustomEvent("randomlockchange", { detail: { id, locked: next } }));
  };
  return (
    <button type="button" className="random-lock" aria-pressed={locked}
      aria-label={`${locked ? "Unlock" : "Lock"} ${label} randomization`}
      title={locked ? "Include in randomization" : "Exclude from randomization"} onClick={toggle}>
      {locked ? <Lock size={11} /> : <LockOpen size={11} />}
    </button>
  );
}

function ValueControl({ id, label, min, max, step, value, unit, disabled = false, morphable = true, randomizable = morphable }) {
  const [morphMode, setMorphMode] = useState(0);
  const [morphValue, setMorphValue] = useState(Number(value));
  const [morphValueY, setMorphValueY] = useState(Number(value));
  const announceMorph = (dimension, active, nextValue) => {
    document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension, active, value: Number(nextValue) } }));
  };
  const toggleMorph = () => {
    const secondEnabled = Boolean(document.getElementById("morphSecondEnabled")?.checked);
    const nextMode = (morphMode + 1) % (secondEnabled ? 3 : 2);
    const mainValue = Number(document.getElementById(id)?.value ?? value);
    if (nextMode === 1 && morphMode === 0) {
      setMorphValue(mainValue);
      announceMorph(1, true, mainValue);
    } else if (nextMode === 2) {
      setMorphValueY(mainValue);
      announceMorph(2, true, mainValue);
    } else if (nextMode === 0) {
      announceMorph(1, false, morphValue);
      announceMorph(2, false, morphValueY);
    }
    setMorphMode(nextMode);
  };
  const changeMorphValue = (dimension, next) => {
    const parsed = Math.min(Number(max), Math.max(Number(min), Number(next)));
    if (!Number.isFinite(parsed)) return;
    if (dimension === 1) setMorphValue(parsed);
    else setMorphValueY(parsed);
    announceMorph(dimension, true, parsed);
  };

  useEffect(() => {
    const update = event => {
      const dimension = event.detail?.dimension || 1;
      if (event.detail?.id !== id || morphMode < dimension) return;
      const parsed = Math.min(Number(max), Math.max(Number(min), Number(event.detail.value)));
      if (!Number.isFinite(parsed)) return;
      if (dimension === 1) setMorphValue(parsed);
      else setMorphValueY(parsed);
      document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension, active: true, value: parsed } }));
    };
    document.addEventListener("randomizemorph", update);
    const secondDimension = event => {
      if (event.detail?.enabled || morphMode < 2) return;
      setMorphMode(1);
      document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension: 2, active: false, value: morphValueY } }));
    };
    document.addEventListener("morphseconddimension", secondDimension);
    const restore = event => {
      if (!morphable) return;
      const targetsX = event.detail?.morphTargetsById || {};
      const targetsY = event.detail?.morphTargets2ById || {};
      const hasX = Object.hasOwn(targetsX, id);
      const hasY = Object.hasOwn(targetsY, id);
      setMorphMode(hasY ? 2 : hasX ? 1 : 0);
      if (hasX) setMorphValue(targetsX[id]);
      if (hasY) setMorphValueY(targetsY[id]);
    };
    document.addEventListener("restoreparameters", restore);
    return () => {
      document.removeEventListener("randomizemorph", update);
      document.removeEventListener("morphseconddimension", secondDimension);
      document.removeEventListener("restoreparameters", restore);
    };
  }, [id, max, min, morphMode, morphValueY, morphable]);

  const morphInputs = (dimension, targetValue) => (
    <div className="control-inputs morph-inputs" data-dimension={dimension}>
      <span className="morph-axis" aria-hidden="true">{dimension === 1 ? "X" : "Y"}</span>
      <input type="range" id={`${id}Morph${dimension}`} min={min} max={max} step={step} value={targetValue}
        aria-label={`${label} morph ${dimension === 1 ? "X" : "Y"} target`} onChange={event => changeMorphValue(dimension, event.target.value)} />
      <span className={`value-field${unit ? " has-unit" : ""}`}>
        <input type="number" id={`${id}Morph${dimension}N`} min={min} max={max} step={step} value={targetValue}
          aria-label={`${label} morph ${dimension === 1 ? "X" : "Y"} target${unit ? ` in ${unit}` : ""}`} onChange={event => changeMorphValue(dimension, event.target.value)} />
        <span className="unit" aria-hidden="true">{unit || ""}</span>
      </span>
    </div>
  );

  return (
    <div className={`control-row${disabled ? " is-disabled" : ""}${morphMode ? " is-morphing" : ""}`} id={`${id}Control`}>
      <div className="control-label">
        <label htmlFor={id}>{label}</label>
        {morphable && <button type="button" className="morph-toggle" aria-pressed={morphMode > 0} data-morph-dimension={morphMode}
          aria-label={`${label} morph mode: ${morphMode === 0 ? "none" : morphMode === 1 ? "X only" : "X and Y"}`} title="Cycle morph mode: none, X, X + Y"
          onClick={toggleMorph}><MorphIcon /></button>}
        {randomizable && <RandomLock id={id} label={label} />}
      </div>
      <div className="control-stack">
        <div className="control-inputs">
          <input type="range" id={id} min={min} max={max} step={step} defaultValue={value} disabled={disabled} />
          <span className={`value-field${unit ? " has-unit" : ""}`}>
            <input type="number" id={`${id}N`} min={min} max={max} step={step} defaultValue={value} disabled={disabled}
              aria-label={`${label}${unit ? ` in ${unit}` : ""}`} />
            <span className="unit" aria-hidden="true">{unit || ""}</span>
          </span>
        </div>
        {morphMode >= 1 && morphInputs(1, morphValue)}
        {morphMode >= 2 && morphInputs(2, morphValueY)}
      </div>
    </div>
  );
}

function ColorControl({ id, label, defaultValue, swatchId, morphable = true }) {
  const [morphMode, setMorphMode] = useState(0);
  const [target, setTarget] = useState(defaultValue);
  const [targetText, setTargetText] = useState(defaultValue);
  const [targetY, setTargetY] = useState(defaultValue);
  const [targetTextY, setTargetTextY] = useState(defaultValue);
  const announce = (dimension, active, value) => {
    document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension, active, value } }));
  };
  const toggle = () => {
    const secondEnabled = Boolean(document.getElementById("morphSecondEnabled")?.checked);
    const nextMode = (morphMode + 1) % (secondEnabled ? 3 : 2);
    const main = document.getElementById(id)?.value || defaultValue;
    if (nextMode === 1 && morphMode === 0) {
      setTarget(main);
      setTargetText(main);
      announce(1, true, main);
    } else if (nextMode === 2) {
      setTargetY(main);
      setTargetTextY(main);
      announce(2, true, main);
    } else if (nextMode === 0) {
      announce(1, false, target);
      announce(2, false, targetY);
    }
    setMorphMode(nextMode);
  };
  const setValidTarget = (dimension, value) => {
    const valid = /^#[0-9a-f]{6}$/i.test(value);
    if (!valid) return;
    if (dimension === 1) setTarget(value);
    else setTargetY(value);
    announce(dimension, true, value);
  };

  useEffect(() => {
    const update = event => {
      const dimension = event.detail?.dimension || 1;
      if (event.detail?.id !== id || morphMode < dimension) return;
      const value = event.detail.value;
      if (dimension === 1) { setTarget(value); setTargetText(value); }
      else { setTargetY(value); setTargetTextY(value); }
      document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension, active: true, value } }));
    };
    document.addEventListener("randomizemorph", update);
    const secondDimension = event => {
      if (event.detail?.enabled || morphMode < 2) return;
      setMorphMode(1);
      document.dispatchEvent(new CustomEvent("morphchange", { detail: { id, dimension: 2, active: false, value: targetY } }));
    };
    document.addEventListener("morphseconddimension", secondDimension);
    const restore = event => {
      if (!morphable) return;
      const targetsX = event.detail?.morphTargetsById || {};
      const targetsY = event.detail?.morphTargets2ById || {};
      const hasX = Object.hasOwn(targetsX, id);
      const hasY = Object.hasOwn(targetsY, id);
      setMorphMode(hasY ? 2 : hasX ? 1 : 0);
      if (hasX) {
        setTarget(targetsX[id]);
        setTargetText(targetsX[id]);
      }
      if (hasY) {
        setTargetY(targetsY[id]);
        setTargetTextY(targetsY[id]);
      }
    };
    document.addEventListener("restoreparameters", restore);
    return () => {
      document.removeEventListener("randomizemorph", update);
      document.removeEventListener("morphseconddimension", secondDimension);
      document.removeEventListener("restoreparameters", restore);
    };
  }, [id, morphMode, morphable, targetY]);

  const colorTarget = (dimension, value, text, setText) => (
    <div className="color-control morph-color-control" data-dimension={dimension}>
      <span className="morph-axis" aria-hidden="true">{dimension === 1 ? "X" : "Y"}</span>
      <span className="swatch" style={{ background: value }}><input type="color" id={`${id}Morph${dimension}`} value={value}
        aria-label={`${label} morph ${dimension === 1 ? "X" : "Y"} target`} onChange={event => { setText(event.target.value); setValidTarget(dimension, event.target.value); }} /></span>
      <input type="text" id={`${id}Morph${dimension}Hex`} value={text} spellCheck="false" aria-label={`${label} morph ${dimension === 1 ? "X" : "Y"} target hex value`}
        onChange={event => { setText(event.target.value); setValidTarget(dimension, event.target.value); }} />
    </div>
  );

  return (
    <div className={`control-row color-row${morphMode ? " is-morphing" : ""}`} id={`${id}Control`}>
      <div className="control-label">
        <label htmlFor={`${id}Hex`}>{label}</label>
        {morphable && <button type="button" className="morph-toggle" aria-pressed={morphMode > 0} data-morph-dimension={morphMode}
          aria-label={`${label} morph mode: ${morphMode === 0 ? "none" : morphMode === 1 ? "X only" : "X and Y"}`}
          title="Cycle morph mode: none, X, X + Y" onClick={toggle}><MorphIcon /></button>}
        <RandomLock id={id} label={label} />
      </div>
      <div className="control-stack">
        <div className="color-control">
          <span className="swatch" id={swatchId} style={{ background: defaultValue }}><input type="color" id={id} defaultValue={defaultValue} /></span>
          <input type="text" id={`${id}Hex`} defaultValue={defaultValue} spellCheck="false" />
        </div>
        {morphable && morphMode >= 1 && colorTarget(1, target, targetText, setTargetText)}
        {morphable && morphMode >= 2 && colorTarget(2, targetY, targetTextY, setTargetTextY)}
      </div>
    </div>
  );
}

function InkColorControl() {
  return <ColorControl id="color" label="Ink colour" defaultValue="#15181a" swatchId="swatch" />;
}

function BackgroundColorControl() {
  return <ColorControl id="backgroundColor" label="Background colour" defaultValue="#ffffff" swatchId="backgroundSwatch" morphable={false} />;
}

function FieldGroup({ title, children, className = "" }) {
  return (
    <div className={`field-group ${className}`}>
      <div className="field-group-title"><span>{title}</span></div>
      <div className="field-group-body">{children}</div>
    </div>
  );
}

function Checkbox({ id, children, defaultChecked = false, randomizable = false }) {
  return (
    <div className="checkbox-control">
      <label className="checkbox-row">
        <input type="checkbox" id={id} defaultChecked={defaultChecked} />
        <span className="checkbox-box"><Check size={11} strokeWidth={3} /></span>
        <span>{children}</span>
      </label>
      {randomizable && <RandomLock id={id} label={String(children)} />}
    </div>
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

  useEffect(() => {
    const restore = event => {
      if (event.detail?.gradientStops) {
        setPreset("");
        setStops(event.detail.gradientStops.map(stop => [stop.position, stop.color]));
      }
    };
    document.addEventListener("restoreparameters", restore);
    return () => document.removeEventListener("restoreparameters", restore);
  }, []);

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
      <Checkbox id="gradientEnabled" randomizable>Use colour gradient</Checkbox>
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
  useEffect(() => {
    globalThis.slicewiseParseSVG = async (...args) => {
      const { parseSVG } = await import("./lib/svg-mesh.js");
      return parseSVG(...args);
    };
    import("./lib/slicer.js");
    return () => { delete globalThis.slicewiseParseSVG; };
  }, []);

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
                  <option value="upload" hidden>Uploaded model</option>
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
                <ValueControl id="genSeed" label="Seed" min="0" max="9999" step="1" value={GEN_DEFAULTS.genSeed} morphable={false} />
                <ValueControl id="genBlend" label="Carve" min="0" max="100" step="1" value={GEN_DEFAULTS.genBlend} unit="%" morphable={false} />
                <ValueControl id="genFreq" label="Frequency" min="0.5" max="8" step="0.1" value={GEN_DEFAULTS.genFreq} morphable={false} />
                <ValueControl id="genAniso" label="Z anisotropy" min="-100" max="100" step="1" value={GEN_DEFAULTS.genAniso} unit="%" morphable={false} />
                <ValueControl id="genIso" label="Level set" min="-1.4" max="1.4" step="0.01" value={GEN_DEFAULTS.genIso} morphable={false} />
                <ValueControl id="genTwist" label="Twist" min="-180" max="180" step="1" value={GEN_DEFAULTS.genTwist} unit="°" morphable={false} />
                <ValueControl id="genNoise" label="Noise" min="0" max="100" step="1" value={GEN_DEFAULTS.genNoise} unit="%" morphable={false} />
                <ValueControl id="genRes" label="Resolution" min="32" max="192" step="1" value={GEN_DEFAULTS.genRes} morphable={false} />
                <p className="gradient-note">The mesh rebuilds live. Higher resolutions are smoother but take longer to generate.</p>
              </div>
            </FieldGroup>
            <label className="dropzone" id="drop">
              <input type="file" id="file" accept=".stl,.obj,.ply,.svg,image/svg+xml" />
              <span className="drop-icon"><FileUp size={18} /></span>
              <strong>Drop a model here</strong>
              <em>or click to browse · STL, OBJ, PLY, SVG</em>
            </label>
            <FieldGroup title="SVG extrusion" className="svg-extrusion">
              <div id="svgExtrusion" hidden>
                <ValueControl id="svgDepth" label="Extrusion" min="0.5" max="100" step="0.1" value="12" unit="%" morphable={false} />
                <Checkbox id="svgRounded">Round extruded edges</Checkbox>
                <ValueControl id="svgRoundness" label="Roundness" min="0" max="100" step="0.5" value="25" unit="%" disabled morphable={false} />
                <p className="gradient-note">Depth is proportional to the SVG span. Roundness is relative to the largest safe edge radius.</p>
              </div>
            </FieldGroup>
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

          <Section title="Morph" badge="multi instance">
            <FieldGroup title="Parameter interpolation">
              <Checkbox id="morphEnabled">Enable morph instances</Checkbox>
              <div className="morph-settings" id="morphSettings">
                <ValueControl id="morphSteps" label="X steps" min="2" max="24" step="1" value="4" morphable={false} />
                <Checkbox id="morphSecondEnabled">Add Y dimension</Checkbox>
                <div className="morph-second-settings" id="morphSecondSettings">
                  <ValueControl id="morphStepsY" label="Y steps" min="2" max="24" step="1" value="4" morphable={false} />
                </div>
                <p className="gradient-note morph-note">Cycle each arrow through no morph, X only, and X + Y. X and Y targets combine into a matrix of variations.</p>
              </div>
            </FieldGroup>
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
                <div className="control-label"><label htmlFor="lens">Camera lens</label><RandomLock id="lens" label="Camera lens" /></div>
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
                <div className="control-label"><label htmlFor="gapEase">Gap easing</label><RandomLock id="gapEase" label="Gap easing" /></div>
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
                <div className="control-label"><label htmlFor="axis">Slice axis</label><RandomLock id="axis" label="Slice axis" /></div>
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
                <Checkbox id="spiral" randomizable>Continuous spiral</Checkbox>
                <Checkbox id="hide" defaultChecked randomizable>Remove hidden lines</Checkbox>
                <Checkbox id="sil" defaultChecked randomizable>Add outer silhouette</Checkbox>
              </div>
            </FieldGroup>
          </Section>

          <Section title="Output" badge="03">
            <FieldGroup title="Line style">
              <ValueControl id="sw" label="Stroke" min="0.05" max="2" step="0.05" value="0.35" unit="mm" />
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
                <div className="sheet-control"><input type="number" id="pw" min="10" max="2000" step="1" defaultValue="210" /><span>×</span><input type="number" id="ph" min="10" max="2000" step="1" defaultValue="210" /><span className="unit">mm</span></div>
              </div>
              <ValueControl id="margin" label="Margin" min="0" max="40" step="1" value="14" unit="mm" />
              <Checkbox id="bg">Include sheet background</Checkbox>
            </FieldGroup>
            <FieldGroup title="Post-processing">
              <Checkbox id="halftone" randomizable>Halftone stroke</Checkbox>
              <div className="effect-controls">
                <ValueControl id="halftoneSize" label="Dot spacing" min="0.5" max="8" step="0.1" value="2.4" unit="mm" disabled />
                <ValueControl id="halftoneContrast" label="Contrast" min="0" max="100" step="1" value="75" unit="%" disabled />
                <ValueControl id="halftoneCycles" label="Depth cycles" min="1" max="8" step="1" value="2" disabled />
              </div>
              <Checkbox id="chroma" randomizable>Chromatic aberration</Checkbox>
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
                <ValueControl id="drawFeed" label="Draw speed" min="50" max="12000" step="50" value="3000" unit="mm/m" morphable={false} />
                <ValueControl id="travelFeed" label="Travel speed" min="50" max="15000" step="50" value="6000" unit="mm/m" morphable={false} />
                <ValueControl id="penUp" label="Pen up Z" min="-20" max="50" step="0.1" value="0" unit="mm" morphable={false} />
                <ValueControl id="penDown" label="Pen down Z" min="-20" max="50" step="0.1" value="-3" unit="mm" morphable={false} />
                <ValueControl id="zFeed" label="Z speed" min="10" max="12000" step="10" value="2000" unit="mm/m" morphable={false} />
                <p className="gradient-note" id="gcodeProfileNote">UUNA TEK rear-left origin with 3 mm pen drop. Set the machine origin at the sheet’s rear-left corner before plotting.</p>
              </div>
            </FieldGroup>
          </Section>
        </div>

        <footer className="actions">
          <div className="parameter-actions">
            <Button id="undo" variant="outline" className="history-button" disabled aria-label="Undo parameter change" title="Undo · Ctrl/⌘ Z"><Undo2 size={14} />Undo</Button>
            <Button id="redo" variant="outline" className="history-button" disabled aria-label="Redo parameter change" title="Redo · Ctrl/⌘ Shift Z"><Redo2 size={14} />Redo</Button>
            <Button id="randomize" variant="outline" className="randomize-button"><Dices size={15} />Randomize parameters</Button>
          </div>
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
          <div className="canvas-label canvas-label--top" id="artboardDimensions">210 × 210 MM</div>
          <div className="canvas-label canvas-label--side">VECTOR PREVIEW</div>
          <div className="bed" id="bed" aria-label="Contour SVG preview" />
          <div className="orbit-hint"><Rotate3d size={14} />Drag to orbit <kbd>Shift</kbd> + drag to roll <kbd>Space</kbd> + drag to pan · Double-click to fit</div>
          <div className="toast" id="toast" />
        </div>
      </main>
    </div>
  );
}
