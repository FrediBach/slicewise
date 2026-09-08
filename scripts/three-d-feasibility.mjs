import { createServer } from 'vite';
import Module from 'manifold-3d';
import { cpus, platform, release } from 'node:os';
import process from 'node:process';
import console from 'node:console';

// Uses the installed Vite transform to execute the same TS fixtures as the worker.
const server = await createServer({
  server: { middlewareMode: true, ws: false, watch: null },
  appType: 'custom',
});
try {
  const { runFeasibility } = await server.ssrLoadModule('/src/lib/three-d-feasibility.ts');
  const module = await Module();
  module.setup();
  const before = process.memoryUsage();
  const rows = runFeasibility(module, Number(process.argv[2] ?? 1));
  console.log(
    JSON.stringify(
      {
        kernel: 'manifold-3d 3.5.3',
        environment: {
          node: process.version,
          platform: platform(),
          release: release(),
          arch: process.arch,
          cpu: cpus()[0]?.model,
        },
        memoryNote:
          'Process samples include Vite, JS and WASM. They are not peak WASM allocation measurements.',
        before,
        after: process.memoryUsage(),
        rows,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
