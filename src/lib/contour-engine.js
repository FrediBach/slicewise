"use strict";

/* ---------------------------------------------------------------- utils */
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const fmt = n => {
  const r = Math.round(n*100)/100;
  return Number.isInteger(r) ? String(r) : String(r);
};
const escapeXml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;"
})[character]);

function applyLineGapEase(t, easing, center){
  const left=t/center, right=(t-center)/(1-center);
  switch (easing){
    case "sine-in": return 1-Math.cos(t*Math.PI/2);
    case "sine-out": return Math.sin(t*Math.PI/2);
    case "sine-in-out": return t<center ? center*(1-Math.cos(left*Math.PI/2)) : center+(1-center)*Math.sin(right*Math.PI/2);
    case "sine-out-in": return t<center ? center*Math.sin(left*Math.PI/2) : center+(1-center)*(1-Math.cos(right*Math.PI/2));
    case "ease-in": return t*t;
    case "ease-out": return 1-(1-t)*(1-t);
    case "ease-in-out": return t<center ? center*left*left : center+(1-center)*(1-Math.pow(1-right, 2));
    case "ease-out-in": return t<center ? center*(1-Math.pow(1-left, 2)) : center+(1-center)*right*right;
    case "cubic-in": return t*t*t;
    case "cubic-out": return 1-Math.pow(1-t, 3);
    case "cubic-in-out": return t<center ? center*left*left*left : center+(1-center)*(1-Math.pow(1-right, 3));
    case "cubic-out-in": return t<center ? center*(1-Math.pow(1-left, 3)) : center+(1-center)*right*right*right;
    default: return t;
  }
}

function easeLineGap(t, easing, strength=100, center=50, cycles=1){
  const cycleCount=clamp(Math.round(cycles), 1, 12);
  const scaled=t*cycleCount;
  const cycle=Math.min(cycleCount-1, Math.floor(scaled));
  const local=scaled-cycle;
  const applications=clamp(strength/100, 0, 3);
  const pivot=clamp(center/100, .05, .95);
  const whole=Math.floor(applications), mix=applications-whole;
  let eased=local;
  for (let i=0;i<whole;i++) eased=applyLineGapEase(eased, easing, pivot);
  if (mix){
    const next=applyLineGapEase(eased, easing, pivot);
    eased+= (next-eased)*mix;
  }
  return (cycle+eased)/cycleCount;
}

/* --------------------------------------------------------- projection */
function cameraBasis(azDeg, elDeg, rollDeg){
  const az = azDeg*Math.PI/180, el = elDeg*Math.PI/180, ro = rollDeg*Math.PI/180;
  // camera sits on the unit sphere, looks at the origin. Z is up.
  const c = [Math.cos(el)*Math.cos(az), Math.cos(el)*Math.sin(az), Math.sin(el)];
  const f = [-c[0], -c[1], -c[2]];                 // view direction
  // An analytical horizontal axis stays defined at the poles and remains
  // continuous as elevation travels through a full rotation.
  let r = [-Math.sin(az), Math.cos(az), 0];
  let u = [r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]];
  if (ro){
    const cr = Math.cos(ro), sr = Math.sin(ro);
    const r2 = [r[0]*cr+u[0]*sr, r[1]*cr+u[1]*sr, r[2]*cr+u[2]*sr];
    const u2 = [u[0]*cr-r[0]*sr, u[1]*cr-r[1]*sr, u[2]*cr-r[2]*sr];
    r = r2; u = u2;
  }
  return {f, r, u};
}

const LENS_CURVE = {
  clean: 0,
  wide: -0.18,
  fisheye: -0.4,
  tele: 0.16
};

function distortLens(x, y, lens, amount){
  const curve = (LENS_CURVE[lens] || 0) * clamp(amount/100, 0, 2);
  if (!curve) return [x, y];
  const radius2 = x*x + y*y;
  // Radial optical distortion around the image centre. Keeping this in camera
  // space makes the effect independent of sheet size, margin, and output scale.
  // The rational barrel curve stays smooth and monotonic at the 200% maximum.
  const factor = curve < 0 ? 1/(1-curve*radius2) : 1+curve*radius2;
  return [x*factor, y*factor];
}

function projectCameraPoint(x, y, scale, ox, oy, lens, lensAmount){
  const warped = distortLens(x, y, lens, lensAmount);
  return [ox + warped[0]*scale, oy - warped[1]*scale];
}

/* ------------------------------------------------- marching triangles */
function sliceLevel(P, mesh, S, level, NV, scalarDir, curveStrength){
  // returns {pts:[x,y,d,...], segs:[i,j,...]} for one cutting plane
  const {T, V, N} = mesh;
  const idx = new Map();          // edge key -> point index
  const pts = [], segs = [];
  const {r, u, f, scale, ox, oy, lens, lensAmount} = P;
  const getPoint = (a, b) => {
    const key = a < b ? a*NV + b : b*NV + a;
    let id = idx.get(key);
    if (id !== undefined) return id;
    let t = (level - S[a]) / (S[b] - S[a]);
    id = pts.length/3;
    if (!curveStrength || !N){
      const ai=a*3, bi=b*3;
      const x=V[ai]+(V[bi]-V[ai])*t;
      const y=V[ai+1]+(V[bi+1]-V[ai+1])*t;
      const z=V[ai+2]+(V[bi+2]-V[ai+2])*t;
      const screen=projectCameraPoint(
        x*r[0]+y*r[1]+z*r[2],
        x*u[0]+y*u[1]+z*u[2],
        scale, ox, oy, lens, lensAmount
      );
      pts.push(screen[0], screen[1], x*f[0]+y*f[1]+z*f[2]);
      idx.set(key, id);
      return id;
    }

    const ai=a*3, bi=b*3;
    const ax=V[ai], ay=V[ai+1], az=V[ai+2];
    const bx=V[bi], by=V[bi+1], bz=V[bi+2];
    const ex=bx-ax, ey=by-ay, ez=bz-az;
    const da=ex*N[ai]+ey*N[ai+1]+ez*N[ai+2];
    const db=ex*N[bi]+ey*N[bi+1]+ez*N[bi+2];
    const tax=ex-N[ai]*da, tay=ey-N[ai+1]*da, taz=ez-N[ai+2]*da;
    const tbx=ex-N[bi]*db, tby=ey-N[bi+1]*db, tbz=ez-N[bi+2]*db;
    const sample = (q) => {
      const q2=q*q, q3=q2*q;
      const h00=2*q3-3*q2+1, h10=q3-2*q2+q;
      const h01=-2*q3+3*q2, h11=q3-q2;
      const lx=ax+ex*q, ly=ay+ey*q, lz=az+ez*q;
      const hx=h00*ax+h10*tax+h01*bx+h11*tbx;
      const hy=h00*ay+h10*tay+h01*by+h11*tby;
      const hz=h00*az+h10*taz+h01*bz+h11*tbz;
      return [lx+(hx-lx)*curveStrength, ly+(hy-ly)*curveStrength, lz+(hz-lz)*curveStrength];
    };
    let lo=0, hi=1;
    const startAbove = S[a] > level;
    for (let k=0;k<12;k++){
      t=(lo+hi)*.5;
      const p=sample(t);
      const value=p[0]*scalarDir[0]+p[1]*scalarDir[1]+p[2]*scalarDir[2];
      if ((value > level) === startAbove) lo=t; else hi=t;
    }
    const p=sample((lo+hi)*.5);
    const screen=projectCameraPoint(
      p[0]*r[0]+p[1]*r[1]+p[2]*r[2],
      p[0]*u[0]+p[1]*u[1]+p[2]*u[2],
      scale, ox, oy, lens, lensAmount
    );
    pts.push(screen[0], screen[1], p[0]*f[0]+p[1]*f[1]+p[2]*f[2]);
    idx.set(key, id);
    return id;
  };
  for (let i=0;i<T.length;i+=3){
    const a=T[i], b=T[i+1], c=T[i+2];
    const sa=S[a]-level, sb=S[b]-level, sc=S[c]-level;
    const pa = sa>0, pb = sb>0, pc = sc>0;
    if (pa === pb && pb === pc) continue;                 // no crossing
    let e1, e2;
    if (pa === pb){ e1 = getPoint(a,c); e2 = getPoint(b,c); }
    else if (pb === pc){ e1 = getPoint(b,a); e2 = getPoint(c,a); }
    else { e1 = getPoint(a,b); e2 = getPoint(c,b); }
    if (e1 !== e2) segs.push(e1, e2);
  }
  return {pts, segs};
}

/* ------------------------------------------- chain segments into runs */
function chain(pts, segs){
  const n = pts.length/3;
  const head = new Int32Array(n).fill(-1);
  const nextRef = new Int32Array(segs.length).fill(-1);
  for (let s=0;s<segs.length;s++){          // adjacency: linked list per node
    const v = segs[s];
    nextRef[s] = head[v]; head[v] = s;
  }
  const used = new Uint8Array(segs.length/2);
  const deg = new Uint8Array(n);
  for (const v of segs) if (deg[v] < 255) deg[v]++;

  const polys = [];
  const walk = (start) => {
    const line = [start];
    let cur = start;
    for(;;){
      let picked = -1, other = -1;
      for (let s = head[cur]; s !== -1; s = nextRef[s]){
        const si = s >> 1;
        if (used[si]) continue;
        picked = si; other = segs[s ^ 1]; break;
      }
      if (picked === -1) break;
      used[picked] = 1;
      line.push(other);
      cur = other;
      if (cur === start) break;                 // closed loop
    }
    if (line.length > 1) polys.push(line);
  };
  for (let v=0; v<n; v++) if (deg[v] === 1) walk(v);      // open runs first
  for (let s=0; s<segs.length; s+=2) if (!used[s>>1]) walk(segs[s]);  // then loops
  return polys;
}

/* ------------------------------------------------------- depth buffer */
function buildDepth(P, T, W, H, res){
  const rw = Math.max(32, Math.round(res * (W>=H ? 1 : W/H)));
  const rh = Math.max(32, Math.round(res * (H>=W ? 1 : H/W)));
  const k = rw / W;
  const buf = new Float32Array(rw*rh).fill(Infinity);
  const {sx, sy, sd} = P;
  for (let i=0;i<T.length;i+=3){
    const a=T[i], b=T[i+1], c=T[i+2];
    const x0=sx[a]*k, y0=sy[a]*k, x1=sx[b]*k, y1=sy[b]*k, x2=sx[c]*k, y2=sy[c]*k;
    const area = (x1-x0)*(y2-y0) - (x2-x0)*(y1-y0);
    if (area === 0 || !isFinite(area)) continue;
    const inv = 1/area;
    let lo = Math.max(0, Math.floor(Math.min(x0,x1,x2)));
    let hi = Math.min(rw-1, Math.ceil(Math.max(x0,x1,x2)));
    let to = Math.max(0, Math.floor(Math.min(y0,y1,y2)));
    let bo = Math.min(rh-1, Math.ceil(Math.max(y0,y1,y2)));
    if (lo>hi || to>bo) continue;
    const d0=sd[a], d1=sd[b], d2=sd[c];
    for (let y=to; y<=bo; y++){
      const py = y+0.5, row = y*rw;
      for (let x=lo; x<=hi; x++){
        const px = x+0.5;
        const w2 = ((x1-x0)*(py-y0) - (px-x0)*(y1-y0))*inv;
        const w0 = ((x2-x1)*(py-y1) - (px-x1)*(y2-y1))*inv;
        const w1 = 1 - w0 - w2;
        if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue;
        const d = w0*d0 + w1*d1 + w2*d2;
        const o = row + x;
        if (d < buf[o]) buf[o] = d;
      }
    }
  }
  return {buf, rw, rh, k};
}
function makeVisibleTest(D, bias, rad){
  const {buf, rw, rh, k} = D;
  const R = rad || 1;
  return (x, y, d) => {
    const px = Math.floor(x*k), py = Math.floor(y*k);
    if (px < 0 || py < 0 || px >= rw || py >= rh) return true;
    let best = -Infinity;          // most permissive depth found nearby
    for (let j=-R;j<=R;j++){
      const yy = py+j; if (yy<0||yy>=rh) continue;
      for (let i=-R;i<=R;i++){
        const xx = px+i; if (xx<0||xx>=rw) continue;
        const v = buf[yy*rw+xx];
        if (v !== Infinity && v > best) best = v;
      }
    }
    if (best === -Infinity) return true;
    return d <= best + bias;
  };
}

/* ------------------------------------------- polyline → visible paths */
function emitPath(poly, pts, visible, step, out){
  // Walk a chained polyline and keep only the stretches the camera can see.
  // Visibility is sampled at roughly one sample per depth-buffer pixel, but only
  // the interval breaks become nodes — sampling density never inflates the file.
  let run = null, openEnd = false;   // openEnd: run currently ends at this segment's start
  const flush = () => { if (run && run.length >= 4) out.push(run); run = null; openEnd = false; };

  for (let i=0;i+1<poly.length;i++){
    const a = poly[i]*3, b = poly[i+1]*3;
    const ax=pts[a], ay=pts[a+1], ad=pts[a+2];
    const bx=pts[b], by=pts[b+1], bd=pts[b+2];
    if (!isFinite(ax) || !isFinite(bx)) { flush(); continue; }

    if (!visible){
      if (!run){ run = [ax, ay]; }
      run.push(bx, by);
      openEnd = true;
      continue;
    }

    const len = Math.hypot(bx-ax, by-ay);
    const n = Math.min(400, Math.max(1, Math.ceil(len/step)));
    let s = 0;
    while (s < n){
      // find the start of the next visible stretch
      while (s < n){
        const t = (s+0.5)/n;
        if (visible(ax+(bx-ax)*t, ay+(by-ay)*t, ad+(bd-ad)*t)) break;
        s++;
      }
      // A completely hidden segment breaks continuity. Keeping the previous
      // run open would make a later visible segment bridge this gap with one
      // long, view-dependent straight line.
      if (s >= n){ flush(); break; }
      let e = s;
      while (e < n){
        const t = (e+0.5)/n;
        if (!visible(ax+(bx-ax)*t, ay+(by-ay)*t, ad+(bd-ad)*t)) break;
        e++;
      }
      const t0 = s/n, t1 = e/n;
      const x0=ax+(bx-ax)*t0, y0=ay+(by-ay)*t0;
      const x1=ax+(bx-ax)*t1, y1=ay+(by-ay)*t1;
      if (t0 === 0 && run && openEnd) run.push(x1, y1);
      else { flush(); run = [x0, y0, x1, y1]; }
      openEnd = (t1 === 1);
      if (!openEnd) flush();
      s = e + 1;
    }
    if (!openEnd) flush();
  }
  flush();
}

function splitPolylineByBands(poly, pts, values, bandCount){
  const chunks=[];
  let current=null;
  const pointAt=(a,b,t)=>[
    pts[a*3]+(pts[b*3]-pts[a*3])*t,
    pts[a*3+1]+(pts[b*3+1]-pts[a*3+1])*t,
    pts[a*3+2]+(pts[b*3+2]-pts[a*3+2])*t
  ];
  const finish=()=>{ if (current && current.pts.length>=6) chunks.push(current); current=null; };
  for (let i=0;i+1<poly.length;i++){
    const a=poly[i], b=poly[i+1], va=clamp(values[a],0,1), vb=clamp(values[b],0,1);
    const cuts=[0,1];
    if (Math.abs(vb-va)>1e-9){
      for (let k=1;k<bandCount;k++){
        const t=(k/bandCount-va)/(vb-va);
        if (t>1e-7 && t<1-1e-7) cuts.push(t);
      }
    }
    cuts.sort((x,y)=>x-y);
    for (let c=0;c+1<cuts.length;c++){
      const t0=cuts[c], t1=cuts[c+1];
      const middle=va+(vb-va)*(t0+t1)/2;
      const band=clamp(Math.floor(middle*bandCount),0,bandCount-1);
      const p0=pointAt(a,b,t0), p1=pointAt(a,b,t1);
      if (!current || current.band!==band){ finish(); current={band,pts:[...p0,...p1]}; }
      else current.pts.push(...p1);
    }
  }
  finish();
  return chunks;
}

function gradientPalette(settings){
  if (settings.blueprint) return ["#f5f9ff"];
  if (!settings.gradientEnabled) return [settings.color];
  const stops=(settings.gradientStops || []).slice().sort((a,b)=>a.position-b.position);
  if (stops.length<2) return [settings.color];
  const count=clamp(Math.round(settings.gradientColors),2,24);
  const rgb=hex=>{
    const value=parseInt(hex.slice(1),16);
    return [(value>>16)&255,(value>>8)&255,value&255];
  };
  const hex=channels=>"#"+channels.map(v=>Math.round(v).toString(16).padStart(2,"0")).join("");
  return Array.from({length:count},(_,i)=>{
    const t=i/(count-1);
    let right=stops.findIndex(stop=>stop.position>=t);
    if (right<0) right=stops.length-1;
    const b=stops[right], a=stops[Math.max(0,right-1)];
    const mix=a===b ? 0 : clamp((t-a.position)/(b.position-a.position || 1),0,1);
    const ca=rgb(a.color), cb=rgb(b.color);
    return hex(ca.map((value,j)=>value+(cb[j]-value)*mix));
  });
}

function deterministicDrawingNumber(settings,geometry){
  const orderedTargets=targets=>Object.fromEntries(Object.entries(targets || {}).sort(([a],[b])=>a.localeCompare(b)));
  const signature=JSON.stringify({
    object:settings.documentTitle,
    sheet:[settings.pw,settings.ph,settings.margin],
    camera:[settings.az,settings.el,settings.roll,settings.zoom,settings.panX,settings.panY,settings.lens,settings.lensAmount],
    contours:[settings.lines,settings.gapEase,settings.easeStrength,settings.easeCycles,settings.easeCenter,settings.quality,settings.axis,settings.cutAz,settings.cutEl,settings.spiral,settings.hide,settings.sil],
    geometry:[geometry.fieldMin,geometry.fieldMax,geometry.direction,geometry.vertices,geometry.triangles],
    output:[settings.sw,settings.humanizer,settings.humanizerAmount,settings.blueprintStyle],
    morph:[settings.morphEnabled,settings.morphSteps,orderedTargets(settings.morphTargets),settings.morphSecondEnabled,settings.morphStepsY,orderedTargets(settings.morphTargets2)]
  });
  let hash=0x811c9dc5;
  for (let i=0;i<signature.length;i++){
    hash^=signature.charCodeAt(i);
    hash=Math.imul(hash,0x01000193);
  }
  return `SW-${(hash>>>0).toString(36).toUpperCase().padStart(7,"0")}`;
}

function blueprintDocument(settings,W,H,geometry={}){
  if (!settings.blueprint) return {backdrop:"",overlay:""};
  const black=settings.blueprintStyle==="black";
  const paper=black ? "#101417" : "#0b3f7a";
  const ink="#f5f9ff";
  const faint=black ? "#637079" : "#72a4d5";
  const min=Math.min(W,H);
  const edge=clamp(min*.035,2,9);
  const inset=edge+clamp(min*.018,1.2,4);
  const font=clamp(min*.018,1.35,3.1);
  const tiny=font*.72;
  const dimensionLabelOffset=Math.max(tiny*1.15,edge*.75);
  const grid=clamp(min/28,2.5,10);
  const titleW=clamp(W*.34,Math.min(32,W*.46),72);
  const titleH=clamp(H*.12,Math.min(12,H*.2),25);
  const tx=W-inset-titleW, ty=H-inset-titleH;
  const cx=W/2, cy=H/2;
  const name=escapeXml(String(settings.documentTitle || "UNTITLED CONTOUR STUDY").toUpperCase().slice(0,38));
  const axis=escapeXml(String(settings.axis || "up").toUpperCase());
  const drawing=deterministicDrawingNumber(settings,geometry);
  const vector=(geometry.direction || [0,0,1]).map(value=>Number(value || 0).toFixed(3)).join(", ");
  const fieldMin=Number(geometry.fieldMin || 0);
  const fieldMax=Number(geometry.fieldMax || 0);
  const fieldSpan=fieldMax-fieldMin;
  const lineCount=Math.max(1,Math.round(settings.lines || 1));
  const transform=`pₛ = ${fmt(settings.zoom || 1)}·D_${escapeXml(settings.lens || "clean")}(R(${fmt(settings.az || 0)}°, ${fmt(settings.el || 0)}°, ${fmt(settings.roll || 0)}°)p) + [${fmt(settings.panX || 0)}, ${fmt(settings.panY || 0)}]`;
  const slicing=settings.spiral
    ? `Γₖ: ${lineCount}q(p) − atan2(v,u) = k + 0.5`
    : `hᵢ = ${fieldMin.toFixed(3)} + ${fieldSpan.toFixed(3)}·E_${escapeXml(settings.gapEase || "linear")}((i + 0.5) / ${lineCount})`;
  const objectStats=`n̂_${axis} = [${vector}] · V=${Math.round(geometry.vertices || 0)} · F=${Math.round(geometry.triangles || 0)}`;
  const common=`fill="none" stroke="${ink}" vector-effect="non-scaling-stroke"`;
  const text=`fill="${ink}" stroke="none" font-family="DM Mono,ui-monospace,monospace"`;
  const backdrop=`<rect width="${W}" height="${H}" fill="${paper}"/>
<defs>
  <pattern id="blueprint-grid" width="${fmt(grid)}" height="${fmt(grid)}" patternUnits="userSpaceOnUse"><path d="M ${fmt(grid)} 0 L 0 0 0 ${fmt(grid)}" fill="none" stroke="${faint}" stroke-width="0.16" opacity="0.28" vector-effect="non-scaling-stroke"/></pattern>
</defs>
<rect x="${fmt(edge)}" y="${fmt(edge)}" width="${fmt(W-edge*2)}" height="${fmt(H-edge*2)}" fill="url(#blueprint-grid)" stroke="${ink}" stroke-width="0.45" opacity="0.96" vector-effect="non-scaling-stroke"/>
<path d="M ${fmt(inset)} ${fmt(edge)}v${fmt(edge*.55)}M${fmt(W-inset)} ${fmt(edge)}v${fmt(edge*.55)}M${fmt(edge)} ${fmt(inset)}h${fmt(edge*.55)}M${fmt(edge)} ${fmt(H-inset)}h${fmt(edge*.55)}" ${common} stroke-width="0.35" opacity="0.9"/>`;
  const overlay=`<g id="technical-annotations" style="pointer-events:none;user-select:none;-webkit-user-select:none">
  <g ${text} font-size="${fmt(tiny)}" letter-spacing="${fmt(tiny*.1)}">
    <text x="${fmt(cx)}" y="${fmt(dimensionLabelOffset)}" text-anchor="middle">${fmt(W)} mm · SHEET WIDTH</text>
    <text x="${fmt(dimensionLabelOffset)}" y="${fmt(cy)}" text-anchor="middle" transform="rotate(-90 ${fmt(dimensionLabelOffset)} ${fmt(cy)})">${fmt(H)} mm · SHEET HEIGHT</text>
  </g>
  <g ${text} font-size="${fmt(tiny)}" opacity="0.78">
    <text x="${fmt(inset+font)}" y="${fmt(H-inset-font*4.4)}">${transform}</text>
    <text x="${fmt(inset+font)}" y="${fmt(H-inset-font*3.1)}">${objectStats}</text>
    <text x="${fmt(inset+font)}" y="${fmt(H-inset-font*1.8)}">${slicing}</text>
  </g>
  <g transform="translate(${fmt(tx)} ${fmt(ty)})">
    <rect width="${fmt(titleW)}" height="${fmt(titleH)}" fill="${paper}" fill-opacity="0.9" stroke="${ink}" stroke-width="0.45" vector-effect="non-scaling-stroke"/>
    <path d="M0 ${fmt(titleH*.48)}H${fmt(titleW)}M${fmt(titleW*.66)} ${fmt(titleH*.48)}V${fmt(titleH)}M${fmt(titleW*.84)} ${fmt(titleH*.48)}V${fmt(titleH)}" ${common} stroke-width="0.3"/>
    <text x="${fmt(titleW*.04)}" y="${fmt(titleH*.22)}" ${text} font-size="${fmt(font*.82)}" font-weight="600" letter-spacing="${fmt(font*.08)}">${name}</text>
    <text x="${fmt(titleW*.04)}" y="${fmt(titleH*.39)}" ${text} font-size="${fmt(tiny)}">CONTOUR PROJECTION · TECHNICAL STUDY</text>
    <text x="${fmt(titleW*.03)}" y="${fmt(titleH*.66)}" ${text} font-size="${fmt(tiny*.85)}">DRAWING NO.</text>
    <text x="${fmt(titleW*.03)}" y="${fmt(titleH*.86)}" ${text} font-size="${fmt(tiny)}">${drawing}</text>
    <text x="${fmt(titleW*.69)}" y="${fmt(titleH*.66)}" ${text} font-size="${fmt(tiny*.65)}" letter-spacing="0">PROJECTION</text>
    <text x="${fmt(titleW*.69)}" y="${fmt(titleH*.86)}" ${text} font-size="${fmt(tiny*.82)}">${axis}</text>
    <text x="${fmt(titleW*.87)}" y="${fmt(titleH*.66)}" ${text} font-size="${fmt(tiny*.85)}">REV</text>
    <text x="${fmt(titleW*.9)}" y="${fmt(titleH*.88)}" ${text} font-size="${fmt(font)}">A</text>
  </g>
</g>`;
  return {backdrop,overlay};
}

/* ------------------------------------ Ramer–Douglas–Peucker (iterative) */
function sharpVertices(run){
  const n=run.length/2;
  const sharp=new Uint8Array(n);
  const closed=n>3 && Math.hypot(run[0]-run[(n-1)*2],run[1]-run[(n-1)*2+1])<1e-5;
  const count=closed ? n-1 : n;
  const threshold=35*Math.PI/180;
  const point=i=>{
    if (closed) i=(i%count+count)%count;
    else i=clamp(i,0,count-1);
    return [run[i*2],run[i*2+1]];
  };
  for (let i=closed ? 0 : 1;i<(closed ? count : count-1);i++){
    const a=point(i-1),b=point(i),c=point(i+1);
    const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1];
    const den=Math.hypot(ux,uy)*Math.hypot(vx,vy);
    if (!den) continue;
    const turn=Math.atan2(Math.abs(ux*vy-uy*vx),ux*vx+uy*vy);
    if (turn>=threshold) sharp[i]=1;
  }
  if (closed) sharp[n-1]=sharp[0];
  return sharp;
}

function simplify(run, tol){
  const n = run.length/2;
  const sourceSharp=sharpVertices(run);
  if (n < 3) return {run,sharp:sourceSharp};
  const keep = new Uint8Array(n);
  keep[0] = keep[n-1] = 1;
  for (let i=1;i<n-1;i++) if (sourceSharp[i]) keep[i]=1;
  const stack = [[0, n-1]];
  const t2 = tol*tol;
  while (stack.length){
    const [i0, i1] = stack.pop();
    if (i1 - i0 < 2) continue;
    const x0=run[i0*2], y0=run[i0*2+1], x1=run[i1*2], y1=run[i1*2+1];
    const dx=x1-x0, dy=y1-y0, dd=dx*dx+dy*dy;
    let far = -1, best = t2;
    for (let i=i0+1;i<i1;i++){
      const px=run[i*2]-x0, py=run[i*2+1]-y0;
      let d;
      if (dd === 0) d = px*px + py*py;
      else { const t = clamp((px*dx+py*dy)/dd, 0, 1); const ex=px-dx*t, ey=py-dy*t; d = ex*ex+ey*ey; }
      if (d > best){ best = d; far = i; }
    }
    if (far > 0){ keep[far] = 1; stack.push([i0, far], [far, i1]); }
  }
  const out = [], sharp=[];
  for (let i=0;i<n;i++) if (keep[i]){
    out.push(run[i*2],run[i*2+1]);
    sharp.push(sourceSharp[i]);
  }
  return {run:out,sharp:Uint8Array.from(sharp)};
}

/* --------------------------------------- deterministic hand-drawn wobble */
function humanizeRun(run, amount, salt=0){
  const strength=clamp(Number(amount) || 0,0,100)/100;
  const count=run.length/2;
  if (!strength || count<2) return run;
  const closed=count>3 && Math.hypot(run[0]-run[(count-1)*2],run[1]-run[(count-1)*2+1])<1e-5;
  const uniqueCount=closed ? count-1 : count;
  if (uniqueCount<2) return run;

  // Coordinate-derived phases keep the character stable across redraws and
  // exports, while the salt prevents neighbouring contours moving in unison.
  let hash=(0x811c9dc5^salt)>>>0;
  const sampleCount=Math.min(uniqueCount,8);
  for (let i=0;i<sampleCount;i++){
    hash^=Math.round(run[i*2]*1000); hash=Math.imul(hash,0x01000193);
    hash^=Math.round(run[i*2+1]*1000); hash=Math.imul(hash,0x01000193);
  }
  const random=()=>{
    hash^=hash<<13; hash^=hash>>>17; hash^=hash<<5;
    return (hash>>>0)/4294967296;
  };
  const phases=[random(),random(),random(),random()].map(value=>value*Math.PI*2);
  const amplitude=.08+strength*.62;
  const spacing=4.8-strength*2.2;
  const points=[];
  let distance=0;
  const segmentCount=closed ? uniqueCount : uniqueCount-1;
  for (let i=0;i<segmentCount;i++){
    const next=(i+1)%uniqueCount;
    const x0=run[i*2],y0=run[i*2+1],x1=run[next*2],y1=run[next*2+1];
    const dx=x1-x0,dy=y1-y0,length=Math.hypot(dx,dy);
    if (!length) continue;
    const divisions=Math.max(1,Math.ceil(length/spacing));
    for (let part=0;part<divisions;part++){
      const t=part/divisions,s=distance+length*t;
      const nx=-dy/length,ny=dx/length,tx=dx/length,ty=dy/length;
      const normal=amplitude*(.58*Math.sin(s*.19+phases[0])+.29*Math.sin(s*.47+phases[1])+.13*Math.sin(s*1.07+phases[2]));
      const along=amplitude*.13*Math.sin(s*.31+phases[3]);
      points.push(x0+dx*t+nx*normal+tx*along,y0+dy*t+ny*normal+ty*along);
    }
    distance+=length;
  }
  if (!closed){
    const i=uniqueCount-2,x0=run[i*2],y0=run[i*2+1],x1=run[(i+1)*2],y1=run[(i+1)*2+1];
    const dx=x1-x0,dy=y1-y0,length=Math.hypot(dx,dy) || 1,s=distance;
    const normal=amplitude*(.58*Math.sin(s*.19+phases[0])+.29*Math.sin(s*.47+phases[1])+.13*Math.sin(s*1.07+phases[2]));
    const along=amplitude*.13*Math.sin(s*.31+phases[3]);
    points.push(x1-dy/length*normal+dx/length*along,y1+dx/length*normal+dy/length*along);
  } else if (points.length>=2) points.push(points[0],points[1]);
  return points.length>=4 ? points : run;
}

/* ------------------------------------------ adaptive SVG curve output */
function serialiseRun(run, quality, sharp){
  const n = run.length/2;
  if (n < 2) return "";
  const closed = n > 3 && Math.hypot(run[0]-run[(n-1)*2], run[1]-run[(n-1)*2+1]) < 1e-5;
  const count = closed ? n-1 : n;
  if (count < 2) return "";
  const point = (i) => {
    if (closed) i = (i % count + count) % count;
    else i = clamp(i, 0, count-1);
    return [run[i*2], run[i*2+1]];
  };
  const curvature = (i) => {
    if (!closed && (i <= 0 || i >= count-1)) return 0;
    const a=point(i-1), b=point(i), c=point(i+1);
    const ux=b[0]-a[0], uy=b[1]-a[1], vx=c[0]-b[0], vy=c[1]-b[1];
    const den = Math.hypot(ux,uy) * Math.hypot(vx,vy);
    return den ? Math.abs(ux*vy-uy*vx)/den : 0;
  };

  // Catmull–Rom tangents become cubic controls. Nearly straight spans stay as
  // compact line commands; curved spans gain smooth controls without inserting
  // uniformly spaced on-curve nodes.
  const tension = 0.62 + quality*0.038;
  const bendThreshold = 0.045 - quality*0.003;
  const segments = closed ? count : count-1;
  let d = "M" + fmt(run[0]) + " " + fmt(run[1]);
  for (let i=0; i<segments; i++){
    const p0=point(i-1), p1=point(i), p2=point(i+1), p3=point(i+2);
    const bend = Math.max(curvature(i), curvature(i+1));
    if (quality === 1 || sharp[i] || sharp[(i+1)%count] || bend < bendThreshold){
      d += "L" + fmt(p2[0]) + " " + fmt(p2[1]);
      continue;
    }
    const k = tension/6;
    const segLen = Math.hypot(p2[0]-p1[0], p2[1]-p1[1]);
    const cap = segLen*.45;
    let t1x=(p2[0]-p0[0])*k, t1y=(p2[1]-p0[1])*k;
    let t2x=(p3[0]-p1[0])*k, t2y=(p3[1]-p1[1])*k;
    const t1l=Math.hypot(t1x,t1y), t2l=Math.hypot(t2x,t2y);
    if (t1l > cap){ t1x*=cap/t1l; t1y*=cap/t1l; }
    if (t2l > cap){ t2x*=cap/t2l; t2y*=cap/t2l; }
    const c1x=p1[0]+t1x, c1y=p1[1]+t1y;
    const c2x=p2[0]-t2x, c2y=p2[1]-t2y;
    d += "C" + fmt(c1x) + " " + fmt(c1y) + " " + fmt(c2x) + " " + fmt(c2y) + " " + fmt(p2[0]) + " " + fmt(p2[1]);
  }
  return d + (closed ? "Z" : "");
}

/* ------------------------------------------------------- silhouette */
function silhouetteEdges(mesh, P){
  const {T} = mesh;
  const {sx, sy, sd} = P;
  const facing = new Int8Array(T.length/3);
  for (let i=0, t=0; i<T.length; i+=3, t++){
    const a=T[i], b=T[i+1], c=T[i+2];
    const area = (sx[b]-sx[a])*(sy[c]-sy[a]) - (sx[c]-sx[a])*(sy[b]-sy[a]);
    facing[t] = area > 0 ? 1 : -1;            // screen y is flipped, so sign = facing
  }
  const NV = mesh.V.length/3;
  const edges = new Map();
  for (let i=0, t=0; i<T.length; i+=3, t++){
    for (let e=0;e<3;e++){
      const a = T[i+e], b = T[i+(e+1)%3];
      const key = a<b ? a*NV+b : b*NV+a;
      const prev = edges.get(key);
      if (prev === undefined) edges.set(key, facing[t]);
      else edges.set(key, prev + facing[t]*4);   // marker: seen twice
    }
  }
  const pts = [], segs = [], seen = new Map();
  const nodeOf = (v) => {
    let id = seen.get(v);
    if (id === undefined){ id = pts.length/3; seen.set(v,id); pts.push(sx[v], sy[v], sd[v]); }
    return id;
  };
  // encoding: seen once → ±1 (open boundary). Seen twice → prev + facing*4:
  //   same facing → ±5 (interior edge)   mixed facing → ±3 (silhouette)
  for (const [key, val] of edges){
    const b = key % NV, a = (key - b)/NV;
    const isSil = (val === 1 || val === -1 || val === 3 || val === -3);
    if (!isSil) continue;
    segs.push(nodeOf(a), nodeOf(b));
  }
  return {pts, segs};
}

function project(mesh, cam, W, H, margin, zoom, panX, panY, lens, lensAmount){
  const {V} = mesh;
  const n = V.length/3;
  const sx = new Float32Array(n), sy = new Float32Array(n), sd = new Float32Array(n);
  const {f, r, u} = cam;
  const scale = (Math.min(W, H)/2 - margin) * zoom;   // radius-1 model, rotation-stable fit
  const ox = W/2 + (panX ?? 0), oy = H/2 + (panY ?? 0);
  let dmin = Infinity, dmax = -Infinity;
  for (let i=0, v=0; i<V.length; i+=3, v++){
    const x=V[i], y=V[i+1], z=V[i+2];
    const screen=projectCameraPoint(
      x*r[0] + y*r[1] + z*r[2],
      x*u[0] + y*u[1] + z*u[2],
      scale, ox, oy, lens, lensAmount
    );
    sx[v] = screen[0];
    sy[v] = screen[1];   // SVG y grows downward
    const d = x*f[0] + y*f[1] + z*f[2];
    sd[v] = d;
    if (d<dmin) dmin=d; if (d>dmax) dmax=d;
  }
  return {sx, sy, sd, dmin, dmax, scale, ox, oy, f, r, u, lens, lensAmount};
}

function scalarField(mesh, P, axis, cutAz, cutEl){
  const {V} = mesh;
  const n = V.length/3;
  if (axis === "cam") return {S: P.sd, min: P.dmin, max: P.dmax, dir: P.f};
  if (axis === "custom"){
    const az=cutAz*Math.PI/180, el=cutEl*Math.PI/180;
    const dir=[Math.cos(el)*Math.cos(az), Math.cos(el)*Math.sin(az), Math.sin(el)];
    const S=new Float32Array(n);
    let mn=Infinity, mx=-Infinity;
    for (let i=0, v=0; v<n; i+=3, v++){
      const s=V[i]*dir[0]+V[i+1]*dir[1]+V[i+2]*dir[2];
      S[v]=s; if (s<mn) mn=s; if (s>mx) mx=s;
    }
    return {S, min:mn, max:mx, dir};
  }
  // the mesh is always stored Z-up, so "height" is component 2
  const comp = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const S = new Float32Array(n);
  let mn = Infinity, mx = -Infinity;
  for (let i=comp, v=0; v<n; i+=3, v++){
    const s = V[i]; S[v]=s;
    if (s<mn) mn=s; if (s>mx) mx=s;
  }
  const dir = comp === 0 ? [1,0,0] : comp === 1 ? [0,1,0] : [0,0,1];
  return {S, min: mn, max: mx, dir};
}

function inverseLineGapEase(value, settings){
  if (settings.gapEase === "linear" || !settings.easeStrength) return value;
  let lo=0, hi=1;
  for (let i=0;i<18;i++){
    const mid=(lo+hi)/2;
    const eased=easeLineGap(mid, settings.gapEase, settings.easeStrength, settings.easeCenter, settings.easeCycles);
    if (eased < value) lo=mid; else hi=mid;
  }
  return (lo+hi)/2;
}

function spiralContours(P, mesh, field, settings){
  const {V,T}=mesh;
  const count=Math.max(1, Math.round(settings.lines));
  const span=field.max-field.min || 1;
  const q=new Float32Array(V.length/3), gradientValue=new Float32Array(V.length/3);
  for (let v=0;v<q.length;v++){
    const position=clamp((field.S[v]-field.min)/span, 0, 1);
    gradientValue[v]=position;
    q[v]=inverseLineGapEase(position, settings);
  }

  // A polar frame around the slicing direction turns parallel levels into a
  // helicoidal field. Integer isolines of that field join across its angle seam.
  const dir=field.dir;
  const ref=Math.abs(dir[2])<.9 ? [0,0,1] : [0,1,0];
  let ax=ref[1]*dir[2]-ref[2]*dir[1];
  let ay=ref[2]*dir[0]-ref[0]*dir[2];
  let az=ref[0]*dir[1]-ref[1]*dir[0];
  const al=Math.hypot(ax,ay,az) || 1;
  ax/=al; ay/=al; az/=al;
  const bx=dir[1]*az-dir[2]*ay;
  const by=dir[2]*ax-dir[0]*az;
  const bz=dir[0]*ay-dir[1]*ax;
  const angle=new Float32Array(q.length);
  const radialX=new Float32Array(q.length), radialY=new Float32Array(q.length);
  for (let v=0,i=0;v<q.length;v++,i+=3){
    const x=V[i], y=V[i+1], z=V[i+2];
    const rx=x*ax+y*ay+z*az, ry=x*bx+y*by+z*bz;
    radialX[v]=rx; radialY[v]=ry;
    angle[v]=Math.atan2(ry,rx)/(Math.PI*2);
  }

  const pts=[], values=[], segs=[], pointIndex=new Map();
  const unwrap=(value,anchor)=>value+Math.round(anchor-value);
  const crossesAxis=(ids)=>{
    const x0=radialX[ids[0]], y0=radialY[ids[0]];
    const x1=radialX[ids[1]], y1=radialY[ids[1]];
    const x2=radialX[ids[2]], y2=radialY[ids[2]];
    const c0=x0*y1-y0*x1, c1=x1*y2-y1*x2, c2=x2*y0-y2*x0;
    const scale=Math.max(x0*x0+y0*y0,x1*x1+y1*y1,x2*x2+y2*y2,1e-12);
    const eps=scale*1e-7;
    const area=c0+c1+c2;
    if (Math.abs(area)>eps){
      return (c0>=-eps && c1>=-eps && c2>=-eps) || (c0<=eps && c1<=eps && c2<=eps);
    }
    const edgeHitsOrigin=(px,py,qx,qy)=>{
      const dx=qx-px, dy=qy-py, length2=dx*dx+dy*dy;
      if (!length2) return px*px+py*py<=eps;
      const t=clamp(-(px*dx+py*dy)/length2,0,1);
      const ex=px+dx*t, ey=py+dy*t;
      return ex*ex+ey*ey<=eps;
    };
    return edgeHitsOrigin(x0,y0,x1,y1) || edgeHitsOrigin(x1,y1,x2,y2) || edgeHitsOrigin(x2,y2,x0,y0);
  };
  const pointOnEdge=(a,b,pa,pb,level)=>{
    let t=clamp((level-pa)/(pb-pa),0,1);
    let key;
    if (t<1e-7) key="v"+a;
    else if (t>1-1e-7) key="v"+b;
    else {
      const forward=a<b;
      const edgeT=forward ? t : 1-t;
      key=(forward ? a+"_"+b : b+"_"+a)+"_"+Math.round(edgeT*1e7);
    }
    let id=pointIndex.get(key);
    if (id !== undefined) return id;
    id=pts.length/3;
    pts.push(
      P.sx[a]+(P.sx[b]-P.sx[a])*t,
      P.sy[a]+(P.sy[b]-P.sy[a])*t,
      P.sd[a]+(P.sd[b]-P.sd[a])*t
    );
    values.push(gradientValue[a]+(gradientValue[b]-gradientValue[a])*t);
    pointIndex.set(key,id);
    return id;
  };

  for (let i=0;i<T.length;i+=3){
    const ids=[T[i],T[i+1],T[i+2]];
    // Polar phase is undefined where the winding axis pierces the surface.
    // Treat those triangles as branch boundaries instead of drawing arbitrary
    // segments across the singularity.
    if (crossesAxis(ids)) continue;
    const a0=angle[ids[0]];
    const angles=[a0,unwrap(angle[ids[1]],a0),unwrap(angle[ids[2]],a0)];
    const phase=ids.map((v,j)=>count*q[v]-angles[j]-.5);
    const first=Math.ceil(Math.min(...phase));
    const last=Math.floor(Math.max(...phase));
    for (let level=first;level<=last;level++){
      const crossings=[];
      for (let e=0;e<3;e++){
        const n=(e+1)%3, p0=phase[e], p1=phase[n];
        if ((p0<level && p1>=level) || (p1<level && p0>=level)){
          crossings.push(pointOnEdge(ids[e],ids[n],p0,p1,level));
        }
      }
      if (crossings.length===2 && crossings[0]!==crossings[1]) segs.push(crossings[0],crossings[1]);
    }
  }
  return {pts,values,segs};
}

function computeContourInstance(mesh, settings, quick){
  const t0 = performance.now();
  const W = settings.pw, H = settings.ph;
  const cam = cameraBasis(settings.az, settings.el, settings.roll);
  const P = project(mesh, cam, W, H, settings.margin, settings.zoom, settings.panX, settings.panY, settings.lens, settings.lensAmount);
  const field = scalarField(mesh, P, settings.axis, settings.cutAz, settings.cutEl);
  const blueprintGeometry={fieldMin:field.min,fieldMax:field.max,direction:field.dir,vertices:mesh.V.length/3,triangles:mesh.T.length/3};
  const NV = mesh.V.length/3;

  let vis = null, visOutline = null, step = 0.6;
  if (settings.hide){
    const res = quick ? 320 : 1100;
    const D = buildDepth(P, mesh.T, W, H, res);
    const depthRange = (P.dmax - P.dmin) || 1;
    vis = makeVisibleTest(D, depthRange * 0.006 + 1e-6, 1);
    // outlines sit exactly on the depth cliff, so they need a wider, kinder test
    visOutline = makeVisibleTest(D, depthRange * 0.03 + 1e-6, 2);
    step = Math.max(0.25, W / D.rw);
  }

  const palette=gradientPalette(settings);
  const toneBandCount=settings.halftone ? 12 : 1;
  const toneValue=position=>{
    const cycles=clamp(Math.round(settings.halftoneCycles || 1),1,8);
    return .5+.5*Math.sin(position*cycles*Math.PI*2-Math.PI/2);
  };
  const toneBand=position=>clamp(Math.floor(toneValue(position)*toneBandCount),0,toneBandCount-1);
  const out=Array.from({length:palette.length},()=>Array.from({length:toneBandCount},()=>[]));
  const outlineOut=[];
  const N = settings.lines;
  const quality = clamp(Math.round(settings.quality), 1, 10);
  const curveStrength = (quality-1)/9;
  const span = field.max - field.min;
  if (settings.spiral){
    const {pts,values,segs}=spiralContours(P,mesh,field,settings);
    if (segs.length) for (const poly of chain(pts,segs)){
      if (settings.gradientEnabled){
        for (const chunk of splitPolylineByBands(poly,pts,values,palette.length)){
          const indexes=Array.from({length:chunk.pts.length/3},(_,i)=>i);
          const position=(chunk.band+.5)/palette.length;
          emitPath(indexes,chunk.pts,vis,step,out[chunk.band][settings.halftone ? toneBand(position) : 0]);
        }
      } else if (settings.halftone){
        const tones=Float32Array.from(values,toneValue);
        for (const chunk of splitPolylineByBands(poly,pts,tones,toneBandCount)){
          const indexes=Array.from({length:chunk.pts.length/3},(_,i)=>i);
          emitPath(indexes,chunk.pts,vis,step,out[0][chunk.band]);
        }
      } else emitPath(poly,pts,vis,step,out[0][0]);
    }
  } else {
    for (let i=0;i<N;i++){
      const position = easeLineGap((i + 0.5) / N, settings.gapEase, settings.easeStrength, settings.easeCenter, settings.easeCycles);
      const level = field.min + span * position;
      const {pts, segs} = sliceLevel(P, mesh, field.S, level, NV, field.dir, curveStrength);
      if (!segs.length) continue;
      const band=settings.gradientEnabled ? clamp(Math.floor(position*palette.length),0,palette.length-1) : 0;
      const tone=settings.halftone ? toneBand(position) : 0;
      for (const poly of chain(pts, segs)) emitPath(poly, pts, vis, step, out[band][tone]);
    }
  }
  if (settings.sil){
    const {pts, segs} = silhouetteEdges(mesh, P);
    if (segs.length){
      for (const poly of chain(pts, segs)) emitPath(poly, pts, visOutline, step, outlineOut);
    }
  }

  // ---- serialise: RDP concentrates anchors where deviation is greatest;
  // curved spans use Béziers while flat spans remain compact straight lines.
  const tolerance = 0.06 * Math.pow(0.72, quality-1);
  let nodes=0, paths=0;
  let humanizerSalt=0;
  const serialiseGroup=runs=>{
    let d="";
    const plotRuns=[];
    for (const raw of runs){
      const simplified=simplify(raw,tolerance);
      const run=settings.humanizer ? humanizeRun(simplified.run,settings.humanizerAmount,humanizerSalt++) : simplified.run;
      if (run.length<4) continue;
      const sharp=settings.humanizer ? sharpVertices(run) : simplified.sharp;
      d+=serialiseRun(run,quality,sharp);
      plotRuns.push(run);
      nodes+=run.length/2; paths++;
    }
    return {d, runs:plotRuns};
  };
  const serialised=out.map(toneGroups=>toneGroups.map(serialiseGroup));
  const colorPaths=serialised.map(toneGroups=>toneGroups.map(group=>group.d));
  const outlineGroup=serialiseGroup(outlineOut);
  const outlinePath=outlineGroup.d;
  const toolpaths=serialised.map((toneGroups,index)=>({
    color:palette[index],
    label:settings.gradientEnabled ? `gradient colour ${index+1}` : "contours",
    runs:toneGroups.flatMap(group=>group.runs)
  })).filter(group=>group.runs.length);
  if (outlineGroup.runs.length){
    const matching=toolpaths.find(group=>group.color.toLowerCase()===settings.color.toLowerCase());
    if (matching) matching.runs.push(...outlineGroup.runs);
    else toolpaths.push({color:settings.color,label:"silhouette",runs:outlineGroup.runs});
  }
  const allPathData=colorPaths.flat().join("")+outlinePath;
  const blueprint=blueprintDocument(settings,W,H,blueprintGeometry);
  let artwork, renderedPaths=paths, renderedNodes=nodes;
  if (settings.chroma){
    const amount=clamp(settings.chromaAmount, .1, 6);
    const rotation=amount*.12, cx=W/2, cy=H/2;
    const attrs=`fill="none" stroke-width="${settings.sw}" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:screen"`;
    artwork=`${settings.suppressBackground ? "" : `<rect width="${W}" height="${H}" fill="#000000"/>`}
<g style="isolation:isolate">
<path d="${allPathData}" stroke="#ff2020" transform="translate(${-amount} 0) rotate(${-rotation} ${cx} ${cy})" ${attrs}/>
<path d="${allPathData}" stroke="#25ff48" transform="translate(0 ${fmt(amount*.08)})" ${attrs}/>
<path d="${allPathData}" stroke="#2548ff" transform="translate(${amount} 0) rotate(${rotation} ${cx} ${cy})" ${attrs}/>
</g>`;
    renderedPaths*=3; renderedNodes*=3;
  } else {
    const bg=settings.suppressBackground ? "" : settings.blueprint ? blueprint.backdrop : settings.bg ? `<rect width="${W}" height="${H}" fill="${settings.backgroundColor || "#ffffff"}"/>` : "";
    const attrs=`fill="none" stroke-width="${settings.sw}" stroke-linecap="round" stroke-linejoin="round"`;
    const spacing=clamp(settings.halftoneSize || 2.4,.5,8);
    const contrast=clamp((settings.halftoneContrast || 0)/100,0,1);
    const halftoneAttrs=tone=>{
      if (!settings.halftone) return "";
      const value=(tone+.5)/toneBandCount;
      const ratio=clamp(.5+(value-.5)*contrast*1.7,.07,.93);
      const dash=Math.max(.01,spacing*ratio-settings.sw*.7);
      const gap=Math.max(settings.sw*.65,spacing-dash);
      const offset=(tone/toneBandCount)*spacing;
      return `stroke-dasharray="${fmt(dash)} ${fmt(gap)}" stroke-dashoffset="${fmt(offset)}"`;
    };
    const groups=colorPaths.map((tonePaths,i)=>tonePaths.map((d,tone)=>d ? `<path d="${d}" stroke="${palette[i]}" ${halftoneAttrs(tone)} ${attrs}/>` : "").join("\n")).join("\n");
    const outline=outlinePath ? `<path d="${outlinePath}" stroke="${settings.blueprint ? "#f5f9ff" : settings.color}" ${attrs}/>` : "";
    artwork=`${bg}${groups}${outline}${settings.suppressBackground ? "" : blueprint.overlay}`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
${artwork}
</svg>`;
  const ms = performance.now() - t0;
  return {svg, toolpaths, paths:renderedPaths, nodes:renderedNodes, bytes:new TextEncoder().encode(svg).byteLength, ms, W, H, quick, blueprintGeometry};
}

function svgArtwork(svg){
  const start=svg.indexOf(">");
  const end=svg.lastIndexOf("</svg>");
  return start>=0 && end>start ? svg.slice(start+1,end).trim() : "";
}

export function computeContours(mesh, settings, quick){
  const hexColor=/^#[0-9a-f]{6}$/i;
  const validTargets = targets => Object.entries(targets || {}).filter(([key,value]) =>
    key==="color"
      ? hexColor.test(String(value)) && hexColor.test(String(settings[key]))
      : Number.isFinite(Number(value)) && Number.isFinite(Number(settings[key]))
  );
  const targetsX=settings.morphEnabled ? validTargets(settings.morphTargets) : [];
  const targetsY=settings.morphEnabled && settings.morphSecondEnabled ? validTargets(settings.morphTargets2) : [];
  if (!targetsX.length && !targetsY.length) return computeContourInstance(mesh,settings,quick);

  const started=performance.now();
  const stepsX=targetsX.length ? clamp(Math.round(settings.morphSteps || 2),2,24) : 1;
  const stepsY=targetsY.length ? clamp(Math.round(settings.morphStepsY || 2),2,24) : 1;
  const targetsXByKey=new Map(targetsX), targetsYByKey=new Map(targetsY);
  const targetKeys=new Set([...targetsXByKey.keys(),...targetsYByKey.keys()]);
  const results=[];
  for (let y=0;y<stepsY;y++) for (let x=0;x<stepsX;x++){
    const amountX=stepsX===1 ? 0 : x/(stepsX-1);
    const amountY=stepsY===1 ? 0 : y/(stepsY-1);
    const instance={...settings,suppressBackground:true};
    for (const key of targetKeys){
      const targetX=targetsXByKey.get(key), targetY=targetsYByKey.get(key);
      if (key==="color"){
        const startColor=settings.color.slice(1).match(/../g).map(value=>parseInt(value,16));
        const colorX=targetX ? String(targetX).slice(1).match(/../g).map(value=>parseInt(value,16)) : startColor;
        const colorY=targetY ? String(targetY).slice(1).match(/../g).map(value=>parseInt(value,16)) : startColor;
        instance.color="#"+startColor.map((value,channel)=>clamp(Math.round(value+(colorX[channel]-value)*amountX+(colorY[channel]-value)*amountY),0,255).toString(16).padStart(2,"0")).join("");
        continue;
      }
      const start=Number(settings[key]);
      instance[key]=start+(targetX===undefined ? 0 : (Number(targetX)-start)*amountX)+(targetY===undefined ? 0 : (Number(targetY)-start)*amountY);
    }
    results.push({...computeContourInstance(mesh,instance,quick),morphX:x,morphY:y});
  }

  const W=settings.pw, H=settings.ph;
  const blueprint=blueprintDocument(settings,W,H,results[0]?.blueprintGeometry);
  const background=settings.blueprint
    ? blueprint.backdrop
    : settings.chroma
    ? `<rect width="${W}" height="${H}" fill="#000000"/>`
    : settings.bg ? `<rect width="${W}" height="${H}" fill="${settings.backgroundColor || "#ffffff"}"/>` : "";
  const layers=results.map(result=>`<g data-morph-x-step="${result.morphX+1}" data-morph-y-step="${result.morphY+1}" data-morph-x="${stepsX===1 ? 0 : fmt(result.morphX/(stepsX-1))}" data-morph-y="${stepsY===1 ? 0 : fmt(result.morphY/(stepsY-1))}">${svgArtwork(result.svg)}</g>`).join("\n");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
${background}${layers}${settings.blueprint ? blueprint.overlay : ""}
</svg>`;

  const groups=new Map();
  for (const result of results) for (const group of result.toolpaths){
    const key=group.color.toLowerCase();
    const existing=groups.get(key);
    if (existing) existing.runs.push(...group.runs);
    else groups.set(key,{color:group.color,label:"morphed contours",runs:[...group.runs]});
  }
  return {
    svg,
    toolpaths:[...groups.values()],
    paths:results.reduce((sum,result)=>sum+result.paths,0),
    nodes:results.reduce((sum,result)=>sum+result.nodes,0),
    bytes:new TextEncoder().encode(svg).byteLength,
    ms:performance.now()-started,
    W,H,quick
  };
}


