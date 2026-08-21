"use strict";

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
        const s = p[i].split('/')[0];
        if (!s) continue;
        const n = parseInt(s,10);
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
  let fmtType = "ascii", cur = null;
  const elems = [];
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
          const rec: Record<string, number> = {};
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
  const n0 = norm(cross(T[0], Math.abs(T[0][2])<0.9 ? [0,0,1] : [1,0,0]));
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
      } else if (kind === "diamond"){
        const p=1.65;
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

function radialColumnDemo(kind, segments=160, rings=80){
  const verts=[], tris=[];
  for (let i=0;i<=rings;i++){
    const t=i/rings, z=t*2-1;
    for (let j=0;j<segments;j++){
      const theta=j/segments*Math.PI*2;
      let radius;
      if (kind === "twist"){
        const profile=.68+.08*Math.cos(z*Math.PI);
        radius=profile*(1+.18*Math.cos(theta*5+z*Math.PI*1.35));
      } else {
        radius=.34+.4*Math.pow(Math.abs(z),1.55)+.035*Math.cos(z*Math.PI*3);
      }
      verts.push(radius*Math.cos(theta),radius*Math.sin(theta),z);
    }
  }
  for (let i=0;i<rings;i++) for (let j=0;j<segments;j++){
    const a=i*segments+j, b=i*segments+(j+1)%segments;
    const c=(i+1)*segments+j, d=(i+1)*segments+(j+1)%segments;
    tris.push(a,b,d,a,d,c);
  }
  const bottom=verts.length/3;
  verts.push(0,0,-1);
  const top=verts.length/3;
  verts.push(0,0,1);
  const topRing=rings*segments;
  for (let j=0;j<segments;j++){
    const next=(j+1)%segments;
    tris.push(bottom,next,j);
    tris.push(top,topRing+j,topRing+next);
  }
  return {verts:Float64Array.from(verts),tris:Uint32Array.from(tris)};
}

function tetrapodDemo(segments=160,rings=80){
  const verts=[],tris=[];
  const tripodRadius=Math.sqrt(8/9);
  const directions=[
    [0,0,1],
    [tripodRadius,0,-1/3],
    [tripodRadius*Math.cos(Math.PI*2/3),tripodRadius*Math.sin(Math.PI*2/3),-1/3],
    [tripodRadius*Math.cos(Math.PI*4/3),tripodRadius*Math.sin(Math.PI*4/3),-1/3]
  ];
  for (let i=0;i<=rings;i++){
    const phi=i/rings*Math.PI,sp=Math.sin(phi),cp=Math.cos(phi);
    for (let j=0;j<segments;j++){
      const theta=j/segments*Math.PI*2;
      const x=sp*Math.cos(theta),y=sp*Math.sin(theta),z=cp;
      let alignment=-1;
      for (const direction of directions){
        alignment=Math.max(alignment,x*direction[0]+y*direction[1]+z*direction[2]);
      }
      // Envelope of four tapered cones. Capping the radial distance at the
      // axial leg length produces the tetrapod's characteristic flat feet.
      const perpendicular=Math.sqrt(Math.max(0,1-alignment*alignment));
      const coneRadius=.52/(perpendicular+.28*alignment);
      const flatEndRadius=1/alignment;
      const radius=Math.min(coneRadius,flatEndRadius);
      verts.push(x*radius,y*radius,z*radius);
    }
  }
  for (let i=0;i<rings;i++) for (let j=0;j<segments;j++){
    const a=i*segments+j,b=i*segments+(j+1)%segments;
    const c=(i+1)*segments+j,d=(i+1)*segments+(j+1)%segments;
    tris.push(a,b,d,a,d,c);
  }
  return {verts:Float64Array.from(verts),tris:Uint32Array.from(tris)};
}

export {
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
};
