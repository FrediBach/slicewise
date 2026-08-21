"use strict";
import { generateGCode } from "./gcode.js";
import { createColorPair } from "./colorPair.js";
import { GEN_DEFAULTS } from "./generativeMesh";
import {
  parseOBJ,
  parsePLY,
  parseSTL,
  radialColumnDemo,
  ringTorus,
  sphereDemo,
  tetrapodDemo,
  torusKnot,
  vertexNormals,
  weld,
} from "./mesh.js";

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:v>b?b:v;

/* =================================================================== app */
const state = {
  mesh: null, name: "demo · torus knot", source: "knot", upY: false,
  svgSource: null, svgSourceName: "", svgDepth: 12, svgRounded: false, svgRoundness: 25,
  ...GEN_DEFAULTS,
  az: 35, el: 24, roll: 0, zoom: 1, panX: 0, panY: 0, lens: "clean", lensAmount: 100,
  lines: 40, gapEase: "linear", easeStrength: 100, easeCycles: 1, easeCenter: 50, quality: 7, axis: "up", cutAz: 0, cutEl: 90, spiral: false, hide: true, sil: true,
  sw: 0.35, color: "#15181a", backgroundColor: "#ffffff", pw: 210, ph: 210, margin: 14, bg: true,
  gradientEnabled: false, gradientColors: 6,
  gradientStops: [{position:0,color:"#ef4444"},{position:.2,color:"#f59e0b"},{position:.4,color:"#84cc16"},{position:.6,color:"#06b6d4"},{position:.8,color:"#3b82f6"},{position:1,color:"#8b5cf6"}],
  halftone: false, halftoneSize: 2.4, halftoneContrast: 75, halftoneCycles: 2,
  chroma: false, chromaAmount: 1.5,
  humanizer: false, humanizerAmount: 30,
  blueprint: false, blueprintStyle: "blue",
  morphEnabled: false, morphSteps: 4, morphTargets: {}, morphSecondEnabled: false, morphStepsY: 4, morphTargets2: {},
  exportFormat: "svg", gcodeProfile: "uunatek3", drawFeed: 3000, travelFeed: 6000, penUp: 0, penDown: -3, zFeed: 2000,
  svg: "", svgBytes: 0, toolpaths: [], dragging: false
};

if (typeof document !== "undefined") {
function fitBed(W, H){
  const wrap = $("bedwrap"), bed = $("bed");
  const style = getComputedStyle(wrap);
  const horizontalPadding = parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
  const verticalPadding = parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
  // Keep the registration marks inside the clipped workspace as well as the
  // sheet itself. Reading computed padding also follows responsive CSS changes.
  const edgeRoom = 8;
  const availW = Math.max(120, wrap.clientWidth-horizontalPadding-edgeRoom);
  const availH = Math.max(120, wrap.clientHeight-verticalPadding-edgeRoom);
  const s = Math.min(availW / W, availH / H);
  bed.style.width  = Math.round(W*s) + "px";
  bed.style.height = Math.round(H*s) + "px";
}

/* ------------------------------------------------ worker + smart redraw */
const renderWorker = new Worker(new URL("./slicer-worker.js", import.meta.url), {type:"module"});
let requestId = 0, appliedRequestId = 0, failedRequestId = 0;
let queuedRender = null, renderInFlight = false;
let renderWaiters = [];
let renderTimer = 0, lastDispatch = 0, observedRenderMs = 0, meshVersion = 0;

function settingsSnapshot(){
  const {az,el,roll,zoom,panX,panY,lens,lensAmount,lines,gapEase,easeStrength,easeCycles,easeCenter,quality,axis,cutAz,cutEl,spiral,hide,sil,sw,color,backgroundColor,gradientEnabled,gradientColors,gradientStops,pw,ph,margin,bg,halftone,halftoneSize,halftoneContrast,halftoneCycles,chroma,chromaAmount,humanizer,humanizerAmount,blueprint,blueprintStyle,morphEnabled,morphSteps,morphTargets,morphSecondEnabled,morphStepsY,morphTargets2} = state;
  return {az,el,roll,zoom,panX,panY,lens,lensAmount,lines,gapEase,easeStrength,easeCycles,easeCenter,quality,axis,cutAz,cutEl,spiral,hide,sil,sw,color,backgroundColor,gradientEnabled,gradientColors,gradientStops,pw,ph,margin,bg,halftone,halftoneSize,halftoneContrast,halftoneCycles,chroma,chromaAmount,humanizer,humanizerAmount,blueprint,blueprintStyle,documentTitle:state.name,morphEnabled,morphSteps,morphTargets:{...morphTargets},morphSecondEnabled,morphStepsY,morphTargets2:{...morphTargets2}};
}
function throttleDelay(){
  const triangles = state.mesh ? state.mesh.T.length/3 : 0;
  const visibilityCost = state.hide ? 1.55 : 1;
  const curveCost = 1 + Math.max(0, state.quality-1)*.055;
  const morphCost = state.morphEnabled && Object.keys(state.morphTargets).length
    ? state.morphSteps*(state.morphSecondEnabled && Object.keys(state.morphTargets2).length ? state.morphStepsY : 1) : 1;
  const score = triangles * state.lines * visibilityCost * curveCost * morphCost;
  let complexityDelay = 150;
  if (score < 450000) complexityDelay = 16;
  else if (score < 1500000) complexityDelay = 32;
  else if (score < 4000000) complexityDelay = 60;
  else if (score < 9000000) complexityDelay = 100;
  // Adapt when a particular device or mesh is slower than the static estimate.
  return Math.min(180, Math.max(complexityDelay, observedRenderMs*.4));
}
function applyRender(result, id){
  observedRenderMs = observedRenderMs ? observedRenderMs*.72+result.ms*.28 : result.ms;
  appliedRequestId = id;
  state.svg = result.svg;
  state.svgBytes = result.bytes;
  state.toolpaths = result.toolpaths || [];
  fitBed(result.W, result.H);
  $("artboardDimensions").textContent = `${result.W} × ${result.H} MM`;
  $("bed").style.background = state.blueprint ? (state.blueprintStyle==="black" ? "#101417" : "#0b3f7a") : state.backgroundColor;
  $("bed").innerHTML = result.svg;
  $("rPaths").textContent = result.paths.toLocaleString();
  $("rPts").textContent = Math.round(result.nodes).toLocaleString();
  updateExportSize();
  $("rMs").textContent = Math.round(result.ms) + " ms";
}
function notifyRenderWaiters(){
  const waiters=renderWaiters;
  renderWaiters=[];
  for (const resolve of waiters) resolve();
}
async function waitForCurrentRender(){
  while (renderInFlight || queuedRender || appliedRequestId!==requestId){
    const awaitedRequestId=requestId;
    await new Promise(resolve=>renderWaiters.push(resolve));
    if (failedRequestId>=awaitedRequestId && appliedRequestId<awaitedRequestId){
      throw new Error("The latest contour render could not be exported");
    }
  }
}
function dispatchRender(){
  if (renderInFlight || !queuedRender) return;
  const request = queuedRender;
  queuedRender = null;
  renderInFlight = true;
  lastDispatch = performance.now();
  $("bedwrap").classList.add("busy");
  renderWorker.postMessage({type:"render", ...request});
}
function scheduleRender(){
  if (renderInFlight || !queuedRender) return;
  clearTimeout(renderTimer);
  const wait = queuedRender.quick ? Math.max(0, throttleDelay()-(performance.now()-lastDispatch)) : 0;
  if (wait > 1) renderTimer = setTimeout(dispatchRender, wait);
  else requestAnimationFrame(dispatchRender);
}
function redraw(quick){
  if (!state.mesh) return;
  if (!quick) scheduleParameterHistory();
  // Preserve a queued final-quality request; otherwise only the latest input
  // matters. This coalesces pointer and slider events while the worker is busy.
  const renderQuick = quick && queuedRender?.quick !== false;
  queuedRender = {id:++requestId, meshVersion, quick:renderQuick, settings:settingsSnapshot()};
  scheduleRender();
}
renderWorker.addEventListener("message", ({data}) => {
  renderInFlight = false;
  if (data.meshVersion === meshVersion && data.type === "result" && data.id===requestId) applyRender(data.result,data.id);
  else if (data.meshVersion === meshVersion && data.type === "error"){
    failedRequestId=data.id;
    showError(data.message);
  }
  notifyRenderWaiters();
  if (!queuedRender && !generationInFlight) $("bedwrap").classList.remove("busy");
  scheduleRender();
});
renderWorker.addEventListener("error", () => {
  renderInFlight = false;
  failedRequestId=requestId;
  notifyRenderWaiters();
  if (!generationInFlight) $("bedwrap").classList.remove("busy");
  showError("The contour worker stopped unexpectedly — reload the page to restart it");
});

/* --------------------------------------------------------- load model */
function sendMeshToWorker(mesh){
  const V=mesh.V.slice(), T=mesh.T.slice(), N=mesh.N.slice();
  renderWorker.postMessage(
    {type:"mesh", meshVersion:++meshVersion, mesh:{V:V.buffer, T:T.buffer, N:N.buffer}},
    [V.buffer, T.buffer, N.buffer]
  );
}
function setMesh(raw, name){
  try{
    let m = weld(raw);
    if (state.upY){                       // rotate Y-up data so Z points up
      const V = m.V;
      for (let i=0;i<V.length;i+=3){
        const y = V[i+1], z = V[i+2];
        V[i+1] = -z; V[i+2] = y;
      }
    }
    state.mesh = m;
    state.mesh.N = vertexNormals(state.mesh.V, state.mesh.T);
    sendMeshToWorker(state.mesh);
    state.name = name;
    $("mName").textContent = name;
    $("mName").title = "";
    $("mTris").textContent = (m.T.length/3).toLocaleString();
    $("mErr").hidden = true;
    redraw(false);
  } catch(e){ showError(e.message); }
}
function showError(msg){
  const el = $("mErr");
  el.hidden = false;
  el.textContent = msg;
}

let rawCache = null;   // keep the parsed-but-unoriented mesh so "up axis" can flip live
const demoCache = new Map();
const demos = {
  knot: {name:"demo · torus knot", create:()=>torusKnot()},
  ripple: {name:"demo · ripple sphere", create:()=>sphereDemo("ripple")},
  cube: {name:"demo · rounded cube", create:()=>sphereDemo("cube")},
  diamond: {name:"demo · soft diamond", create:()=>sphereDemo("diamond")},
  torus: {name:"demo · ring torus", create:()=>ringTorus()},
  twist: {name:"demo · twisted bloom", create:()=>radialColumnDemo("twist")},
  hourglass: {name:"demo · hourglass", create:()=>radialColumnDemo("hourglass")},
  tetrapod: {name:"demo · tetrapod", create:()=>tetrapodDemo()}
};
function loadDemo(id, announce=true){
  const demo=demos[id];
  if (!demo) return;
  if (!demoCache.has(id)) demoCache.set(id, demo.create());
  rawCache=demoCache.get(id);
  state.source=id;
  state.svgSource=null;
  state.svgSourceName="";
  cancelGeneration();
  syncSourceControls();
  state.upY=false;
  $("upZ").setAttribute("aria-pressed", "true");
  $("upY").setAttribute("aria-pressed", "false");
  setMesh(rawCache, demo.name);
  if (announce) toast("Loaded " + demo.name.replace("demo · ", ""));
}
function loadFile(file){
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      let raw;
      if (ext === "svg"){
        const text=new TextDecoder().decode(new Uint8Array(reader.result));
        raw=await globalThis.slicewiseParseSVG(text,state.svgDepth,state.svgRounded,state.svgRoundness);
        state.svgSource=text;
        state.svgSourceName=file.name;
      }
      else if (ext === "stl") raw = parseSTL(reader.result);
      else if (ext === "obj") raw = parseOBJ(new TextDecoder().decode(new Uint8Array(reader.result)));
      else if (ext === "ply") raw = parsePLY(reader.result);
      else throw new Error("Unsupported format: ." + ext + " — use STL, OBJ, PLY or SVG");
      if (!raw.tris.length) throw new Error("No triangles found in " + file.name);
      if (ext!=="svg"){
        state.svgSource=null;
        state.svgSourceName="";
      }
      rawCache = raw;
      state.source="upload";
      cancelGeneration();
      $("demo").value = "upload";
      // OBJ and PLY usually ship Y-up; STL is almost always Z-up
      const guessY = (ext === "obj" || ext === "ply");
      state.upY = guessY;
      $("upZ").setAttribute("aria-pressed", String(!guessY));
      $("upY").setAttribute("aria-pressed", String(guessY));
      syncSourceControls();
      setMesh(raw, file.name);
      toast("Loaded " + file.name);
    } catch(e){ showError(e.message); }
  };
  reader.onerror = () => showError("Could not read that file — check it isn't open in another program");
  reader.readAsArrayBuffer(file);
}

const generativeWorker = new Worker(new URL("./generative-mesh-worker.ts", import.meta.url), {type:"module"});
const generativeKeys=["genSeed","genBlend","genFreq","genAniso","genIso","genTwist","genNoise","genRes"];
let generationId=0, generationInFlight=false, queuedGeneration=null, generationTimer=0;
function cancelGeneration(){
  clearTimeout(generationTimer);
  queuedGeneration=null;
  generationId++;
  setGenerativeBusy(false);
}
function generativeParams(){
  return Object.fromEntries(["genField",...generativeKeys].map(key=>[key,state[key]]));
}
function setGenerativeBusy(busy){
  $("generativeControls").closest(".generative-controls")?.classList.toggle("is-building",busy);
  $("bedwrap").classList.toggle("busy",busy || renderInFlight);
  $("mName").textContent=busy && state.source==="generative" ? `generative · ${state.genField} · building…` : state.name;
}
function dispatchGeneration(){
  if (generationInFlight || !queuedGeneration) return;
  const request=queuedGeneration;
  queuedGeneration=null;
  generationInFlight=true;
  setGenerativeBusy(true);
  generativeWorker.postMessage({type:"generate",...request});
}
function queueGeneration(delay=100){
  if (state.source!=="generative") return;
  queuedGeneration={id:++generationId,params:generativeParams()};
  clearTimeout(generationTimer);
  if (generationInFlight) return;
  generationTimer=setTimeout(dispatchGeneration,delay);
}
function loadGenerative(announce=true){
  state.source="generative";
  state.svgSource=null;
  state.svgSourceName="";
  state.upY=false;
  $("upZ").setAttribute("aria-pressed","true");
  $("upY").setAttribute("aria-pressed","false");
  syncSourceControls();
  queueGeneration(0);
  if (announce) toast("Generating mesh");
}
generativeWorker.addEventListener("message",({data})=>{
  generationInFlight=false;
  if (data.type==="error" && data.id===generationId && state.source==="generative") showError(data.message);
  if (data.type==="result" && data.id===generationId && state.source==="generative"){
    rawCache={verts:new Float32Array(data.positions),tris:new Uint32Array(data.indices)};
    setMesh(rawCache,`generative · ${state.genField}`);
    $("mName").title=`Generated in ${Math.round(data.stats.ms)} ms`;
  }
  if (queuedGeneration) dispatchGeneration();
  else setGenerativeBusy(false);
});
generativeWorker.addEventListener("error",()=>{
  generationInFlight=false;
  queuedGeneration=null;
  setGenerativeBusy(false);
  if (state.source==="generative") showError("The mesh generator stopped unexpectedly — reload the page to restart it");
});

/* -------------------------------------------------------------- wiring */
const morphKeyById=new Map();
function bindPair(id, key, after){
  morphKeyById.set(id,key);
  const s = $(id), n = $(id + "N");
  const apply = (v, from) => {
    v = clamp(parseFloat(v), parseFloat(n.min), parseFloat(n.max));
    if (Number.isNaN(v)) return;
    state[key] = v;
    if (from !== "s") s.value = clamp(v, parseFloat(s.min), parseFloat(s.max));
    if (from !== "n") n.value = v;
    if (after) after();
    redraw(true);
  };
  s.addEventListener("input", e => apply(e.target.value, "s"));
  n.addEventListener("input", e => apply(e.target.value, "n"));
  s.addEventListener("change", () => redraw(false));
  n.addEventListener("change", () => redraw(false));
}
function bindExportPair(id, key){
  const slider=$(id), number=$(id+"N");
  const apply=(value, from)=>{
    const next=clamp(parseFloat(value),parseFloat(number.min),parseFloat(number.max));
    if (Number.isNaN(next)) return;
    state[key]=next;
    if (from!=="s") slider.value=next;
    if (from!=="n") number.value=next;
    updateExportSize();
  };
  slider.addEventListener("input",event=>apply(event.target.value,"s"));
  number.addEventListener("input",event=>apply(event.target.value,"n"));
}
bindPair("az","az"); bindPair("el","el"); bindPair("rl","roll"); bindPair("zoom","zoom"); bindPair("panX","panX"); bindPair("panY","panY"); bindPair("lensAmount","lensAmount");
bindPair("lines","lines"); bindPair("easeStrength","easeStrength"); bindPair("easeCycles","easeCycles"); bindPair("easeCenter","easeCenter"); bindPair("quality","quality"); bindPair("sw","sw"); bindPair("margin","margin");
bindPair("chromaAmount","chromaAmount");
bindPair("humanizerAmount","humanizerAmount");
bindPair("halftoneSize","halftoneSize"); bindPair("halftoneContrast","halftoneContrast"); bindPair("halftoneCycles","halftoneCycles");
bindPair("gradientColors","gradientColors");
bindPair("cutAz","cutAz",activateCustomAxis); bindPair("cutEl","cutEl",activateCustomAxis);
bindPair("morphSteps","morphSteps");
bindPair("morphStepsY","morphStepsY");
bindExportPair("drawFeed","drawFeed"); bindExportPair("travelFeed","travelFeed"); bindExportPair("penUp","penUp"); bindExportPair("penDown","penDown"); bindExportPair("zFeed","zFeed");
morphKeyById.set("color","color");

function bindGenerativePair(id,key){
  const slider=$(id), number=$(id+"N");
  const apply=(value,from,final=false)=>{
    let next=clamp(parseFloat(value),parseFloat(number.min),parseFloat(number.max));
    if (Number.isNaN(next)) return;
    if (id==="genSeed" || id==="genRes") next=Math.round(next);
    state[key]=next;
    if (from!=="s") slider.value=next;
    if (from!=="n") number.value=next;
    queueGeneration(final ? 0 : 110);
  };
  slider.addEventListener("input",event=>apply(event.target.value,"s"));
  number.addEventListener("input",event=>apply(event.target.value,"n"));
  slider.addEventListener("change",event=>apply(event.target.value,"s",true));
  number.addEventListener("change",event=>apply(event.target.value,"n",true));
}
for (const key of generativeKeys) bindGenerativePair(key,key);
$("genField").addEventListener("change",event=>{
  state.genField=event.target.value;
  queueGeneration(0);
});

document.addEventListener("morphchange",event=>{
  const {id,dimension=1,active,value}=event.detail || {};
  const key=morphKeyById.get(id);
  if (!key) return;
  const targets=dimension===2 ? state.morphTargets2 : state.morphTargets;
  if (active && key==="color" && /^#[0-9a-f]{6}$/i.test(String(value))) targets[key]=String(value);
  else if (active && Number.isFinite(Number(value))) targets[key]=Number(value);
  else delete targets[key];
  redraw(false);
});
function syncMorphControls(){
  $("morphSettings").classList.toggle("is-disabled",!state.morphEnabled);
  $("morphSteps").disabled=!state.morphEnabled;
  $("morphStepsN").disabled=!state.morphEnabled;
  $("morphSecondEnabled").disabled=!state.morphEnabled;
  const secondActive=state.morphEnabled && state.morphSecondEnabled;
  $("morphSecondSettings").classList.toggle("is-disabled",!secondActive);
  $("morphStepsY").disabled=!secondActive;
  $("morphStepsYN").disabled=!secondActive;
}
$("morphEnabled").addEventListener("change",event=>{
  state.morphEnabled=event.target.checked;
  syncMorphControls();
  redraw(false);
});
$("morphSecondEnabled").addEventListener("change",event=>{
  state.morphSecondEnabled=event.target.checked;
  if (!state.morphSecondEnabled) state.morphTargets2={};
  document.dispatchEvent(new CustomEvent("morphseconddimension",{detail:{enabled:state.morphSecondEnabled}}));
  syncMorphControls();
  redraw(false);
});
syncMorphControls();

async function rebuildSVG(){
  if (!state.svgSource) return;
  const source=state.svgSource, name=state.svgSourceName;
  try{
    const raw=await globalThis.slicewiseParseSVG(source,state.svgDepth,state.svgRounded,state.svgRoundness);
    if (source!==state.svgSource) return;
    rawCache=raw;
    setMesh(rawCache,name);
  } catch(e){ showError(e.message); }
}
let svgRebuildTimer=0;
function bindSVGPair(id,key){
  const slider=$(id), number=$(id+"N");
  const apply=(value,from,final=false)=>{
    const next=clamp(parseFloat(value),parseFloat(number.min),parseFloat(number.max));
    if (Number.isNaN(next)) return;
    state[key]=next;
    if (from!=="s") slider.value=next;
    if (from!=="n") number.value=next;
    if (!state.svgSource) return;
    clearTimeout(svgRebuildTimer);
    if (final) rebuildSVG();
    else svgRebuildTimer=setTimeout(rebuildSVG,90);
  };
  slider.addEventListener("input",event=>apply(event.target.value,"s"));
  number.addEventListener("input",event=>apply(event.target.value,"n"));
  slider.addEventListener("change",event=>apply(event.target.value,"s",true));
  number.addEventListener("change",event=>apply(event.target.value,"n",true));
}
bindSVGPair("svgDepth","svgDepth");
bindSVGPair("svgRoundness","svgRoundness");
function syncSVGControls(){
  const active=Boolean(state.svgSource);
  $("svgExtrusion").hidden=!active;
  const roundnessActive=active && state.svgRounded;
  $("svgRoundness").disabled=!roundnessActive;
  $("svgRoundnessN").disabled=!roundnessActive;
  $("svgRoundnessControl").classList.toggle("is-disabled",!roundnessActive);
}
function syncSourceControls(){
  $("generativeControls").hidden=state.source!=="generative";
  syncSVGControls();
}
$("svgRounded").addEventListener("change",event=>{
  state.svgRounded=event.target.checked;
  syncSVGControls();
  rebuildSVG();
});

const gcodeProfiles={
  uunatek3:{drawFeed:3000,travelFeed:6000,penUp:0,penDown:-3,zFeed:2000,note:"UUNA TEK rear-left origin with 3 mm pen drop. Set the machine origin at the sheet’s rear-left corner before plotting."},
  generic:{drawFeed:1200,travelFeed:3000,penUp:5,penDown:0,zFeed:600,note:"Generic bottom-left origin. Confirm Z heights, speeds, and origin for your machine before plotting."}
};
function setExportPair(id,key,value){
  state[key]=value;
  $(id).value=value;
  $(id+"N").value=value;
}
$("gcodeProfile").addEventListener("change",event=>{
  state.gcodeProfile=event.target.value;
  const profile=gcodeProfiles[state.gcodeProfile];
  for (const key of ["drawFeed","travelFeed","penUp","penDown","zFeed"]) setExportPair(key,key,profile[key]);
  $("gcodeProfileNote").textContent=profile.note;
  updateExportSize();
});

$("exportFormat").addEventListener("change",event=>{
  state.exportFormat=event.target.value;
  const gcode=state.exportFormat==="gcode";
  $("gcodeControls").hidden=!gcode;
  $("exportLabel").textContent=gcode ? "Export G-code" : "Export SVG";
  $("copy").setAttribute("aria-label",gcode ? "Copy G-code" : "Copy SVG markup");
  updateExportSize();
});

$("axis").addEventListener("change", e => {
  state.axis = e.target.value;
  $("customAxis").hidden = state.axis !== "custom";
  redraw(false);
});
function syncLensAmount(){
  const enabled=state.lens !== "clean";
  $("lensAmount").disabled=!enabled;
  $("lensAmountN").disabled=!enabled;
  $("lensAmountControl").classList.toggle("is-disabled", !enabled);
}
$("lens").addEventListener("change", e => {
  state.lens=e.target.value;
  syncLensAmount();
  redraw(false);
});
function syncEaseCenter(){
  const enabled=state.gapEase.endsWith("-in-out") || state.gapEase.endsWith("-out-in");
  $("easeCenter").disabled=!enabled;
  $("easeCenterN").disabled=!enabled;
  $("easeCenterControl").classList.toggle("is-disabled", !enabled);
}
$("gapEase").addEventListener("change", e => { state.gapEase = e.target.value; syncEaseCenter(); redraw(false); });
$("spiral").addEventListener("change", e => { state.spiral = e.target.checked; redraw(false); });
$("hide").addEventListener("change", e => { state.hide = e.target.checked; redraw(false); });
$("sil").addEventListener("change", e => { state.sil = e.target.checked; redraw(false); });
$("bg").addEventListener("change", e => { state.bg = e.target.checked; redraw(false); });
function syncHalftoneControls(){
  for (const id of ["halftoneSize", "halftoneContrast", "halftoneCycles"]){
    $(id).disabled=!state.halftone;
    $(id+"N").disabled=!state.halftone;
    $(id+"Control").classList.toggle("is-disabled", !state.halftone);
  }
}
function syncChromaAmount(){
  $("chromaAmount").disabled=!state.chroma;
  $("chromaAmountN").disabled=!state.chroma;
  $("chromaAmountControl").classList.toggle("is-disabled", !state.chroma);
}
function syncHumanizerControls(){
  $("humanizerAmount").disabled=!state.humanizer;
  $("humanizerAmountN").disabled=!state.humanizer;
  $("humanizerAmountControl").classList.toggle("is-disabled", !state.humanizer);
}
function syncBlueprintControls(){
  $("blueprintStyle").disabled=!state.blueprint;
  $("blueprintStyleControl").classList.toggle("is-disabled", !state.blueprint);
}
function disableBlueprint(){
  if (!state.blueprint) return;
  state.blueprint=false;
  $("blueprint").checked=false;
  syncBlueprintControls();
}
$("halftone").addEventListener("change", e => {
  state.halftone=e.target.checked;
  if (state.halftone && state.chroma){ state.chroma=false; $("chroma").checked=false; }
  if (state.halftone) disableBlueprint();
  syncHalftoneControls();
  syncChromaAmount();
  redraw(false);
});
$("chroma").addEventListener("change", e => {
  state.chroma = e.target.checked;
  if (state.chroma && state.halftone){ state.halftone=false; $("halftone").checked=false; }
  if (state.chroma && state.gradientEnabled){
    state.gradientEnabled=false;
    $("gradientEnabled").checked=false;
    $("gradientEditor").classList.remove("enabled");
  }
  if (state.chroma) disableBlueprint();
  syncHalftoneControls();
  syncChromaAmount();
  redraw(false);
});
$("humanizer").addEventListener("change", e => {
  state.humanizer=e.target.checked;
  syncHumanizerControls();
  redraw(false);
});
$("gradientEnabled").addEventListener("change", e => {
  state.gradientEnabled=e.target.checked;
  $("gradientEditor").classList.toggle("enabled",state.gradientEnabled);
  if (state.gradientEnabled && state.chroma){ state.chroma=false; $("chroma").checked=false; }
  if (state.gradientEnabled) disableBlueprint();
  syncChromaAmount();
  redraw(false);
});
$("blueprint").addEventListener("change", e => {
  state.blueprint=e.target.checked;
  if (state.blueprint){
    state.halftone=false;
    state.chroma=false;
    state.gradientEnabled=false;
    $("halftone").checked=false;
    $("chroma").checked=false;
    $("gradientEnabled").checked=false;
    $("gradientEditor").classList.remove("enabled");
  }
  syncHalftoneControls();
  syncChromaAmount();
  syncBlueprintControls();
  redraw(false);
});
$("blueprintStyle").addEventListener("change", e => {
  state.blueprintStyle=e.target.value;
  redraw(false);
});
$("gradientEditor").addEventListener("gradientchange", e => {
  state.gradientStops=e.detail.stops;
  scheduleParameterHistory();
  if (state.gradientEnabled) redraw(true);
});
$("color").addEventListener("input", e => { setInk(e.target.value, true); $("colorHex").value = e.target.value; });
$("color").addEventListener("change", () => redraw(false));
$("colorHex").addEventListener("input", e => {
  const v = e.target.value.trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)){
    const full = v.length===4 ? "#"+v[1]+v[1]+v[2]+v[2]+v[3]+v[3] : v;
    $("color").value = full; setInk(v, true);
  }
});
$("colorHex").addEventListener("change", () => redraw(false));
function setInk(v, quick){ state.color = v; $("swatch").style.background = v; redraw(quick); }
$("backgroundColor").addEventListener("input", e => { setBackgroundColor(e.target.value, true); $("backgroundColorHex").value = e.target.value; });
$("backgroundColor").addEventListener("change", () => redraw(false));
$("backgroundColorHex").addEventListener("input", e => {
  const v = e.target.value.trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)){
    const full = v.length===4 ? "#"+v[1]+v[1]+v[2]+v[2]+v[3]+v[3] : v;
    $("backgroundColor").value = full; setBackgroundColor(full, true);
  }
});
$("backgroundColorHex").addEventListener("change", () => redraw(false));
function setBackgroundColor(v, quick){
  state.backgroundColor = v;
  $("backgroundSwatch").style.background = v;
  if (!state.blueprint) $("bed").style.background = v;
  redraw(quick);
}
function activateCustomAxis(){
  state.axis = "custom";
  $("axis").value = "custom";
  $("customAxis").hidden = false;
}
const paperSizes={
  a6:[105,148], a5:[148,210], a4:[210,297], a3:[297,420], a2:[420,594], a1:[594,841], a0:[841,1189],
  letter:[216,279], legal:[216,356], tabloid:[279,432]
};
function syncPaperPreset(){
  const match=Object.entries(paperSizes).find(([,size])=>size[0]===state.pw && size[1]===state.ph);
  $("paperPreset").value=match?.[0] || "custom";
}
$("paperPreset").addEventListener("change",e=>{
  const size=paperSizes[e.target.value];
  if (!size) return;
  [state.pw,state.ph]=size;
  $("pw").value=state.pw;
  $("ph").value=state.ph;
  redraw(false);
});
for (const id of ["pw","ph"]) $(id).addEventListener("input", e => {
  const v = clamp(parseFloat(e.target.value)||10, 10, 2000);
  state[id] = v;
  syncPaperPreset();
  redraw(true);
});
for (const id of ["pw","ph"]) $(id).addEventListener("change", () => redraw(false));
$("upZ").addEventListener("click", () => setUp(false));
$("upY").addEventListener("click", () => setUp(true));
function setUp(y){
  if (state.upY === y) return;
  state.upY = y;
  $("upZ").setAttribute("aria-pressed", String(!y));
  $("upY").setAttribute("aria-pressed", String(y));
  if (rawCache) setMesh(rawCache, state.name);
}

/* file input + drag and drop */
$("demo").addEventListener("change", e => e.target.value==="generative" ? loadGenerative() : loadDemo(e.target.value));
$("file").addEventListener("change", e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
const drop = $("drop");
["dragenter","dragover"].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add("over");
}));
["dragleave","drop"].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  if (ev === "dragleave" && e.relatedTarget) return;
  drop.classList.remove("over");
}));
document.addEventListener("drop", e => {
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) loadFile(f);
});

/* orbit by dragging the sheet */
(function orbit(){
  const bed = $("bed");
  let sx=0, sy=0, az0=0, el0=0, ro0=0, panX0=0, panY0=0, mode="orbit", id=null;
  let spaceDown = false;
  let wheelEnd = 0;
  const isEditable = target => target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName));
  const setSpaceDown = active => {
    spaceDown = active;
    bed.classList.toggle("space-pan", active && !state.dragging);
  };
  const syncPair = (id, value) => {
    $(id).value = value;
    $(id + "N").value = value;
  };
  document.addEventListener("keydown", e => {
    if (e.code !== "Space" || isEditable(e.target)) return;
    e.preventDefault();
    setSpaceDown(true);
  });
  document.addEventListener("keyup", e => {
    if (e.code !== "Space") return;
    setSpaceDown(false);
  });
  window.addEventListener("blur", () => setSpaceDown(false));
  bed.addEventListener("pointerdown", e => {
    id = e.pointerId; bed.setPointerCapture(id);
    sx = e.clientX; sy = e.clientY; az0 = state.az; el0 = state.el; ro0 = state.roll;
    panX0 = state.panX; panY0 = state.panY;
    mode = spaceDown ? "pan" : e.shiftKey ? "roll" : "orbit";
    state.dragging = true; bed.classList.remove("space-pan");
    bed.classList.add("dragging", `dragging-${mode}`);
  });
  bed.addEventListener("pointermove", e => {
    if (!state.dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (mode === "pan"){
      state.panX = clamp(Math.round((panX0 + dx * state.pw / bed.clientWidth)*10)/10, -2000, 2000);
      state.panY = clamp(Math.round((panY0 + dy * state.ph / bed.clientHeight)*10)/10, -2000, 2000);
      syncPair("panX", state.panX);
      syncPair("panY", state.panY);
    } else if (mode === "roll"){
      state.roll = clamp(Math.round(ro0 + dx*0.5), -180, 180);
      $("rl").value = state.roll; $("rlN").value = state.roll;
    } else {
      let a = az0 - dx*0.45;
      a = ((a + 180) % 360 + 360) % 360 - 180;
      state.az = Math.round(a);
      let e = el0 + dy*0.45;
      e = ((e + 180) % 360 + 360) % 360 - 180;
      state.el = Math.round(e);
      $("az").value = state.az; $("azN").value = state.az;
      $("el").value = state.el; $("elN").value = state.el;
    }
    redraw(true);
  });
  const end = () => {
    if (!state.dragging) return;
    state.dragging = false;
    bed.classList.remove("dragging", "dragging-pan", "dragging-roll", "dragging-orbit");
    bed.classList.toggle("space-pan", spaceDown);
    redraw(false);
  };
  bed.addEventListener("pointerup", end);
  bed.addEventListener("pointercancel", end);
  bed.addEventListener("dblclick", e => {
    e.preventDefault();
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    syncPair("zoom", state.zoom);
    syncPair("panX", state.panX);
    syncPair("panY", state.panY);
    redraw(false);
  });
  bed.addEventListener("wheel", e => {
    e.preventDefault();
    const z = clamp(state.zoom * (e.deltaY > 0 ? 0.94 : 1.06), 0.2, 3);
    state.zoom = Math.round(z*100)/100;
    $("zoom").value = state.zoom; $("zoomN").value = state.zoom;
    redraw(true);
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => redraw(false), 140);
  }, {passive:false});
})();

/* ------------------------------------------------ parameter history */
const historyPairs=[
  ["az","az"],["el","el"],["rl","roll"],["zoom","zoom"],["panX","panX"],["panY","panY"],["lensAmount","lensAmount"],
  ["lines","lines"],["quality","quality"],["easeStrength","easeStrength"],["easeCycles","easeCycles"],["easeCenter","easeCenter"],
  ["cutAz","cutAz"],["cutEl","cutEl"],["sw","sw"],["gradientColors","gradientColors"],["margin","margin"],
  ["halftoneSize","halftoneSize"],["halftoneContrast","halftoneContrast"],["halftoneCycles","halftoneCycles"],["chromaAmount","chromaAmount"],["humanizerAmount","humanizerAmount"],
  ["morphSteps","morphSteps"],["morphStepsY","morphStepsY"]
];
const historySelects=["lens","gapEase","axis","blueprintStyle"];
const historyChecks=["spiral","hide","sil","bg","gradientEnabled","halftone","chroma","humanizer","blueprint","morphEnabled","morphSecondEnabled"];
const parameterHistory=[];
let parameterHistoryIndex=-1, parameterHistoryTimer=0, restoringParameters=false;
function cloneParameterSnapshot(){ return structuredClone(settingsSnapshot()); }
function sameParameterSnapshot(a,b){ return JSON.stringify(a)===JSON.stringify(b); }
function updateHistoryButtons(){
  $("undo").disabled=parameterHistoryIndex<=0;
  $("redo").disabled=parameterHistoryIndex<0 || parameterHistoryIndex>=parameterHistory.length-1;
}
function commitParameterHistory(){
  clearTimeout(parameterHistoryTimer);
  if (restoringParameters) return;
  const snapshot=cloneParameterSnapshot();
  if (parameterHistoryIndex>=0 && sameParameterSnapshot(parameterHistory[parameterHistoryIndex],snapshot)) return;
  parameterHistory.splice(parameterHistoryIndex+1);
  parameterHistory.push(snapshot);
  if (parameterHistory.length>100) parameterHistory.shift();
  parameterHistoryIndex=parameterHistory.length-1;
  updateHistoryButtons();
}
function scheduleParameterHistory(){
  if (restoringParameters) return;
  clearTimeout(parameterHistoryTimer);
  parameterHistoryTimer=setTimeout(commitParameterHistory,180);
}
function restoreParameterSnapshot(snapshot){
  restoringParameters=true;
  clearTimeout(parameterHistoryTimer);
  Object.assign(state,structuredClone(snapshot));
  for (const [id,key] of historyPairs){
    if ($(id)) $(id).value=state[key];
    if ($(id+"N")) $(id+"N").value=state[key];
  }
  for (const id of historySelects) $(id).value=state[id];
  for (const id of historyChecks) $(id).checked=state[id];
  $("color").value=state.color;
  $("colorHex").value=state.color;
  $("swatch").style.background=state.color;
  $("backgroundColor").value=state.backgroundColor;
  $("backgroundColorHex").value=state.backgroundColor;
  $("backgroundSwatch").style.background=state.backgroundColor;
  $("bed").style.background=state.blueprint ? (state.blueprintStyle==="black" ? "#101417" : "#0b3f7a") : state.backgroundColor;
  $("pw").value=state.pw;
  $("ph").value=state.ph;
  syncPaperPreset();
  $("customAxis").hidden=state.axis!=="custom";
  $("gradientEditor").classList.toggle("enabled",state.gradientEnabled);
  syncLensAmount();
  syncEaseCenter();
  syncHalftoneControls();
  syncChromaAmount();
  syncHumanizerControls();
  syncBlueprintControls();
  syncMorphControls();
  const morphTargetsById={}, morphTargets2ById={};
  for (const [id,key] of morphKeyById){
    if (Object.hasOwn(state.morphTargets,key)) morphTargetsById[id]=state.morphTargets[key];
    if (Object.hasOwn(state.morphTargets2,key)) morphTargets2ById[id]=state.morphTargets2[key];
  }
  document.dispatchEvent(new CustomEvent("restoreparameters",{detail:{morphTargetsById,morphTargets2ById,gradientStops:state.gradientStops}}));
  redraw(false);
  restoringParameters=false;
  updateHistoryButtons();
}
function moveParameterHistory(offset){
  commitParameterHistory();
  const next=clamp(parameterHistoryIndex+offset,0,parameterHistory.length-1);
  if (next===parameterHistoryIndex) return;
  parameterHistoryIndex=next;
  restoreParameterSnapshot(parameterHistory[parameterHistoryIndex]);
  toast(offset<0 ? "Parameters undone" : "Parameters redone");
}
$("undo").addEventListener("click",()=>moveParameterHistory(-1));
$("redo").addEventListener("click",()=>moveParameterHistory(1));
document.addEventListener("keydown",event=>{
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key=event.key.toLowerCase();
  const undo=key==="z" && !event.shiftKey;
  const redo=(key==="z" && event.shiftKey) || (key==="y" && !event.shiftKey);
  if (!undo && !redo) return;
  event.preventDefault();
  moveParameterHistory(undo ? -1 : 1);
});

/* ------------------------------------------------------ randomization */
function randomIn(min, max){ return min + Math.random()*(max-min); }
function randomInt(min, max){ return Math.floor(randomIn(min, max+1)); }
function randomItem(items){ return items[Math.floor(Math.random()*items.length)]; }
function normalizePairValue(id,value){
  const number=$(id+"N");
  const step=parseFloat(number.step) || 1;
  const precision=(String(number.step).split(".")[1] || "").length;
  return Number((Math.round(value/step)*step).toFixed(precision));
}
function setPairValue(id, key, value){
  const slider=$(id), number=$(id+"N");
  const next=normalizePairValue(id,value);
  state[key]=next;
  slider.value=next;
  number.value=next;
  return next;
}
function setCheckbox(id, key, value){
  state[key]=value;
  $(id).checked=value;
}
const randomLocks=new Set();
document.addEventListener("randomlockchange",event=>{
  const {id,locked}=event.detail || {};
  if (!id) return;
  if (locked) randomLocks.add(id);
  else randomLocks.delete(id);
});
function randomizePair(id,key,makeValue){
  if (randomLocks.has(id)) return;
  setPairValue(id,key,makeValue());
  for (const [dimension,targets] of [[1,state.morphTargets],[2,state.morphTargets2]]){
    if (!Object.hasOwn(targets,key)) continue;
    const target=normalizePairValue(id,makeValue());
    targets[key]=target;
    document.dispatchEvent(new CustomEvent("randomizemorph",{detail:{id,dimension,value:target}}));
  }
}
function randomizeColor(id,key,colors){
  if (randomLocks.has(id)) return;
  const value=randomItem(colors);
  state[key]=value;
  $(id).value=value;
  $(id+"Hex").value=value;
  $(id==="color" ? "swatch" : "backgroundSwatch").style.background=value;
  if (key==="backgroundColor") $("bed").style.background=value;
  for (const [dimension,targets] of [[1,state.morphTargets],[2,state.morphTargets2]]){
    if (!Object.hasOwn(targets,key)) continue;
    const target=randomItem(colors);
    targets[key]=target;
    document.dispatchEvent(new CustomEvent("randomizemorph",{detail:{id,dimension,value:target}}));
  }
}
function randomizeSelect(id,key,values){
  if (randomLocks.has(id)) return;
  state[key]=randomItem(values);
  $(id).value=state[key];
}
function randomizeCheckbox(id,key,probability){
  if (!randomLocks.has(id)) setCheckbox(id,key,Math.random()<probability);
}

$("randomize").addEventListener("click", () => {
  // Keep the loaded source and physical sheet size stable; randomize the
  // creative choices that shape the contour study.
  randomizePair("az", "az", ()=>randomInt(-180, 180));
  randomizePair("el", "el", ()=>randomInt(-70, 70));
  randomizePair("rl", "roll", ()=>randomInt(-35, 35));
  randomizePair("zoom", "zoom", ()=>randomIn(.72, 1.28));
  randomizePair("panX", "panX", ()=>randomIn(-state.pw*.15, state.pw*.15));
  randomizePair("panY", "panY", ()=>randomIn(-state.ph*.15, state.ph*.15));

  randomizeSelect("lens","lens",["clean", "clean", "wide", "fisheye", "tele"]);
  randomizePair("lensAmount", "lensAmount", ()=>randomInt(45, 145));
  syncLensAmount();

  randomizePair("lines", "lines", ()=>randomInt(22, 84));
  randomizePair("quality", "quality", ()=>randomInt(5, 9));
  randomizeSelect("gapEase","gapEase",[
    "linear", "sine-in", "sine-out", "sine-in-out", "sine-out-in",
    "ease-in", "ease-out", "ease-in-out", "ease-out-in",
    "cubic-in", "cubic-out", "cubic-in-out", "cubic-out-in"
  ]);
  randomizePair("easeStrength", "easeStrength", ()=>randomInt(55, 185));
  randomizePair("easeCycles", "easeCycles", ()=>randomItem([1, 1, 1, 2, 2, 3]));
  randomizePair("easeCenter", "easeCenter", ()=>randomInt(25, 75));
  syncEaseCenter();

  randomizeSelect("axis","axis",["up", "up", "cam", "x", "y", "custom"]);
  $("customAxis").hidden=state.axis !== "custom";
  randomizePair("cutAz", "cutAz", ()=>randomInt(-180, 180));
  randomizePair("cutEl", "cutEl", ()=>randomInt(-80, 80));
  randomizeCheckbox("spiral", "spiral", .22);
  randomizeCheckbox("hide", "hide", .82);
  randomizeCheckbox("sil", "sil", .78);

  randomizePair("sw", "sw", ()=>randomIn(.15, .7));
  randomizePair("margin", "margin", ()=>randomInt(8, 24));
  const colorPair = createColorPair();
  const reverseColors = Math.random() < 0.5;
  const useBlackAndWhite = Math.random() < 0.1;
  const inks=[useBlackAndWhite ? '#000000' : reverseColors ? colorPair.b.hex : colorPair.a.hex];
  const papers=[useBlackAndWhite ? '#ffffff' : reverseColors ? colorPair.a.hex : colorPair.b.hex];
  randomizeColor("color","color",inks);
  randomizeColor("backgroundColor","backgroundColor",papers);

  const modes=[
    {name:"ink",gradientEnabled:false,halftone:false,chroma:false,humanizer:false},
    {name:"ink",gradientEnabled:false,halftone:false,chroma:false,humanizer:false},
    {name:"gradient",gradientEnabled:true,halftone:false,chroma:false,humanizer:false},
    {name:"halftone",gradientEnabled:false,halftone:true,chroma:false,humanizer:false},
    {name:"chroma",gradientEnabled:false,halftone:false,chroma:true,humanizer:false},
    {name:"humanizer",gradientEnabled:false,halftone:false,chroma:false,humanizer:true},
    {name:"blueprint",gradientEnabled:false,halftone:false,chroma:false,humanizer:false,blueprint:true}
  ];
  for (const mode of modes) mode.blueprint=Boolean(mode.blueprint);
  const availableModes=modes.filter(mode=>["gradientEnabled","halftone","chroma","humanizer","blueprint"].every(id=>!randomLocks.has(id) || mode[id]===state[id]));
  const colourMode=randomItem(availableModes.length ? availableModes : modes);
  for (const id of ["gradientEnabled","halftone","chroma","humanizer","blueprint"]){
    if (!randomLocks.has(id)) state[id]=colourMode[id];
  }
  $("gradientEnabled").checked=state.gradientEnabled;
  $("gradientEditor").classList.toggle("enabled", state.gradientEnabled);
  randomizePair("gradientColors", "gradientColors", ()=>randomInt(3, 10));
  $("halftone").checked=state.halftone;
  randomizePair("halftoneSize", "halftoneSize", ()=>randomIn(1.2, 4.8));
  randomizePair("halftoneContrast", "halftoneContrast", ()=>randomInt(55, 100));
  randomizePair("halftoneCycles", "halftoneCycles", ()=>randomInt(1, 5));
  syncHalftoneControls();
  $("chroma").checked=state.chroma;
  randomizePair("chromaAmount", "chromaAmount", ()=>randomIn(.6, 3.2));
  syncChromaAmount();
  $("humanizer").checked=state.humanizer;
  randomizePair("humanizerAmount", "humanizerAmount", ()=>randomInt(18, 58));
  syncHumanizerControls();
  $("blueprint").checked=state.blueprint;
  if (!randomLocks.has("blueprint")){
    state.blueprintStyle=randomItem(["blue","blue","blue","black"]);
    $("blueprintStyle").value=state.blueprintStyle;
  }
  syncBlueprintControls();

  redraw(false);
  toast("Parameters randomized");
});

/* export */
function currentGCode(){
  return generateGCode(state.toolpaths,{width:state.pw,height:state.ph},{
    name:state.name,
    drawFeed:state.drawFeed,
    travelFeed:state.travelFeed,
    penUp:state.penUp,
    penDown:state.penDown,
    zFeed:state.zFeed,
    machine:state.gcodeProfile==="uunatek3" ? "UUNA TEK 3.0 A3" : "Generic Z-axis plotter",
    origin:state.gcodeProfile==="uunatek3" ? "rear-left" : "bottom-left",
    effects:{halftone:state.halftone,chroma:state.chroma,humanizer:state.humanizer,blueprint:state.blueprint}
  });
}
function currentExport(){
  if (state.exportFormat==="gcode") return {content:currentGCode(),extension:"gcode",type:"text/x-gcode"};
  return {content:state.svg,extension:"svg",type:"image/svg+xml"};
}
function updateExportSize(){
  if (!state.svg) return;
  const bytes=state.exportFormat==="gcode" ? new TextEncoder().encode(currentGCode()).byteLength : state.svgBytes;
  $("rSize").textContent=(bytes/1024).toFixed(1)+" kB";
}
$("save").addEventListener("click", async () => {
  try{
    await waitForCurrentRender();
    const exported=currentExport();
    if (!exported.content) return;
    const base = state.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g,"-").replace(/^-|-$/g,"") || "contours";
    const blob = new Blob([exported.content], {type:exported.type});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = base + "-contours." + exported.extension;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Saved " + a.download);
  } catch(error){ toast(error.message); }
});
$("copy").addEventListener("click", async () => {
  try{
    await waitForCurrentRender();
    const exported=currentExport();
    await navigator.clipboard.writeText(exported.content);
    toast(exported.extension==="svg" ? "SVG markup copied" : "G-code copied");
  } catch(error){
    if (failedRequestId===requestId) toast(error.message);
    else toast("Copy blocked — use Export " + (state.exportFormat==="svg" ? "SVG" : "G-code"));
  }
});
let toastT;
function toast(msg){
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 1900);
}

/* boot with the demo knot so the tool works before anything is uploaded */
commitParameterHistory();
loadDemo("knot", false);
window.addEventListener("resize", () => redraw(true));
}
