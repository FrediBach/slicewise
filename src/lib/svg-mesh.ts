import { ExtrudeGeometry, type Shape, type Vector2 } from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { ParsedMesh } from './mesh';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function parseSVG(
  text: string,
  depthPercent = 12,
  rounded = false,
  roundnessPercent = 25,
): ParsedMesh {
  let data;
  try {
    data = new SVGLoader().parse(text);
  } catch {
    throw new Error("That file isn't readable as SVG — check that its paths are valid");
  }

  const shapes: Shape[] = [];
  for (const path of data.paths) {
    const style = path.userData?.style as { fill?: string } | undefined;
    if (style?.fill === 'none') continue;
    shapes.push(...path.toShapes());
  }
  if (!shapes.length)
    throw new Error('No filled shapes found in that SVG — convert strokes to outlines first');

  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  const include = (point: Vector2): void => {
    if (point.x < minx) minx = point.x;
    if (point.x > maxx) maxx = point.x;
    if (point.y < miny) miny = point.y;
    if (point.y > maxy) maxy = point.y;
  };
  for (const shape of shapes) {
    shape.getPoints(24).forEach(include);
    shape.holes.forEach((hole) => hole.getPoints(24).forEach(include));
  }
  const span = Math.max(maxx - minx, maxy - miny);
  if (!Number.isFinite(span) || span <= 0) throw new Error('The SVG has no measurable filled area');

  const depth = (span * clamp(depthPercent, 0.5, 100)) / 100;
  const maxRadius = Math.min(depth / 2, span * 0.25);
  const bevel = rounded ? (maxRadius * clamp(roundnessPercent, 0, 100)) / 100 : 0;
  const verts: number[] = [],
    tris: number[] = [];
  for (const shape of shapes) {
    const sourceGeometry = new ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      curveSegments: 24,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: bevel > 0 ? 5 : 0,
    });
    const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry;
    const position = geometry.getAttribute('position');
    const base = verts.length / 3;
    for (let i = 0; i < position.count; i++) {
      verts.push(position.getX(i), -position.getY(i), position.getZ(i));
      tris.push(base + i);
    }
    geometry.dispose();
    if (geometry !== sourceGeometry) sourceGeometry.dispose();
  }
  return { verts: Float64Array.from(verts), tris: Uint32Array.from(tris) };
}
