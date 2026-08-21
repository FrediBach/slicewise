import { ExtrudeGeometry, type Shape, type Vector2 } from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { findMats, getMatCurveToNext, isTerminating, traverseEdges } from 'flo-mat';
import type { ParsedMesh } from './mesh';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export type ParsedCenterlines = {
  points: Float64Array;
  offsets: Uint32Array;
};

function filledShapes(text: string): Shape[] {
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
  return shapes;
}

export function parseSVG(
  text: string,
  depthPercent = 12,
  rounded = false,
  roundnessPercent = 25,
): ParsedMesh {
  const shapes = filledShapes(text);

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

function signedArea(points: Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return area / 2;
}

function pointLoop(points: Vector2[], clockwise: boolean): number[][][] {
  const clean = points.filter(
    (point, index) => index === 0 || point.distanceToSquared(points[index - 1]) > Number.EPSILON,
  );
  if (clean.length > 1 && clean[0].distanceToSquared(clean.at(-1)!) <= Number.EPSILON) clean.pop();
  if (signedArea(clean) < 0 !== clockwise) clean.reverse();
  return clean.map((point, index) => {
    const next = clean[(index + 1) % clean.length];
    return [
      [point.x, point.y],
      [next.x, next.y],
    ];
  });
}

function sampleBezier(bezier: number[][]): number[] {
  const steps = bezier.length === 2 ? 1 : 8;
  const points: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const t = step / steps,
      work = bezier.map((point) => [...point]);
    for (let level = work.length - 1; level > 0; level--)
      for (let i = 0; i < level; i++) {
        work[i][0] += (work[i + 1][0] - work[i][0]) * t;
        work[i][1] += (work[i + 1][1] - work[i][1]) * t;
      }
    points.push(work[0][0], work[0][1]);
  }
  return points;
}

/** Extract a pruned scale-axis centerline from filled SVG artwork. */
export function parseSVGCenterlines(text: string, pruning = 2): ParsedCenterlines {
  const shapes = filledShapes(text);
  const runs: number[][] = [];
  for (const shape of shapes) {
    const outer = shape.getSpacedPoints(96);
    if (outer.length < 3) continue;
    const clockwise = signedArea(outer) < 0;
    const loops = [pointLoop(outer, clockwise)];
    for (const hole of shape.holes) {
      const points = hole.getSpacedPoints(64);
      if (points.length >= 3) loops.push(pointLoop(points, !clockwise));
    }
    const mats = findMats(loops, {
      applySat: true,
      satScale: clamp(pruning, 1, 4),
      simplify: true,
      simplifyTolerance: 0.2,
      maxLength: 16,
    });
    for (const mat of mats)
      traverseEdges(mat.cpNode, (node) => {
        if (isTerminating(node)) return;
        const curve = getMatCurveToNext(node);
        if (curve?.length >= 2) runs.push(sampleBezier(curve));
      });
  }
  const usable = runs.filter((run) => run.length >= 4 && run.every(Number.isFinite));
  if (!usable.length) throw new Error('No usable centreline could be extracted from that SVG');
  const offsets = new Uint32Array(usable.length + 1);
  let pointCount = 0;
  for (let i = 0; i < usable.length; i++) {
    offsets[i] = pointCount;
    pointCount += usable[i].length / 2;
  }
  offsets[usable.length] = pointCount;
  return { points: Float64Array.from(usable.flat()), offsets };
}
