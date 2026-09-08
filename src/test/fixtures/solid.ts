import type { SolidMesh } from '../../lib/solid-kernel';

/** Asymmetric Z-up 40 × 30 × 50 mm outward-wound box, without WASM. */
export function solidBox(): SolidMesh {
  return {
    V: new Float32Array([
      -20, -15, -25, 20, -15, -25, 20, 15, -25, -20, 15, -25, -20, -15, 25, 20, -15, 25, 20, 15, 25,
      -20, 15, 25,
    ]),
    T: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3,
      0, 4, 3, 4, 7,
    ]),
  };
}

/** Closed, edge/vertex-manifold octahedron whose top fan folds over itself.
 * Its positive volume and coherent indexed winding do not establish validity.
 */
export function foldedOctahedron(): SolidMesh {
  return {
    V: new Float32Array([0, 0, -1, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0, 2, 0.25, 0]),
    T: new Uint32Array([5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1, 0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4]),
  };
}

/** Two adjacent faces captured from the Float32 contour-torus Emboss result. */
export function torusAdjacentOverlap(): SolidMesh {
  return {
    V: new Float32Array([
      -20.021512985229492, -20.021512985229492, 5.555702209472656, -20.525718688964844,
      -20.525718688964844, 4.2216715812683105, -20.295848846435547, -20.74457359313965,
      4.2216715812683105, -20.52971076965332, -20.529712677001953, 4.223888874053955,
      -20.52571678161621, -20.525718688964844, 4.2216715812683105,
    ]),
    T: new Uint32Array([0, 1, 2, 3, 4, 1]),
  };
}
