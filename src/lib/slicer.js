"use strict";
import { generateGCode } from "./gcode.js";
/* =====================================================================
   Slicewise — mesh → contour SVG / G-code
   Pipeline: parse → weld → orient → project → slice → chain → hide → export
   ===================================================================== */

/* ---------------------------------------------------------------- utils */
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const fmt = n => {
  const r = Math.round(n*100)/100;
  return Number.isInteger(r) ? String(r) : String(r);
};

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

/* ------------------------------------------------------------- parsing */
function parseSTL(buf){
  const dv = new DataView(buf);
  if (buf.byteLength >= 84){
    const n = dv.getUint32(80, true);
    if (84 + n*50 === buf.byteLength) return parseSTLBinary(dv, n);
  }
  const txt = new TextDecoder().decode(new Uint8Array(buf));
  if (/facet\s+normal/i.test(txt)) return parseSTLAscii(txt);
  throw new Error("That file isn't readable as STL — re-export it as binary or ASCII STL");
}
function parseSTLBinary(dv, n){
  const verts = new Float64Array(n*9), tris = new Uint32Array(n*3);
  let o = 84;
  for (let i=0;i<n;i++){
    o += 12; // skip stored normal
    for (let k=0;k<3;k++){
      verts[i*9+k*3  ] = dv.getFloat32(o,   true);
      verts[i*9+k*3+1] = dv.getFloat32(o+4, true);
      verts[i*9+k*3+2] = dv.getFloat32(o+8, true);
      o += 12;
      tris[i*3+k] = i*3+k;
    }
    o += 2; // attribute byte count
  }
  return {verts, tris};
}
function parseSTLAscii(txt){
  const v = [];
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let m;
  while ((m = re.exec(txt))) v.push(+m[1], +m[2], +m[3]);
  const n = Math.floor(v.length/9)*3;
  const tris = new Uint32Array(n);
  for (let i=0;i<n;i++) tris[i] = i;
  return {verts: Float64Array.from(v.slice(0, n*3)), tris};
}

function parseOBJ(text){
  const v = [], f = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines){
    if (line.charCodeAt(0) === 118 && line[1] === ' '){          // "v "
      const p = line.split(/\s+/);
      v.push(+p[1], +p[2], +p[3]);
    } else if (line.charCodeAt(0) === 102 && (line[1] === ' ' || line[1] === '\t')){ // "f "
      const p = line.trim().split(/\s+/);
      const idx = [];
      for (let i=1;i<p.length;i++){
        let s = p[i].split('/')[0];
        if (!s) continue;
        let n = parseInt(s,10);
        if (Number.isNaN(n)) continue;
        idx.push(n > 0 ? n-1 : v.length/3 + n);
      }
      for (let i=1;i+1<idx.length;i++) f.push(idx[0], idx[i], idx[i+1]);  // fan
    }
  }
  if (!v.length || !f.length) throw new Error("No faces in that OBJ — it may be a point cloud or curve-only export");
  return {verts: Float64Array.from(v), tris: Uint32Array.from(f)};
}

function parsePLY(buf){
  const bytes = new Uint8Array(buf);
  const headTxt = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 20000)));
  const endIdx = headTxt.indexOf("end_header");
  if (endIdx < 0) throw new Error("That file isn't readable as PLY — the header is missing");
  const headEnd = headTxt.indexOf("\n", endIdx) + 1;
  const header = headTxt.slice(0, headEnd).split(/\r?\n/);
  let fmtType = "ascii", elems = [], cur = null;
  const SIZES = {char:1,uchar:1,int8:1,uint8:1,short:2,ushort:2,int16:2,uint16:2,
                 int:4,uint:4,int32:4,uint32:4,float:4,float32:4,double:8,float64:8};
  for (const raw of header){
    const t = raw.trim().split(/\s+/);
    if (t[0] === "format") fmtType = t[1];
    else if (t[0] === "element"){ cur = {name:t[1], count:+t[2], props:[]}; elems.push(cur); }
    else if (t[0] === "property" && cur){
      if (t[1] === "list") cur.props.push({list:true, countType:t[2], type:t[3], name:t[4]});
      else cur.props.push({list:false, type:t[1], name:t[2]});
    }
  }
  const vEl = elems.find(e => e.name === "vertex");
  const fEl = elems.find(e => e.name === "face");
  if (!vEl) throw new Error("PLY has no vertex element");
  const verts = new Float64Array(vEl.count*3);
  const faces = [];

  if (fmtType === "ascii"){
    const body = new TextDecoder().decode(bytes.subarray(headEnd)).split(/\r?\n/);
    let li = 0;
    const next = () => { while (li < body.length && !body[li].trim()) li++; return body[li++].trim().split(/\s+/); };
    const xi = vEl.props.findIndex(p=>p.name==="x"), yi = vEl.props.findIndex(p=>p.name==="y"), zi = vEl.props.findIndex(p=>p.name==="z");
    for (let i=0;i<vEl.count;i++){ const t = next(); verts[i*3]=+t[xi]; verts[i*3+1]=+t[yi]; verts[i*3+2]=+t[zi]; }
    if (fEl) for (let i=0;i<fEl.count;i++){
      const t = next(), k = +t[0];
      for (let j=1;j+1<k;j++) faces.push(+t[1], +t[j+1], +t[j+2]);
    }
  } else {
    const le = fmtType.indexOf("little") >= 0;
    const dv = new DataView(buf);
    let o = headEnd;
    const read = (type) => {
      switch(type){
        case "char": case "int8":   return dv.getInt8(o++);
        case "uchar": case "uint8": return dv.getUint8(o++);
        case "short": case "int16": { const r=dv.getInt16(o,le); o+=2; return r; }
        case "ushort": case "uint16": { const r=dv.getUint16(o,le); o+=2; return r; }
        case "int": case "int32":   { const r=dv.getInt32(o,le); o+=4; return r; }
        case "uint": case "uint32": { const r=dv.getUint32(o,le); o+=4; return r; }
        case "float": case "float32": { const r=dv.getFloat32(o,le); o+=4; return r; }
        case "double": case "float64": { const r=dv.getFloat64(o,le); o+=8; return r; }
        default: throw new Error("Unsupported PLY property type: " + type);
      }
    };
    for (const el of elems){
      for (let i=0;i<el.count;i++){
        if (el === vEl){
          const rec = {};
          for (const p of el.props){
            if (p.list){ const k = read(p.countType); for (let j=0;j<k;j++) read(p.type); }
            else rec[p.name] = read(p.type);
          }
          verts[i*3]=rec.x; verts[i*3+1]=rec.y; verts[i*3+2]=rec.z;
        } else if (el === fEl){
          let poly = null;
          for (const p of el.props){
            if (p.list){
              const k = read(p.countType), arr = [];
              for (let j=0;j<k;j++) arr.push(read(p.type));
              if (!poly) poly = arr;
            } else read(p.type);
          }
          if (poly) for (let j=1;j+1<poly.length;j++) faces.push(poly[0], poly[j], poly[j+1]);
        } else {
          for (const p of el.props){
            if (p.list){ const k = read(p.countType); for (let j=0;j<k;j++) read(p.type); }
            else read(p.type);
          }
        }
      }
    }
  }
  if (!faces.length) throw new Error("PLY has no faces (point clouds aren't supported)");
  return {verts, tris: Uint32Array.from(faces)};
}

/* ------------------------------------------------- weld + normalise */
function weld(raw){
  const {verts, tris} = raw;
  let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;
  for (let i=0;i<verts.length;i+=3){
    const x=verts[i],y=verts[i+1],z=verts[i+2];
    if (x<minx)minx=x; if (x>maxx)maxx=x;
    if (y<miny)miny=y; if (y>maxy)maxy=y;
    if (z<minz)minz=z; if (z>maxz)maxz=z;
  }
  const diag = Math.hypot(maxx-minx, maxy-miny, maxz-minz) || 1;
  const q = diag * 1e-6;
  const map = new Map();
  const out = [];
  const remap = new Uint32Array(verts.length/3);
  for (let i=0, vi=0; i<verts.length; i+=3, vi++){
    const key = Math.round(verts[i]/q)+"_"+Math.round(verts[i+1]/q)+"_"+Math.round(verts[i+2]/q);
    let id = map.get(key);
    if (id === undefined){ id = out.length/3; map.set(key, id); out.push(verts[i],verts[i+1],verts[i+2]); }
    remap[vi] = id;
  }
  const t2 = new Uint32Array(tris.length);
  let n = 0;
  for (let i=0;i<tris.length;i+=3){
    const a=remap[tris[i]], b=remap[tris[i+1]], c=remap[tris[i+2]];
    if (a===b||b===c||a===c) continue;            // drop degenerates
    t2[n++]=a; t2[n++]=b; t2[n++]=c;
  }
  // recentre on the bbox middle, scale so the bounding sphere radius is 1
  const cx=(minx+maxx)/2, cy=(miny+maxy)/2, cz=(minz+maxz)/2;
  const V = new Float32Array(out.length);
  let r2 = 0;
  for (let i=0;i<out.length;i+=3){
    const x=out[i]-cx, y=out[i+1]-cy, z=out[i+2]-cz;
    V[i]=x; V[i+1]=y; V[i+2]=z;
    const d = x*x+y*y+z*z; if (d>r2) r2=d;
  }
  const r = Math.sqrt(r2) || 1;
  for (let i=0;i<V.length;i++) V[i] /= r;
  return {V, T: t2.subarray(0,n)};
}

function vertexNormals(V, T){
  const N = new Float32Array(V.length);
  for (let i=0;i<T.length;i+=3){
    const a=T[i]*3, b=T[i+1]*3, c=T[i+2]*3;
    const abx=V[b]-V[a], aby=V[b+1]-V[a+1], abz=V[b+2]-V[a+2];
    const acx=V[c]-V[a], acy=V[c+1]-V[a+1], acz=V[c+2]-V[a+2];
    const nx=aby*acz-abz*acy, ny=abz*acx-abx*acz, nz=abx*acy-aby*acx;
    N[a]+=nx; N[a+1]+=ny; N[a+2]+=nz;
    N[b]+=nx; N[b+1]+=ny; N[b+2]+=nz;
    N[c]+=nx; N[c+1]+=ny; N[c+2]+=nz;
  }
  for (let i=0;i<N.length;i+=3){
    const len=Math.hypot(N[i],N[i+1],N[i+2]) || 1;
    N[i]/=len; N[i+1]/=len; N[i+2]/=len;
  }
  return N;
}

/* ------------------------------------------------------ demo geometry */
function torusKnot(p=2, q=3, R=1, r=0.26, tubeSeg=360, radSeg=28){
  const verts = [], tris = [];
  const sub = (a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const norm = a=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; };
  const pt = (u)=>{
    const qu=q/p*u, cq=Math.cos(qu);
    return [ (2+cq)*0.5*Math.cos(u)*R, (2+cq)*0.5*Math.sin(u)*R, Math.sin(qu)*0.5*R ];
  };
  // centreline + tangents
  const C = [], T = [];
  for (let i=0;i<tubeSeg;i++){
    const u = i/tubeSeg*Math.PI*2*p;
    C.push(pt(u));
    T.push(norm(sub(pt(u+1e-4), pt(u-1e-4))));
  }
  // rotation-minimising frame (parallel transport), then unwind the closing twist
  const N = [];
  let n0 = norm(cross(T[0], Math.abs(T[0][2])<0.9 ? [0,0,1] : [1,0,0]));
  N.push(n0);
  for (let i=1;i<tubeSeg;i++){
    const prev = N[i-1], t = T[i];
    N.push(norm(sub(prev, t.map(v=>v*dot(prev,t)))));
  }
  const closed = norm(sub(N[tubeSeg-1], T[0].map(v=>v*dot(N[tubeSeg-1], T[0]))));
  const b0 = cross(T[0], N[0]);
  const twist = Math.atan2(dot(closed, b0), dot(closed, N[0]));
  for (let i=0;i<tubeSeg;i++){
    const a = -twist * i/tubeSeg;                        // spread the mismatch evenly
    const t = T[i], n = N[i], b = cross(t, n);
    const nn = [n[0]*Math.cos(a)+b[0]*Math.sin(a), n[1]*Math.cos(a)+b[1]*Math.sin(a), n[2]*Math.cos(a)+b[2]*Math.sin(a)];
    const bb = cross(t, nn);
    const P = C[i];
    for (let j=0;j<radSeg;j++){
      const th = j/radSeg*Math.PI*2, ca=Math.cos(th)*r, sa=Math.sin(th)*r;
      verts.push(P[0]+ca*nn[0]+sa*bb[0], P[1]+ca*nn[1]+sa*bb[1], P[2]+ca*nn[2]+sa*bb[2]);
    }
  }
  for (let i=0;i<tubeSeg;i++) for (let j=0;j<radSeg;j++){
    const a=i*radSeg+j, b=i*radSeg+(j+1)%radSeg;
    const c=((i+1)%tubeSeg)*radSeg+j, d=((i+1)%tubeSeg)*radSeg+(j+1)%radSeg;
    tris.push(a,b,d, a,d,c);
  }
  return {verts: Float64Array.from(verts), tris: Uint32Array.from(tris)};
}

function sphereDemo(kind="ripple", segments=128, rings=64){
  const verts=[], tris=[];
  const signedPow=(v,p)=>Math.sign(v)*Math.pow(Math.abs(v),p);
  for (let i=0;i<=rings;i++){
    const phi=i/rings*Math.PI, sp=Math.sin(phi), cp=Math.cos(phi);
    for (let j=0;j<segments;j++){
      const theta=j/segments*Math.PI*2;
      let x=sp*Math.cos(theta), y=sp*Math.sin(theta), z=cp;
      if (kind === "cube"){
        const p=.52;
        x=signedPow(x,p); y=signedPow(y,p); z=signedPow(z,p);
      } else {
        const radius=1+.095*Math.sin(theta*7)*Math.pow(sp,3)+.035*Math.cos(phi*8);
        x*=radius; y*=radius; z*=radius;
      }
      verts.push(x,y,z);
    }
  }
  for (let i=0;i<rings;i++) for (let j=0;j<segments;j++){
    const a=i*segments+j, b=i*segments+(j+1)%segments;
    const c=(i+1)*segments+j, d=(i+1)*segments+(j+1)%segments;
    tris.push(a,b,d, a,d,c);
  }
  return {verts:Float64Array.from(verts), tris:Uint32Array.from(tris)};
}

function ringTorus(major=.72, minor=.3, majorSeg=192, minorSeg=64){
  const verts=[], tris=[];
  for (let i=0;i<majorSeg;i++){
    const u=i/majorSeg*Math.PI*2, cu=Math.cos(u), su=Math.sin(u);
    for (let j=0;j<minorSeg;j++){
      const v=j/minorSeg*Math.PI*2, cv=Math.cos(v), sv=Math.sin(v);
      const radius=major+minor*cv;
      verts.push(radius*cu, radius*su, minor*sv);
    }
  }
  for (let i=0;i<majorSeg;i++) for (let j=0;j<minorSeg;j++){
    const a=i*minorSeg+j, b=i*minorSeg+(j+1)%minorSeg;
    const c=((i+1)%majorSeg)*minorSeg+j, d=((i+1)%majorSeg)*minorSeg+(j+1)%minorSeg;
    tris.push(a,b,d, a,d,c);
  }
  return {verts:Float64Array.from(verts), tris:Uint32Array.from(tris)};
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
  const {sx, sy, sd, r, u, f, scale, ox, oy, lens, lensAmount} = P;
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
    let cur = start, prev = -1;
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
      prev = cur; cur = other;
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

/* ------------------------------------ Ramer–Douglas–Peucker (iterative) */
function simplify(run, tol){
  const n = run.length/2;
  if (n < 3) return run;
  const keep = new Uint8Array(n);
  keep[0] = keep[n-1] = 1;
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
  const out = [];
  for (let i=0;i<n;i++) if (keep[i]) out.push(run[i*2], run[i*2+1]);
  return out;
}

/* ------------------------------------------ adaptive SVG curve output */
function serialiseRun(run, quality){
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
    if (quality === 1 || bend < bendThreshold){
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

/* =================================================================== app */
const state = {
  mesh: null, name: "demo · torus knot", upY: false,
  svgSource: null, svgSourceName: "", svgDepth: 12, svgRounded: false, svgRoundness: 25,
  az: 35, el: 24, roll: 0, zoom: 1, panX: 0, panY: 0, lens: "clean", lensAmount: 100,
  lines: 40, gapEase: "linear", easeStrength: 100, easeCycles: 1, easeCenter: 50, quality: 7, axis: "up", cutAz: 0, cutEl: 90, spiral: false, hide: true, sil: true,
  sw: 0.35, color: "#15181a", pw: 210, ph: 210, margin: 14, bg: false,
  gradientEnabled: false, gradientColors: 6,
  gradientStops: [{position:0,color:"#ef4444"},{position:.2,color:"#f59e0b"},{position:.4,color:"#84cc16"},{position:.6,color:"#06b6d4"},{position:.8,color:"#3b82f6"},{position:1,color:"#8b5cf6"}],
  halftone: false, halftoneSize: 2.4, halftoneContrast: 75, halftoneCycles: 2,
  chroma: false, chromaAmount: 1.5,
  exportFormat: "svg", gcodeProfile: "uunatek3", drawFeed: 3000, travelFeed: 6000, penUp: 0, penDown: -3, zFeed: 2000,
  svg: "", svgBytes: 0, toolpaths: [], dragging: false
};

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

export function computeContours(mesh, settings, quick){
  const t0 = performance.now();
  const W = settings.pw, H = settings.ph;
  const cam = cameraBasis(settings.az, settings.el, settings.roll);
  const P = project(mesh, cam, W, H, settings.margin, settings.zoom, settings.panX, settings.panY, settings.lens, settings.lensAmount);
  const field = scalarField(mesh, P, settings.axis, settings.cutAz, settings.cutEl);
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
  const serialiseGroup=runs=>{
    let d="";
    const plotRuns=[];
    for (const raw of runs){
      const run=simplify(raw,tolerance);
      if (run.length<4) continue;
      d+=serialiseRun(run,quality);
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
  let artwork, renderedPaths=paths, renderedNodes=nodes;
  if (settings.chroma){
    const amount=clamp(settings.chromaAmount, .1, 6);
    const rotation=amount*.12, cx=W/2, cy=H/2;
    const attrs=`fill="none" stroke-width="${settings.sw}" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:screen"`;
    artwork=`<rect width="${W}" height="${H}" fill="#000000"/>
<g style="isolation:isolate">
<path d="${allPathData}" stroke="#ff2020" transform="translate(${-amount} 0) rotate(${-rotation} ${cx} ${cy})" ${attrs}/>
<path d="${allPathData}" stroke="#25ff48" transform="translate(0 ${fmt(amount*.08)})" ${attrs}/>
<path d="${allPathData}" stroke="#2548ff" transform="translate(${amount} 0) rotate(${rotation} ${cx} ${cy})" ${attrs}/>
</g>`;
    renderedPaths*=3; renderedNodes*=3;
  } else {
    const bg=settings.bg ? `<rect width="${W}" height="${H}" fill="#ffffff"/>` : "";
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
    const outline=outlinePath ? `<path d="${outlinePath}" stroke="${settings.color}" ${attrs}/>` : "";
    artwork=`${bg}${groups}${outline}`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
${artwork}
</svg>`;
  const ms = performance.now() - t0;
  return {svg, toolpaths, paths:renderedPaths, nodes:renderedNodes, bytes:new TextEncoder().encode(svg).byteLength, ms, W, H, quick};
}

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
let requestId = 0, queuedRender = null, renderInFlight = false;
let renderTimer = 0, lastDispatch = 0, observedRenderMs = 0, meshVersion = 0;

function settingsSnapshot(){
  const {az,el,roll,zoom,panX,panY,lens,lensAmount,lines,gapEase,easeStrength,easeCycles,easeCenter,quality,axis,cutAz,cutEl,spiral,hide,sil,sw,color,gradientEnabled,gradientColors,gradientStops,pw,ph,margin,bg,halftone,halftoneSize,halftoneContrast,halftoneCycles,chroma,chromaAmount} = state;
  return {az,el,roll,zoom,panX,panY,lens,lensAmount,lines,gapEase,easeStrength,easeCycles,easeCenter,quality,axis,cutAz,cutEl,spiral,hide,sil,sw,color,gradientEnabled,gradientColors,gradientStops,pw,ph,margin,bg,halftone,halftoneSize,halftoneContrast,halftoneCycles,chroma,chromaAmount};
}
function throttleDelay(){
  const triangles = state.mesh ? state.mesh.T.length/3 : 0;
  const visibilityCost = state.hide ? 1.55 : 1;
  const curveCost = 1 + Math.max(0, state.quality-1)*.055;
  const score = triangles * state.lines * visibilityCost * curveCost;
  let complexityDelay = 150;
  if (score < 450000) complexityDelay = 16;
  else if (score < 1500000) complexityDelay = 32;
  else if (score < 4000000) complexityDelay = 60;
  else if (score < 9000000) complexityDelay = 100;
  // Adapt when a particular device or mesh is slower than the static estimate.
  return Math.min(180, Math.max(complexityDelay, observedRenderMs*.4));
}
function applyRender(result){
  observedRenderMs = observedRenderMs ? observedRenderMs*.72+result.ms*.28 : result.ms;
  state.svg = result.svg;
  state.svgBytes = result.bytes;
  state.toolpaths = result.toolpaths || [];
  fitBed(result.W, result.H);
  $("bed").innerHTML = result.svg;
  $("rPaths").textContent = result.paths.toLocaleString();
  $("rPts").textContent = Math.round(result.nodes).toLocaleString();
  updateExportSize();
  $("rMs").textContent = Math.round(result.ms) + " ms";
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
  // Preserve a queued final-quality request; otherwise only the latest input
  // matters. This coalesces pointer and slider events while the worker is busy.
  const renderQuick = quick && queuedRender?.quick !== false;
  queuedRender = {id:++requestId, meshVersion, quick:renderQuick, settings:settingsSnapshot()};
  scheduleRender();
}
renderWorker.addEventListener("message", ({data}) => {
  renderInFlight = false;
  if (data.meshVersion === meshVersion && data.type === "result") applyRender(data.result);
  else if (data.meshVersion === meshVersion && data.type === "error") showError(data.message);
  if (!queuedRender) $("bedwrap").classList.remove("busy");
  scheduleRender();
});
renderWorker.addEventListener("error", () => {
  renderInFlight = false;
  $("bedwrap").classList.remove("busy");
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
  torus: {name:"demo · ring torus", create:()=>ringTorus()}
};
function loadDemo(id, announce=true){
  const demo=demos[id];
  if (!demo) return;
  if (!demoCache.has(id)) demoCache.set(id, demo.create());
  rawCache=demoCache.get(id);
  state.svgSource=null;
  state.svgSourceName="";
  syncSVGControls();
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
      $("demo").value = "upload";
      // OBJ and PLY usually ship Y-up; STL is almost always Z-up
      const guessY = (ext === "obj" || ext === "ply");
      state.upY = guessY;
      $("upZ").setAttribute("aria-pressed", String(!guessY));
      $("upY").setAttribute("aria-pressed", String(guessY));
      syncSVGControls();
      setMesh(raw, file.name);
      toast("Loaded " + file.name);
    } catch(e){ showError(e.message); }
  };
  reader.onerror = () => showError("Could not read that file — check it isn't open in another program");
  reader.readAsArrayBuffer(file);
}

/* -------------------------------------------------------------- wiring */
function bindPair(id, key, after){
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
bindPair("halftoneSize","halftoneSize"); bindPair("halftoneContrast","halftoneContrast"); bindPair("halftoneCycles","halftoneCycles");
bindPair("gradientColors","gradientColors");
bindPair("cutAz","cutAz",activateCustomAxis); bindPair("cutEl","cutEl",activateCustomAxis);
bindExportPair("drawFeed","drawFeed"); bindExportPair("travelFeed","travelFeed"); bindExportPair("penUp","penUp"); bindExportPair("penDown","penDown"); bindExportPair("zFeed","zFeed");

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
$("halftone").addEventListener("change", e => {
  state.halftone=e.target.checked;
  if (state.halftone && state.chroma){ state.chroma=false; $("chroma").checked=false; }
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
  syncHalftoneControls();
  syncChromaAmount();
  redraw(false);
});
$("gradientEnabled").addEventListener("change", e => {
  state.gradientEnabled=e.target.checked;
  $("gradientEditor").classList.toggle("enabled",state.gradientEnabled);
  if (state.gradientEnabled && state.chroma){ state.chroma=false; $("chroma").checked=false; }
  syncChromaAmount();
  redraw(false);
});
$("gradientEditor").addEventListener("gradientchange", e => {
  state.gradientStops=e.detail.stops;
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
function activateCustomAxis(){
  state.axis = "custom";
  $("axis").value = "custom";
  $("customAxis").hidden = false;
}
for (const id of ["pw","ph"]) $(id).addEventListener("input", e => {
  const v = clamp(parseFloat(e.target.value)||10, 10, 2000);
  state[id] = v; redraw(true);
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
$("demo").addEventListener("change", e => loadDemo(e.target.value));
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

/* ------------------------------------------------------ randomization */
function randomIn(min, max){ return min + Math.random()*(max-min); }
function randomInt(min, max){ return Math.floor(randomIn(min, max+1)); }
function randomItem(items){ return items[Math.floor(Math.random()*items.length)]; }
function setPairValue(id, key, value){
  const slider=$(id), number=$(id+"N");
  const step=parseFloat(number.step) || 1;
  const precision=(String(number.step).split(".")[1] || "").length;
  const next=Number((Math.round(value/step)*step).toFixed(precision));
  state[key]=next;
  slider.value=next;
  number.value=next;
}
function setCheckbox(id, key, value){
  state[key]=value;
  $(id).checked=value;
}

$("randomize").addEventListener("click", () => {
  // Keep the loaded source and physical sheet size stable; randomize the
  // creative choices that shape the contour study.
  setPairValue("az", "az", randomInt(-180, 180));
  setPairValue("el", "el", randomInt(-70, 70));
  setPairValue("rl", "roll", randomInt(-35, 35));
  setPairValue("zoom", "zoom", randomIn(.72, 1.28));

  state.lens=randomItem(["clean", "clean", "wide", "fisheye", "tele"]);
  $("lens").value=state.lens;
  setPairValue("lensAmount", "lensAmount", randomInt(45, 145));
  syncLensAmount();

  setPairValue("lines", "lines", randomInt(22, 84));
  setPairValue("quality", "quality", randomInt(5, 9));
  state.gapEase=randomItem([
    "linear", "sine-in", "sine-out", "sine-in-out", "sine-out-in",
    "ease-in", "ease-out", "ease-in-out", "ease-out-in",
    "cubic-in", "cubic-out", "cubic-in-out", "cubic-out-in"
  ]);
  $("gapEase").value=state.gapEase;
  setPairValue("easeStrength", "easeStrength", randomInt(55, 185));
  setPairValue("easeCycles", "easeCycles", randomItem([1, 1, 1, 2, 2, 3]));
  setPairValue("easeCenter", "easeCenter", randomInt(25, 75));
  syncEaseCenter();

  state.axis=randomItem(["up", "up", "cam", "x", "y", "custom"]);
  $("axis").value=state.axis;
  $("customAxis").hidden=state.axis !== "custom";
  setPairValue("cutAz", "cutAz", randomInt(-180, 180));
  setPairValue("cutEl", "cutEl", randomInt(-80, 80));
  setCheckbox("spiral", "spiral", Math.random() < .22);
  setCheckbox("hide", "hide", Math.random() < .82);
  setCheckbox("sil", "sil", Math.random() < .78);

  setPairValue("sw", "sw", randomIn(.15, .7));
  setPairValue("margin", "margin", randomInt(8, 24));
  const inks=["#15181a", "#172554", "#3f1d2e", "#18392b", "#4a2519", "#30234d"];
  state.color=randomItem(inks);
  $("color").value=state.color;
  $("colorHex").value=state.color;
  $("swatch").style.background=state.color;

  const colourMode=randomItem(["ink", "ink", "gradient", "halftone", "chroma"]);
  state.gradientEnabled=colourMode === "gradient";
  $("gradientEnabled").checked=state.gradientEnabled;
  $("gradientEditor").classList.toggle("enabled", state.gradientEnabled);
  setPairValue("gradientColors", "gradientColors", randomInt(3, 10));
  state.halftone=colourMode === "halftone";
  $("halftone").checked=state.halftone;
  setPairValue("halftoneSize", "halftoneSize", randomIn(1.2, 4.8));
  setPairValue("halftoneContrast", "halftoneContrast", randomInt(55, 100));
  setPairValue("halftoneCycles", "halftoneCycles", randomInt(1, 5));
  syncHalftoneControls();
  state.chroma=colourMode === "chroma";
  $("chroma").checked=state.chroma;
  setPairValue("chromaAmount", "chromaAmount", randomIn(.6, 3.2));
  syncChromaAmount();

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
    effects:{halftone:state.halftone,chroma:state.chroma}
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
$("save").addEventListener("click", () => {
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
});
$("copy").addEventListener("click", async () => {
  const exported=currentExport();
  try{ await navigator.clipboard.writeText(exported.content); toast(exported.extension==="svg" ? "SVG markup copied" : "G-code copied"); }
  catch{ toast("Copy blocked — use Export " + (exported.extension==="svg" ? "SVG" : "G-code")); }
});
let toastT;
function toast(msg){
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 1900);
}

/* boot with the demo knot so the tool works before anything is uploaded */
loadDemo("knot", false);
window.addEventListener("resize", () => redraw(true));
}
