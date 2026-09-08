/** Internal Phase-0 fixtures, not the production contour/profile implementation. */
import type { Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import { createSolidKernel, type SolidMesh } from './solid-kernel';
import { deformMesh } from './mesh-deformation';
import { vertexNormals } from './mesh';

export function createFeasibilityFixtures(module: ManifoldToplevel) {
  const allocated: Manifold[] = [];
  const own = (solid: Manifold) => {
    allocated.push(solid);
    return solid;
  };
  const mesh = (solid: Manifold): SolidMesh => {
    if (solid.status() !== 'NoError') throw new Error('Invalid feasibility fixture.');
    const output = solid.getMesh();
    return { V: output.vertProperties.slice(), T: output.triVerts.slice() };
  };
  const ring = (major: number, minor: number) => {
    const profile: Vec2[] = Array.from({ length: 32 }, (_, i) => {
      const angle = (i * Math.PI) / 16;
      return [major + minor * Math.cos(angle), minor * Math.sin(angle)];
    });
    return own(module.Manifold.revolve(profile, 128));
  };
  try {
    const sphere = mesh(own(module.Manifold.sphere(20, 64)));
    const box = mesh(own(module.Manifold.cube([40, 30, 50], true)));
    const torus = mesh(ring(20, 10));
    const radius = 0.6;
    const pieces: Manifold[] = [];
    for (const y of [-15, 15]) {
      const cylinder = own(module.Manifold.cylinder(40, radius, radius, 32, true));
      const rotated = own(cylinder.rotate([0, 90, 0]));
      pieces.push(own(rotated.translate([0, y, 0])));
    }
    for (const x of [-20, 20]) {
      const cylinder = own(module.Manifold.cylinder(30, radius, radius, 32, true));
      const rotated = own(cylinder.rotate([90, 0, 0]));
      pieces.push(own(rotated.translate([x, 0, 0])));
      for (const y of [-15, 15]) {
        const corner = own(module.Manifold.sphere(radius, 32));
        pieces.push(own(corner.translate([x, y, 0])));
      }
    }
    const boxTool = mesh(own(module.Manifold.union(pieces)));
    const deformed = deformMesh(
      { ...box, N: vertexNormals(box.V, box.T) },
      {
        objectEnabled: true,
        objectShear: true,
        objectShearAxis: 'z',
        objectShearAmount: 30,
        objectShearDirection: 0,
      },
    );
    return [
      { name: 'sphere', base: sphere, tools: [mesh(ring(20, radius))] },
      { name: 'box', base: box, tools: [boxTool] },
      { name: 'torus', base: torus, tools: [mesh(ring(30, radius))] },
      {
        name: 'sheared-box',
        base: { V: Float32Array.from(deformed.V), T: Uint32Array.from(deformed.T) },
        tools: [boxTool],
      },
    ];
  } finally {
    allocated.reverse().forEach((solid) => solid.delete());
  }
}

export function runFeasibility(module: ManifoldToplevel, repeats = 1) {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20)
    throw new Error('Choose 1–20 feasibility repetitions.');
  const kernel = createSolidKernel(module);
  const fixtures = createFeasibilityFixtures(module);
  const rows = [];
  for (let repetition = 0; repetition < repeats; repetition++) {
    for (const fixture of fixtures) {
      for (const operation of ['off', 'inset', 'emboss'] as const) {
        const start = performance.now();
        const result = kernel.run(fixture.base, fixture.tools, operation);
        rows.push({
          repetition,
          fixture: fixture.name,
          operation,
          elapsedMs: Math.round((performance.now() - start) * 100) / 100,
          ...result.measurements,
          outputBytes: result.mesh.V.byteLength + result.mesh.T.byteLength,
          liveHandles: kernel.liveHandles,
        });
      }
    }
  }
  return rows;
}
