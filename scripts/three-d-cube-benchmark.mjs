import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import Module from 'manifold-3d';
import process from 'node:process';
import console from 'node:console';
import { cpus, platform } from 'node:os';

const lines = Number(process.argv[2] ?? 8);
const treatment = process.argv[3] ?? 'inset';
const pathToleranceMm = Number(process.argv[4] ?? 0);
if (
  !Number.isInteger(lines) ||
  lines < 1 ||
  lines > 200 ||
  !['inset', 'emboss'].includes(treatment) ||
  ![0, 0.05].includes(pathToleranceMm)
)
  throw new Error(
    'Usage: npm run bench:3d:cube -- <1–200 slices> <inset|emboss> <0|0.05 mm path tolerance>',
  );
const server = await createServer({
  server: { middlewareMode: true, ws: false, watch: null },
  appType: 'custom',
});
try {
  const { prepareThreeD } = await server.ssrLoadModule('/src/lib/three-d-preparation.ts');
  const { sphereDemo } = await server.ssrLoadModule('/src/lib/demo-meshes/index.ts');
  const { weld } = await server.ssrLoadModule('/src/lib/mesh.ts');
  const { createThreeDProject } = await server.ssrLoadModule('/src/lib/three-d-project.ts');
  const module = await Module();
  module.setup();
  const before = process.memoryUsage();
  const start = performance.now(),
    stages = [];
  const reply = prepareThreeD(
    {
      id: 1,
      source: {
        id: 'cube',
        name: 'rounded cube',
        version: 1,
        mesh: weld(sphereDemo('cube')),
        imported: false,
        upY: false,
      },
      project: { ...createThreeDProject('cube'), sizeConfirmed: true, treatment, pathToleranceMm },
      settings: { axis: 'up', lines },
    },
    module,
    (message) => stages.push({ message, elapsedMs: performance.now() - start }),
  );
  console.log(
    JSON.stringify(
      {
        environment: { node: process.version, cpu: cpus()[0]?.model, platform: platform() },
        lines,
        treatment,
        pathToleranceMm,
        longestMm: 100,
        elapsedMs: performance.now() - start,
        stages,
        preparation: reply.preparation,
        resultTriangles:
          reply.preparation?.status === 'accepted' ? reply.artifact.T.length / 3 : null,
        memory: {
          note: 'Process samples include Vite, JS and WASM; not peak WASM measurements.',
          before,
          after: process.memoryUsage(),
          peakRssKiB: process.resourceUsage().maxRSS,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
