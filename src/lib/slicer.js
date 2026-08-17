"use strict";
/* =====================================================================
   Slicewise — mesh → contour SVG
   Pipeline: parse → weld → orient → project → slice → chain → hide → SVG
   ===================================================================== */

/* ---------------------------------------------------------------- utils */
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const fmt = n => {
  const r = Math.round(n*100)/100;
  return Number.isInteger(r) ? String(r) : String(r);
};

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

/* ------------------------------------------------- marching triangles */
function sliceLevel(P, mesh, S, level, NV, scalarDir, curveStrength){
  // returns {pts:[x,y,d,...], segs:[i,j,...]} for one cutting plane
  const {T, V, N} = mesh;
  const idx = new Map();          // edge key -> point index
  const pts = [], segs = [];
  const {sx, sy, sd, r, u, f, scale, ox, oy} = P;
  const getPoint = (a, b) => {
    const key = a < b ? a*NV + b : b*NV + a;
    let id = idx.get(key);
    if (id !== undefined) return id;
    let t = (level - S[a]) / (S[b] - S[a]);
    id = pts.length/3;
    if (!curveStrength || !N){
      pts.push(sx[a] + (sx[b]-sx[a])*t, sy[a] + (sy[b]-sy[a])*t, sd[a] + (sd[b]-sd[a])*t);
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
    pts.push(
      ox+(p[0]*r[0]+p[1]*r[1]+p[2]*r[2])*scale,
      oy-(p[0]*u[0]+p[1]*u[1]+p[2]*u[2])*scale,
      p[0]*f[0]+p[1]*f[1]+p[2]*f[2]
    );
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
  az: 35, el: 24, roll: 0, zoom: 1,
  lines: 40, quality: 7, axis: "up", cutAz: 0, cutEl: 90, hide: true, sil: true,
  sw: 0.35, color: "#15181a", pw: 210, ph: 210, margin: 14, bg: false,
  chroma: false, chromaAmount: 1.5,
  svg: "", dragging: false
};

function project(mesh, cam, W, H, margin, zoom){
  const {V} = mesh;
  const n = V.length/3;
  const sx = new Float32Array(n), sy = new Float32Array(n), sd = new Float32Array(n);
  const {f, r, u} = cam;
  const scale = (Math.min(W, H)/2 - margin) * zoom;   // radius-1 model, rotation-stable fit
  const ox = W/2, oy = H/2;
  let dmin = Infinity, dmax = -Infinity;
  for (let i=0, v=0; i<V.length; i+=3, v++){
    const x=V[i], y=V[i+1], z=V[i+2];
    sx[v] = ox + (x*r[0] + y*r[1] + z*r[2]) * scale;
    sy[v] = oy - (x*u[0] + y*u[1] + z*u[2]) * scale;   // SVG y grows downward
    const d = x*f[0] + y*f[1] + z*f[2];
    sd[v] = d;
    if (d<dmin) dmin=d; if (d>dmax) dmax=d;
  }
  return {sx, sy, sd, dmin, dmax, scale, ox, oy, f, r, u};
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

export function computeContours(mesh, settings, quick){
  const t0 = performance.now();
  const W = settings.pw, H = settings.ph;
  const cam = cameraBasis(settings.az, settings.el, settings.roll);
  const P = project(mesh, cam, W, H, settings.margin, settings.zoom);
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

  const out = [];
  const N = settings.lines;
  const quality = clamp(Math.round(settings.quality), 1, 10);
  const curveStrength = (quality-1)/9;
  const span = field.max - field.min;
  for (let i=0;i<N;i++){
    const level = field.min + span * (i + 0.5) / N;
    const {pts, segs} = sliceLevel(P, mesh, field.S, level, NV, field.dir, curveStrength);
    if (!segs.length) continue;
    for (const poly of chain(pts, segs)) emitPath(poly, pts, vis, step, out);
  }
  if (settings.sil){
    const {pts, segs} = silhouetteEdges(mesh, P);
    if (segs.length){
      for (const poly of chain(pts, segs)) emitPath(poly, pts, visOutline, step, out);
    }
  }

  // ---- serialise: RDP concentrates anchors where deviation is greatest;
  // curved spans use Béziers while flat spans remain compact straight lines.
  let d = "", nodes = 0, paths = 0;
  for (const raw of out){
    const tolerance = 0.06 * Math.pow(0.72, quality-1);
    const run = simplify(raw, tolerance);
    if (run.length < 4) continue;
    d += serialiseRun(run, quality);
    nodes += run.length/2; paths++;
  }
  let artwork, renderedPaths=paths, renderedNodes=nodes;
  if (settings.chroma){
    const amount=clamp(settings.chromaAmount, .1, 6);
    const rotation=amount*.12, cx=W/2, cy=H/2;
    const attrs=`fill="none" stroke-width="${settings.sw}" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:screen"`;
    artwork=`<rect width="${W}" height="${H}" fill="#000000"/>
<g style="isolation:isolate">
<path d="${d}" stroke="#ff2020" transform="translate(${-amount} 0) rotate(${-rotation} ${cx} ${cy})" ${attrs}/>
<path d="${d}" stroke="#25ff48" transform="translate(0 ${fmt(amount*.08)})" ${attrs}/>
<path d="${d}" stroke="#2548ff" transform="translate(${amount} 0) rotate(${rotation} ${cx} ${cy})" ${attrs}/>
</g>`;
    renderedPaths*=3; renderedNodes*=3;
  } else {
    const bg=settings.bg ? `<rect width="${W}" height="${H}" fill="#ffffff"/>` : "";
    artwork=`${bg}<g fill="none" stroke="${settings.color}" stroke-width="${settings.sw}" stroke-linecap="round" stroke-linejoin="round">
<path d="${d}"/>
</g>`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
${artwork}
</svg>`;
  const ms = performance.now() - t0;
  return {svg, paths:renderedPaths, nodes:renderedNodes, bytes:new TextEncoder().encode(svg).byteLength, ms, W, H, quick};
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
  const {az,el,roll,zoom,lines,quality,axis,cutAz,cutEl,hide,sil,sw,color,pw,ph,margin,bg,chroma,chromaAmount} = state;
  return {az,el,roll,zoom,lines,quality,axis,cutAz,cutEl,hide,sil,sw,color,pw,ph,margin,bg,chroma,chromaAmount};
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
  fitBed(result.W, result.H);
  $("bed").innerHTML = result.svg;
  $("rPaths").textContent = result.paths.toLocaleString();
  $("rPts").textContent = Math.round(result.nodes).toLocaleString();
  $("rSize").textContent = (result.bytes/1024).toFixed(1) + " kB";
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
  state.upY=false;
  $("upZ").setAttribute("aria-pressed", "true");
  $("upY").setAttribute("aria-pressed", "false");
  setMesh(rawCache, demo.name);
  if (announce) toast("Loaded " + demo.name.replace("demo · ", ""));
}
function loadFile(file){
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const reader = new FileReader();
  reader.onload = () => {
    try{
      let raw;
      if (ext === "stl") raw = parseSTL(reader.result);
      else if (ext === "obj") raw = parseOBJ(new TextDecoder().decode(new Uint8Array(reader.result)));
      else if (ext === "ply") raw = parsePLY(reader.result);
      else throw new Error("Unsupported format: ." + ext + " — use STL, OBJ or PLY");
      if (!raw.tris.length) throw new Error("No triangles found in " + file.name);
      rawCache = raw;
      $("demo").value = "upload";
      // OBJ and PLY usually ship Y-up; STL is almost always Z-up
      const guessY = (ext === "obj" || ext === "ply");
      state.upY = guessY;
      $("upZ").setAttribute("aria-pressed", String(!guessY));
      $("upY").setAttribute("aria-pressed", String(guessY));
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
bindPair("az","az"); bindPair("el","el"); bindPair("rl","roll"); bindPair("zoom","zoom");
bindPair("lines","lines"); bindPair("quality","quality"); bindPair("sw","sw"); bindPair("margin","margin");
bindPair("chromaAmount","chromaAmount");
bindPair("cutAz","cutAz",activateCustomAxis); bindPair("cutEl","cutEl",activateCustomAxis);

$("axis").addEventListener("change", e => {
  state.axis = e.target.value;
  $("customAxis").hidden = state.axis !== "custom";
  redraw(false);
});
$("hide").addEventListener("change", e => { state.hide = e.target.checked; redraw(false); });
$("sil").addEventListener("change", e => { state.sil = e.target.checked; redraw(false); });
$("bg").addEventListener("change", e => { state.bg = e.target.checked; redraw(false); });
$("chroma").addEventListener("change", e => { state.chroma = e.target.checked; redraw(false); });
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
  let sx=0, sy=0, az0=0, el0=0, ro0=0, shift=false, id=null;
  let wheelEnd = 0;
  bed.addEventListener("pointerdown", e => {
    id = e.pointerId; bed.setPointerCapture(id);
    sx = e.clientX; sy = e.clientY; az0 = state.az; el0 = state.el; ro0 = state.roll;
    shift = e.shiftKey; state.dragging = true; bed.classList.add("dragging");
  });
  bed.addEventListener("pointermove", e => {
    if (!state.dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (shift){
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
    state.dragging = false; bed.classList.remove("dragging");
    redraw(false);
  };
  bed.addEventListener("pointerup", end);
  bed.addEventListener("pointercancel", end);
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

/* export */
$("save").addEventListener("click", () => {
  if (!state.svg) return;
  const base = state.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g,"-").replace(/^-|-$/g,"") || "contours";
  const blob = new Blob([state.svg], {type:"image/svg+xml"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = base + "-contours.svg";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Saved " + a.download);
});
$("copy").addEventListener("click", async () => {
  try{ await navigator.clipboard.writeText(state.svg); toast("SVG markup copied"); }
  catch{ toast("Copy blocked — use Save SVG"); }
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
