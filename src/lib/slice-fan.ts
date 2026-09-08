import type { Vec3 } from './projection';

export interface SliceFanGeometry {
  normalCenter: number;
  sourceTangent: number;
  minAngle: number;
  maxAngle: number;
}

export function sliceFanGeometry(
  mesh: { V: ArrayLike<number> },
  field: { min: number; max: number; values: ArrayLike<number> },
  tangent: Vec3,
  divergence: number,
): SliceFanGeometry | null {
  const normalCenter = (field.min + field.max) * 0.5;
  let tangentMin = Infinity,
    tangentMax = -Infinity;
  const tangentValues = new Float64Array(mesh.V.length / 3);
  for (let vertex = 0, offset = 0; vertex < tangentValues.length; vertex++, offset += 3) {
    const value =
      mesh.V[offset] * tangent[0] +
      mesh.V[offset + 1] * tangent[1] +
      mesh.V[offset + 2] * tangent[2];
    tangentValues[vertex] = value;
    if (value < tangentMin) tangentMin = value;
    if (value > tangentMax) tangentMax = value;
  }
  const tangentCenter = (tangentMin + tangentMax) * 0.5;
  let radius = 0;
  for (let vertex = 0; vertex < tangentValues.length; vertex++) {
    const normalOffset = field.values[vertex] - normalCenter;
    const tangentOffset = tangentValues[vertex] - tangentCenter;
    radius = Math.max(radius, Math.hypot(normalOffset, tangentOffset));
  }
  if (radius < 1e-12) return null;

  // Place the source outside a circle bounding the mesh in the slice/fan
  // cross-section. This prevents high divergence from putting the singularity
  // inside the model, while approaching it smoothly as the angle increases.
  const halfAngle = (divergence * Math.PI) / 360;
  const sourceDistance = radius / Math.sin(halfAngle);
  const sourceTangent = tangentCenter - sourceDistance;
  let minAngle = Infinity,
    maxAngle = -Infinity;
  for (let vertex = 0; vertex < tangentValues.length; vertex++) {
    const angle = Math.atan2(
      field.values[vertex] - normalCenter,
      tangentValues[vertex] - sourceTangent,
    );
    if (angle < minAngle) minAngle = angle;
    if (angle > maxAngle) maxAngle = angle;
  }
  return { normalCenter, sourceTangent, minAngle, maxAngle };
}

export function sliceFanTangent(direction: Vec3): Vec3 {
  // Prefer model-up as the direction across the fan. For topographic slices,
  // model Y is the deterministic fallback, keeping cached topology independent
  // of camera orbit.
  const reference: Vec3 = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const dot =
    reference[0] * direction[0] + reference[1] * direction[1] + reference[2] * direction[2];
  const x = reference[0] - direction[0] * dot;
  const y = reference[1] - direction[1] * dot;
  const z = reference[2] - direction[2] * dot;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

export function sliceFanPlane(
  direction: Vec3,
  tangent: Vec3,
  fan: SliceFanGeometry,
  position: number,
) {
  const angle = fan.minAngle + (fan.maxAngle - fan.minAngle) * position;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const normal: Vec3 = [
    direction[0] * cos - tangent[0] * sin,
    direction[1] * cos - tangent[1] * sin,
    direction[2] * cos - tangent[2] * sin,
  ];
  return { normal, level: fan.normalCenter * cos - fan.sourceTangent * sin };
}
