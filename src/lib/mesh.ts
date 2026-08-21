'use strict';

export type RawMesh = {
  verts: Float32Array | Float64Array;
  tris: Uint32Array;
};

export type ParsedMesh = {
  verts: Float64Array;
  tris: Uint32Array;
};

export type NormalizedMesh = {
  V: Float32Array;
  T: Uint32Array;
};

type PlyProperty =
  | { list: false; type: string; name: string }
  | { list: true; countType: string; type: string; name: string };

type PlyElement = {
  name: string;
  count: number;
  props: PlyProperty[];
};

/* ------------------------------------------------------------- parsing */
function parseSTL(buf: ArrayBuffer): ParsedMesh {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) return parseSTLBinary(dv, n);
  }
  const txt = new TextDecoder().decode(new Uint8Array(buf));
  if (/facet\s+normal/i.test(txt)) return parseSTLAscii(txt);
  throw new Error("That file isn't readable as STL — re-export it as binary or ASCII STL");
}
function parseSTLBinary(dv: DataView, n: number): ParsedMesh {
  const verts = new Float64Array(n * 9),
    tris = new Uint32Array(n * 3);
  let o = 84;
  for (let i = 0; i < n; i++) {
    o += 12; // skip stored normal
    for (let k = 0; k < 3; k++) {
      verts[i * 9 + k * 3] = dv.getFloat32(o, true);
      verts[i * 9 + k * 3 + 1] = dv.getFloat32(o + 4, true);
      verts[i * 9 + k * 3 + 2] = dv.getFloat32(o + 8, true);
      o += 12;
      tris[i * 3 + k] = i * 3 + k;
    }
    o += 2; // attribute byte count
  }
  return { verts, tris };
}
function parseSTLAscii(txt: string): ParsedMesh {
  const v: number[] = [];
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) v.push(+m[1], +m[2], +m[3]);
  const n = Math.floor(v.length / 9) * 3;
  const tris = new Uint32Array(n);
  for (let i = 0; i < n; i++) tris[i] = i;
  return { verts: Float64Array.from(v.slice(0, n * 3)), tris };
}

function parseOBJ(text: string): ParsedMesh {
  const v: number[] = [],
    f: number[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.charCodeAt(0) === 118 && line[1] === ' ') {
      // "v "
      const p = line.split(/\s+/);
      v.push(+p[1], +p[2], +p[3]);
    } else if (line.charCodeAt(0) === 102 && (line[1] === ' ' || line[1] === '\t')) {
      // "f "
      const p = line.trim().split(/\s+/);
      const idx: number[] = [];
      for (let i = 1; i < p.length; i++) {
        const s = p[i].split('/')[0];
        if (!s) continue;
        const n = parseInt(s, 10);
        if (Number.isNaN(n)) continue;
        idx.push(n > 0 ? n - 1 : v.length / 3 + n);
      }
      for (let i = 1; i + 1 < idx.length; i++) f.push(idx[0], idx[i], idx[i + 1]); // fan
    }
  }
  if (!v.length || !f.length)
    throw new Error('No faces in that OBJ — it may be a point cloud or curve-only export');
  return { verts: Float64Array.from(v), tris: Uint32Array.from(f) };
}

function parsePLY(buf: ArrayBuffer): ParsedMesh {
  const bytes = new Uint8Array(buf);
  const headTxt = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 20000)));
  const endIdx = headTxt.indexOf('end_header');
  if (endIdx < 0) throw new Error("That file isn't readable as PLY — the header is missing");
  const headEnd = headTxt.indexOf('\n', endIdx) + 1;
  const header = headTxt.slice(0, headEnd).split(/\r?\n/);
  let fmtType = 'ascii',
    cur: PlyElement | null = null;
  const elems: PlyElement[] = [];
  for (const raw of header) {
    const t = raw.trim().split(/\s+/);
    if (t[0] === 'format') fmtType = t[1];
    else if (t[0] === 'element') {
      cur = { name: t[1], count: +t[2], props: [] };
      elems.push(cur);
    } else if (t[0] === 'property' && cur) {
      if (t[1] === 'list') cur.props.push({ list: true, countType: t[2], type: t[3], name: t[4] });
      else cur.props.push({ list: false, type: t[1], name: t[2] });
    }
  }
  const vEl = elems.find((e) => e.name === 'vertex');
  const fEl = elems.find((e) => e.name === 'face');
  if (!vEl) throw new Error('PLY has no vertex element');
  const verts = new Float64Array(vEl.count * 3);
  const faces: number[] = [];

  if (fmtType === 'ascii') {
    const body = new TextDecoder().decode(bytes.subarray(headEnd)).split(/\r?\n/);
    let li = 0;
    const next = (): string[] => {
      while (li < body.length && !body[li].trim()) li++;
      return body[li++].trim().split(/\s+/);
    };
    const xi = vEl.props.findIndex((p) => p.name === 'x'),
      yi = vEl.props.findIndex((p) => p.name === 'y'),
      zi = vEl.props.findIndex((p) => p.name === 'z');
    for (let i = 0; i < vEl.count; i++) {
      const t = next();
      verts[i * 3] = +t[xi];
      verts[i * 3 + 1] = +t[yi];
      verts[i * 3 + 2] = +t[zi];
    }
    if (fEl)
      for (let i = 0; i < fEl.count; i++) {
        const t = next(),
          k = +t[0];
        for (let j = 1; j + 1 < k; j++) faces.push(+t[1], +t[j + 1], +t[j + 2]);
      }
  } else {
    const le = fmtType.indexOf('little') >= 0;
    const dv = new DataView(buf);
    let o = headEnd;
    const read = (type: string): number => {
      switch (type) {
        case 'char':
        case 'int8':
          return dv.getInt8(o++);
        case 'uchar':
        case 'uint8':
          return dv.getUint8(o++);
        case 'short':
        case 'int16': {
          const r = dv.getInt16(o, le);
          o += 2;
          return r;
        }
        case 'ushort':
        case 'uint16': {
          const r = dv.getUint16(o, le);
          o += 2;
          return r;
        }
        case 'int':
        case 'int32': {
          const r = dv.getInt32(o, le);
          o += 4;
          return r;
        }
        case 'uint':
        case 'uint32': {
          const r = dv.getUint32(o, le);
          o += 4;
          return r;
        }
        case 'float':
        case 'float32': {
          const r = dv.getFloat32(o, le);
          o += 4;
          return r;
        }
        case 'double':
        case 'float64': {
          const r = dv.getFloat64(o, le);
          o += 8;
          return r;
        }
        default:
          throw new Error('Unsupported PLY property type: ' + type);
      }
    };
    for (const el of elems) {
      for (let i = 0; i < el.count; i++) {
        if (el === vEl) {
          const rec: Record<string, number> = {};
          for (const p of el.props) {
            if (p.list) {
              const k = read(p.countType);
              for (let j = 0; j < k; j++) read(p.type);
            } else rec[p.name] = read(p.type);
          }
          verts[i * 3] = rec.x;
          verts[i * 3 + 1] = rec.y;
          verts[i * 3 + 2] = rec.z;
        } else if (el === fEl) {
          let poly: number[] | null = null;
          for (const p of el.props) {
            if (p.list) {
              const k = read(p.countType),
                arr = [];
              for (let j = 0; j < k; j++) arr.push(read(p.type));
              if (!poly) poly = arr;
            } else read(p.type);
          }
          if (poly)
            for (let j = 1; j + 1 < poly.length; j++) faces.push(poly[0], poly[j], poly[j + 1]);
        } else {
          for (const p of el.props) {
            if (p.list) {
              const k = read(p.countType);
              for (let j = 0; j < k; j++) read(p.type);
            } else read(p.type);
          }
        }
      }
    }
  }
  if (!faces.length) throw new Error("PLY has no faces (point clouds aren't supported)");
  return { verts, tris: Uint32Array.from(faces) };
}

/* ------------------------------------------------- weld + normalise */
function weld(raw: RawMesh): NormalizedMesh {
  const { verts, tris } = raw;
  let minx = Infinity,
    miny = Infinity,
    minz = Infinity,
    maxx = -Infinity,
    maxy = -Infinity,
    maxz = -Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i],
      y = verts[i + 1],
      z = verts[i + 2];
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
    if (z < minz) minz = z;
    if (z > maxz) maxz = z;
  }
  const diag = Math.hypot(maxx - minx, maxy - miny, maxz - minz) || 1;
  const q = diag * 1e-6;
  const map = new Map<string, number>();
  const out: number[] = [];
  const remap = new Uint32Array(verts.length / 3);
  for (let i = 0, vi = 0; i < verts.length; i += 3, vi++) {
    const key =
      Math.round(verts[i] / q) +
      '_' +
      Math.round(verts[i + 1] / q) +
      '_' +
      Math.round(verts[i + 2] / q);
    let id = map.get(key);
    if (id === undefined) {
      id = out.length / 3;
      map.set(key, id);
      out.push(verts[i], verts[i + 1], verts[i + 2]);
    }
    remap[vi] = id;
  }
  const t2 = new Uint32Array(tris.length);
  let n = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const a = remap[tris[i]],
      b = remap[tris[i + 1]],
      c = remap[tris[i + 2]];
    if (a === b || b === c || a === c) continue; // drop degenerates
    t2[n++] = a;
    t2[n++] = b;
    t2[n++] = c;
  }
  // recentre on the bbox middle, scale so the bounding sphere radius is 1
  const cx = (minx + maxx) / 2,
    cy = (miny + maxy) / 2,
    cz = (minz + maxz) / 2;
  const V = new Float32Array(out.length);
  let r2 = 0;
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i] - cx,
      y = out[i + 1] - cy,
      z = out[i + 2] - cz;
    V[i] = x;
    V[i + 1] = y;
    V[i + 2] = z;
    const d = x * x + y * y + z * z;
    if (d > r2) r2 = d;
  }
  const r = Math.sqrt(r2) || 1;
  for (let i = 0; i < V.length; i++) V[i] /= r;
  return { V, T: t2.subarray(0, n) };
}

function vertexNormals(V: Float32Array, T: Uint32Array): Float32Array {
  const N = new Float32Array(V.length);
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i] * 3,
      b = T[i + 1] * 3,
      c = T[i + 2] * 3;
    const abx = V[b] - V[a],
      aby = V[b + 1] - V[a + 1],
      abz = V[b + 2] - V[a + 2];
    const acx = V[c] - V[a],
      acy = V[c + 1] - V[a + 1],
      acz = V[c + 2] - V[a + 2];
    const nx = aby * acz - abz * acy,
      ny = abz * acx - abx * acz,
      nz = abx * acy - aby * acx;
    N[a] += nx;
    N[a + 1] += ny;
    N[a + 2] += nz;
    N[b] += nx;
    N[b + 1] += ny;
    N[b + 2] += nz;
    N[c] += nx;
    N[c + 1] += ny;
    N[c + 2] += nz;
  }
  for (let i = 0; i < N.length; i += 3) {
    const len = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= len;
    N[i + 1] /= len;
    N[i + 2] /= len;
  }
  return N;
}

export { parseOBJ, parsePLY, parseSTL, vertexNormals, weld };
