import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import {
  checkRoundedToolBudget,
  roundedToolWorkload,
  type RoundedTreatmentRecipe,
} from './slice-treatment';
import { assertPrintTopology } from './print-validation';

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
 * independent geometry audits run here; manufacturing advice is a separate stage.
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
    /** Creates bounded, closed capsule unions without exposing WASM handles. */
    createRoundedTools(recipe: RoundedTreatmentRecipe): SolidMesh[] {
      const { radiusMm: radius, circularSegments: segments, runs } = recipe;
      if (
        !Number.isFinite(radius) ||
        radius < 0 ||
        radius > 10 ||
        !Number.isInteger(segments) ||
        segments < 8 ||
        segments > 128 ||
        segments % 4
      )
        throw new Error('Invalid rounded tool profile.');
      if (radius === 0) return [];
      const vertices = runs.reduce((sum, run) => sum + run.length / 3, 0);
      checkRoundedToolBudget(
        roundedToolWorkload(runs.length, vertices, segments),
        recipe.approximation,
      );
      for (const run of runs) {
        if (run.length < 9 || run.length % 3 || !run.every(Number.isFinite))
          throw new Error('Invalid rounded tool path.');
        for (let i = 0; i < run.length; i += 3) {
          const next = (i + 3) % run.length;
          if (
            Math.hypot(run[next] - run[i], run[next + 1] - run[i + 1], run[next + 2] - run[i + 2]) <
            1e-9
          )
            throw new Error('Rounded tool path contains a zero-length segment.');
        }
      }
      const output: SolidMesh[] = [];
      for (const run of runs) {
        let combined: Manifold | undefined;
        let batch: Manifold[] = [];
        const flush = () => {
          if (!batch.length) return;
          let next: Manifold | undefined;
          try {
            next = own(module.Manifold.union(combined ? [combined, ...batch] : batch));
            inspect(next); // Force evaluation while the batch is small.
          } catch (error) {
            if (next) release(next);
            throw error;
          } finally {
            batch.forEach(release);
            batch = [];
          }
          if (combined) release(combined);
          combined = next;
        };
        const append = (part: Manifold) => {
          batch.push(part);
          if (batch.length === 8) flush();
        };
        try {
          for (let i = 0; i < run.length; i += 3) {
            const j = (i + 3) % run.length;
            // Identically oriented endpoint spheres give adjacent capsules the
            // same join geometry, avoiding coplanar cylinder/sphere seam slivers.
            const sphere = own(module.Manifold.sphere(radius, segments));
            let start: Manifold | undefined, end: Manifold | undefined;
            try {
              start = own(sphere.translate([run[i], run[i + 1], run[i + 2]]));
              end = own(sphere.translate([run[j], run[j + 1], run[j + 2]]));
              append(own(module.Manifold.hull([start, end])));
            } finally {
              if (end) release(end);
              if (start) release(start);
              release(sphere);
            }
          }
          flush();
          if (inspect(combined!).boundaryComponents !== 1)
            throw new Error(
              'Rounded tool produced unexpected boundary shells. This path is unsupported.',
            );
          const mesh = combined!.getMesh();
          const detached = { V: mesh.vertProperties.slice(), T: mesh.triVerts.slice() };
          assertPrintTopology(detached, 'Rounded tool');
          // Validate the quantized transfer artifact as well as the native solid.
          const roundTrip = importMesh(detached);
          try {
            if (inspect(roundTrip).boundaryComponents !== 1)
              throw new Error(
                'Rounded tool lost its single-shell topology during buffer conversion.',
              );
          } finally {
            release(roundTrip);
          }
          output.push(detached);
        } finally {
          batch.forEach(release);
          if (combined) release(combined);
        }
      }
      return output;
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
      const sourceTopology = assertPrintTopology(base, 'Source');
      const inputTopology = {
        source: sourceTopology,
        tools: activeTools.map((mesh, index) => assertPrintTopology(mesh, `Tool ${index + 1}`)),
      };
      let source: Manifold | undefined;
      let combined: Manifold | undefined;
      let result: Manifold | undefined;
      try {
        source = importMesh(base);
        const baseMeasurements = inspect(source);
        // Preserve the exact original arrays on neutral operations, even if import
        // internally collapses redundant topology. No Boolean or mesh round trip.
        if (!activeTools.length)
          return {
            mesh: base,
            measurements: baseMeasurements,
            topology: sourceTopology,
            inputTopology,
          };
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
        const topology = assertPrintTopology(mesh, 'Result');
        return { mesh, measurements, topology, inputTopology };
      } finally {
        if (result) release(result);
        if (combined) release(combined);
        if (source) release(source);
      }
    },
  };
}
