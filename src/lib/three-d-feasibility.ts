/** Internal Phase-0 fixtures, not the production contour/profile implementation. */
import type { Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import { createSolidKernel, type SolidMesh } from './solid-kernel';
import { deformMesh } from './mesh-deformation';
import { vertexNormals } from './mesh';
import { extractPlanarSlices, type PlanarSliceField } from './slice-geometry';
import { createRoundedTreatmentRecipe } from './slice-treatment';
import { PrintTopologyError, type PrintTopologyReport } from './print-validation';
import { auditPrintManufacturing } from './print-manufacturing';

function topologySummary(report: PrintTopologyReport) {
  return {
    status: report.status,
    checks: report.checks,
    intersections: report.intersections
      ? {
          ...report.intersections,
          trianglePairs: Array.from(report.intersections.trianglePairs),
        }
      : null,
    shellContainment: report.shellContainment,
    signedVolumeMm3: report.signedVolumeMm3,
    shellVolumesMm3: Array.from(report.shellVolumesMm3),
    issues: report.issues.map((issue) => ({
      ...issue,
      vertices: Array.from(issue.vertices),
      triangles: Array.from(issue.triangles),
    })),
  };
}

function screenForFeasibility(mesh: SolidMesh) {
  const start = performance.now();
  // Developer-only assumptions, included verbatim in each report. Fixture poses
  // stay unchanged, so centered meshes intentionally report below-bed placement.
  const report = auditPrintManufacturing(mesh, {
    buildVolume: { min: [-100, -100, 0], max: [100, 100, 200] },
    bedToleranceMm: 0.05,
    overhangFromVerticalDeg: 45,
  });
  return {
    manufacturingMs: performance.now() - start,
    manufacturing: {
      ...report,
      geometry: topologySummary(report.geometry),
      measurements: report.measurements
        ? {
            ...report.measurements,
            overhangTriangles: Array.from(report.measurements.overhangTriangles),
          }
        : null,
    },
  };
}

function failureSummary(error: unknown) {
  return {
    status: 'rejected',
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof PrintTopologyError ? { topology: topologySummary(error.report) } : {}),
  };
}

function inputWarnings(input: { source: PrintTopologyReport; tools: PrintTopologyReport[] }) {
  return [input.source, ...input.tools].flatMap((report, index) =>
    topologySummary(report).issues.flatMap((issue) =>
      issue.severity === 'warning'
        ? [{ input: index === 0 ? 'source' : `tool-${index}`, ...issue }]
        : [],
    ),
  );
}

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

export function createContourFeasibilityFixtures(module: ManifoldToplevel) {
  const existing = createFeasibilityFixtures(module);
  const box = existing[1].base;
  const normalized = {
    V: Float32Array.from(box.V, (v) => v / 30),
    T: box.T,
    N: vertexNormals(box.V, box.T),
  };
  const deform = (settings: Parameters<typeof deformMesh>[1]): SolidMesh => {
    const result = deformMesh(normalized, { objectEnabled: true, ...settings });
    return { V: Float32Array.from(result.V, (v) => v * 30), T: Uint32Array.from(result.T) };
  };
  return [
    ...existing.map(({ name, base }) => ({ name, base })),
    { name: 'twisted-box', base: deform({ objectTwistAngle: 60 }) },
    { name: 'bent-box', base: deform({ objectBendAngle: 45 }) },
  ].map((fixture) => ({
    ...fixture,
    field: {
      kind: 'planar',
      normal: fixture.name === 'box' ? [0.2, 0.1, 1] : [0, 0, 1],
      levels: [3.7],
    } as PlanarSliceField,
  }));
}

export function runFeasibility(
  module: ManifoldToplevel,
  repeats = 1,
  suite: 'analytic' | 'contours' = 'analytic',
) {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20)
    throw new Error('Choose 1–20 feasibility repetitions.');
  if (suite === 'contours') return runContourFeasibility(module, repeats);
  if (suite !== 'analytic') throw new Error('Unknown feasibility suite.');
  const kernel = createSolidKernel(module);
  const fixtures = createFeasibilityFixtures(module);
  const rows = [];
  for (let repetition = 0; repetition < repeats; repetition++) {
    for (const fixture of fixtures) {
      for (const operation of ['off', 'inset', 'emboss'] as const) {
        const start = performance.now();
        try {
          const result = kernel.run(fixture.base, fixture.tools, operation);
          rows.push({
            repetition,
            fixture: fixture.name,
            operation,
            status: result.topology.status,
            elapsedMs: Math.round((performance.now() - start) * 100) / 100,
            ...result.measurements,
            topology: topologySummary(result.topology),
            inputWarnings: inputWarnings(result.inputTopology),
            outputBytes: result.mesh.V.byteLength + result.mesh.T.byteLength,
            ...screenForFeasibility(result.mesh),
            liveHandles: kernel.liveHandles,
          });
        } catch (error) {
          rows.push({
            repetition,
            fixture: fixture.name,
            operation,
            ...failureSummary(error),
            liveHandles: kernel.liveHandles,
          });
        }
      }
    }
  }
  return rows;
}

function runContourFeasibility(module: ManifoldToplevel, repeats: number) {
  const kernel = createSolidKernel(module);
  const fixtures = createContourFeasibilityFixtures(module);
  const rows = [];
  for (let repetition = 0; repetition < repeats; repetition++) {
    for (const fixture of fixtures) {
      const start = performance.now();
      try {
        const geometry = extractPlanarSlices(fixture.base, fixture.field, 0);
        const recipe = createRoundedTreatmentRecipe(geometry, { mode: 'all' }, 0.6);
        const extractionMs = performance.now() - start;
        const tools = kernel.createRoundedTools(recipe);
        const toolConstructionMs = performance.now() - start - extractionMs;
        for (const operation of ['inset', 'emboss'] as const) {
          const operationStart = performance.now();
          try {
            const result = kernel.run(fixture.base, tools, operation);
            if (result.measurements.boundaryComponents !== 1)
              throw new Error(
                `${operation} produced unexpected boundary shells on this single-shell fixture.`,
              );
            rows.push({
              repetition,
              fixture: fixture.name,
              operation,
              status: result.topology.status,
              topology: topologySummary(result.topology),
              inputWarnings: inputWarnings(result.inputTopology),
              extractionMs,
              toolConstructionMs,
              booleanMs: performance.now() - operationStart,
              sourceTriangles: fixture.base.T.length / 3,
              contourRuns: recipe.runs.length,
              contourVertices: recipe.runs.reduce((sum, run) => sum + run.length / 3, 0),
              toolTriangles: tools.reduce((sum, tool) => sum + tool.T.length / 3, 0),
              ...result.measurements,
              ...screenForFeasibility(result.mesh),
              liveHandles: kernel.liveHandles,
            });
          } catch (error) {
            rows.push({
              repetition,
              fixture: fixture.name,
              operation,
              ...failureSummary(error),
              liveHandles: kernel.liveHandles,
            });
          }
        }
      } catch (error) {
        rows.push({
          repetition,
          fixture: fixture.name,
          ...failureSummary(error),
          liveHandles: kernel.liveHandles,
        });
      }
    }
  }
  return rows;
}
