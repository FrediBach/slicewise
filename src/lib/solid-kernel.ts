import type { Manifold, ManifoldToplevel } from 'manifold-3d';

/** Manufacturing coordinates are Z-up millimeters; no normalization or repair. */
export type SolidMesh = { V: Float32Array; T: Uint32Array };
export type SolidOperation = 'off' | 'inset' | 'emboss';
export type KernelMeasurements = {
  volumeMm3: number;
  bounds: { min: number[]; max: number[] };
  triangles: number;
  /** Connected boundary shells, not physical bodies: a cavity adds a shell. */
  boundaryComponents: number;
};

/** These bound input/output buffers, not the peak memory of a WASM Boolean. */
export const SOLID_KERNEL_LIMITS = {
  triangles: 250_000,
  tools: 64,
  bufferBytes: 64 * 1024 * 1024,
} as const;

function checkMesh(mesh: SolidMesh) {
  if (!mesh.V.length || mesh.V.length % 3 || !mesh.T.length || mesh.T.length % 3)
    throw new Error('Solid meshes need complete XYZ vertices and triangle indices.');
  if (mesh.V.length / 3 > SOLID_KERNEL_LIMITS.triangles * 3)
    throw new Error('Solid vertex budget exceeded.');
  if (!mesh.V.every(Number.isFinite)) throw new Error('Solid coordinates must be finite.');
  if (mesh.T.some((index) => index >= mesh.V.length / 3))
    throw new Error('Solid triangle index is outside the vertex buffer.');
}

/**
 * Phase-0 kernel boundary. Acceptance by Manifold is NOT a print-readiness check:
 * independent intersections, shell orientation and manufacturing checks are pending.
 * The caller owns module initialization and can terminate its worker to cancel WASM.
 */
export function createSolidKernel(module: ManifoldToplevel) {
  let liveHandles = 0;
  const own = (solid: Manifold) => {
    liveHandles++;
    return solid;
  };
  const release = (solid: Manifold) => {
    try {
      solid.delete();
    } finally {
      liveHandles--;
    }
  };
  const inspect = (solid: Manifold): KernelMeasurements => {
    const status = solid.status();
    if (status !== 'NoError') throw new Error(`Solid kernel rejected geometry: ${status}.`);
    if (solid.isEmpty()) throw new Error('Solid operation removed the entire object.');
    const triangles = solid.numTri();
    if (triangles > SOLID_KERNEL_LIMITS.triangles)
      throw new Error('Solid triangle budget exceeded. Reduce source or treatment complexity.');
    const volumeMm3 = solid.volume();
    if (!Number.isFinite(volumeMm3) || volumeMm3 <= 0)
      throw new Error('Solid must have positive finite signed volume. Check its winding.');
    const parts = solid.decompose().map(own);
    try {
      return {
        volumeMm3,
        bounds: solid.boundingBox(),
        triangles,
        boundaryComponents: parts.length,
      };
    } finally {
      parts.forEach(release);
    }
  };
  const importMesh = (mesh: SolidMesh) =>
    own(
      new module.Manifold(
        new module.Mesh({
          numProp: 3,
          vertProperties: mesh.V.slice(),
          triVerts: mesh.T.slice(),
        }),
      ),
    );

  return {
    /** Exposes owned handles for lifecycle regression tests, not heap measurements. */
    get liveHandles() {
      return liveHandles;
    },
    run(base: SolidMesh, tools: readonly SolidMesh[], operation: SolidOperation) {
      if (!['off', 'inset', 'emboss'].includes(operation))
        throw new Error('Unknown solid operation.');
      const activeTools = operation === 'off' ? [] : tools;
      if (activeTools.length > SOLID_KERNEL_LIMITS.tools)
        throw new Error('Solid tool budget exceeded.');
      const inputs = [base, ...activeTools];
      if (
        inputs.reduce((sum, mesh) => sum + mesh.V.byteLength + mesh.T.byteLength, 0) >
        SOLID_KERNEL_LIMITS.bufferBytes
      )
        throw new Error('Solid input buffer budget exceeded.');
      if (inputs.reduce((sum, mesh) => sum + mesh.T.length / 3, 0) > SOLID_KERNEL_LIMITS.triangles)
        throw new Error('Solid triangle budget exceeded. Reduce source or treatment complexity.');
      inputs.forEach(checkMesh);
      let source: Manifold | undefined;
      let combined: Manifold | undefined;
      let result: Manifold | undefined;
      try {
        source = importMesh(base);
        const baseMeasurements = inspect(source);
        // Preserve the exact original arrays on neutral operations, even if import
        // internally collapses redundant topology. No Boolean or mesh round trip.
        if (!activeTools.length) return { mesh: base, measurements: baseMeasurements };
        for (const toolMesh of activeTools) {
          const tool = importMesh(toolMesh);
          let retained = false;
          try {
            inspect(tool);
            if (!combined) {
              combined = tool;
              retained = true;
            } else {
              const next = own(combined.add(tool));
              release(combined);
              combined = next;
            }
            inspect(combined);
          } finally {
            if (!retained) release(tool);
          }
        }
        result = own(operation === 'inset' ? source.subtract(combined!) : source.add(combined!));
        const measurements = inspect(result);
        const output = result.getMesh();
        // No property seams are introduced: the adapter imports XYZ only.
        const mesh = { V: output.vertProperties.slice(), T: output.triVerts.slice() };
        checkMesh(mesh);
        return { mesh, measurements };
      } finally {
        if (result) release(result);
        if (combined) release(combined);
        if (source) release(source);
      }
    },
  };
}
