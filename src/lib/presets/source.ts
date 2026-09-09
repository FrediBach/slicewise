import { BUILTIN_SOURCES } from '../builtin-sources';
import type { AppState, RawMesh, RenderMesh } from '../app-state';
import { parseOBJ, parsePLY, parseSTL, weld, vertexNormals } from '../mesh';
import { generateHyperbolicTiling } from '../hyperbolic-tiling';
import { proceduralSourceKey } from '../procedural-source';
import { PresetError } from './types';

export interface SourceAssetBytes {
  name: string;
  bytes: Uint8Array;
}
export interface PreparedSource {
  mesh: RenderMesh;
  raw: RawMesh | null;
  svg: string | null;
}
export interface SourceParsers {
  svg(text: string, depth: number, rounded: boolean, roundness: number): Promise<RawMesh>;
  centerlines(
    text: string,
    pruning: number,
  ): Promise<{ points: Float32Array | Float64Array; offsets: Uint32Array }>;
  generated(settings: Partial<AppState>): Promise<RawMesh>;
}

export function normalizedSourceMesh(raw: RawMesh, settings: Partial<AppState>): RenderMesh {
  if (
    !raw.verts.length ||
    raw.verts.length % 3 ||
    !raw.tris.length ||
    raw.tris.length % 3 ||
    raw.tris.length > 6_000_000 ||
    raw.verts.length > 18_000_000 ||
    !raw.verts.every(Number.isFinite) ||
    !raw.tris.every((index) => index < raw.verts.length / 3)
  )
    throw new PresetError('asset', 'Source geometry is invalid or exceeds the mesh budget.');
  const mesh = weld(raw);
  if (!mesh.T.length || !mesh.V.every(Number.isFinite))
    throw new PresetError('asset', 'Source has no valid triangles after normalization.');
  if (settings.upY)
    for (let i = 0; i < mesh.V.length; i += 3) {
      const y = mesh.V[i + 1];
      mesh.V[i + 1] = -mesh.V[i + 2];
      mesh.V[i + 2] = y;
    }
  return {
    ...mesh,
    N: vertexNormals(mesh.V, mesh.T),
    terrain: settings.source === 'terrain' && !settings.upY,
    proceduralKey: proceduralSourceKey({
      ...settings,
      proceduralSource:
        settings.source === 'generative' || settings.source === 'terrain'
          ? settings.source
          : undefined,
      proceduralUpY: settings.upY,
    }),
  } as RenderMesh;
}

export async function preparePresetSource(
  settings: Partial<AppState>,
  asset: SourceAssetBytes | null,
  parsers: SourceParsers,
): Promise<PreparedSource> {
  let raw: RawMesh;
  let svg: string | null = null;
  if (settings.source === 'upload') {
    if (!asset) throw new PresetError('asset', 'This preset needs its uploaded source file.');
    const extension = asset.name.split('.').pop()?.toLowerCase();
    const buffer = new Uint8Array(asset.bytes).buffer;
    if (extension === 'svg') {
      svg = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      if (settings.svgMode === 'centerline') {
        const lines = await parsers.centerlines(svg, settings.svgCenterlinePruning!);
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        for (let i = 0; i < lines.points.length; i += 2) {
          minX = Math.min(minX, lines.points[i]);
          maxX = Math.max(maxX, lines.points[i]);
          minY = Math.min(minY, lines.points[i + 1]);
          maxY = Math.max(maxY, lines.points[i + 1]);
        }
        const x = (minX + maxX) / 2,
          y = (minY + maxY) / 2;
        let radius = 0;
        for (let i = 0; i < lines.points.length; i += 2)
          radius = Math.max(radius, Math.hypot(lines.points[i] - x, lines.points[i + 1] - y));
        if (!Number.isFinite(radius) || radius <= 0)
          throw new PresetError('asset', 'SVG centreline has no measurable span.');
        const V = new Float32Array((lines.points.length / 2) * 3);
        for (let i = 0; i < lines.points.length / 2; i++) {
          V[i * 3] = (lines.points[i * 2] - x) / radius;
          V[i * 3 + 1] = -(lines.points[i * 2 + 1] - y) / radius;
        }
        return {
          mesh: {
            V,
            T: new Uint32Array(),
            N: new Float32Array(V.length),
            lineArt: { offsets: lines.offsets },
          },
          raw: null,
          svg,
        };
      }
      raw = await parsers.svg(
        svg,
        settings.svgDepth!,
        settings.svgRounded!,
        settings.svgRoundness!,
      );
    } else if (extension === 'stl') raw = parseSTL(buffer);
    else if (extension === 'obj') raw = parseOBJ(new TextDecoder().decode(buffer));
    else if (extension === 'ply') raw = parsePLY(buffer);
    else throw new PresetError('asset', 'Source must be an STL, OBJ, PLY, or SVG file.');
  } else if (settings.source === 'hyperbolic-tiling') {
    const tiling = generateHyperbolicTiling({
      p: settings.tilingP!,
      q: settings.tilingQ!,
      depth: settings.tilingDepth!,
      maxEdges: 12_000,
    });
    const V = new Float32Array((tiling.points.length / 2) * 3);
    for (let i = 0; i < tiling.points.length / 2; i++) {
      V[i * 3] = tiling.points[i * 2];
      V[i * 3 + 1] = tiling.points[i * 2 + 1];
    }
    return {
      mesh: {
        V,
        T: new Uint32Array(),
        N: new Float32Array(V.length),
        lineArt: { offsets: tiling.offsets, kind: 'hyperbolic-tiling' },
      },
      raw: null,
      svg: null,
    };
  } else if (settings.source === 'generative' || settings.source === 'terrain')
    raw = await parsers.generated(settings);
  else if (Object.hasOwn(BUILTIN_SOURCES, settings.source!))
    raw = BUILTIN_SOURCES[settings.source!].create();
  else throw new PresetError('incompatible', 'Unsupported source.');
  return { mesh: normalizedSourceMesh(raw!, settings), raw, svg };
}
