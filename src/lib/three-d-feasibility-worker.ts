import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { runFeasibility } from './three-d-feasibility';

// Vite serves/emits the WASM locally. No CDN or source-content network requests.
const ready = Module({ locateFile: () => wasmUrl }).then((module) => {
  module.setup();
  return module;
});
self.addEventListener(
  'message',
  async (event: MessageEvent<{ id: number; repeats: number; suite?: 'analytic' | 'contours' }>) => {
    const { id, repeats, suite } = event.data;
    try {
      const module = await ready;
      self.postMessage({ id, type: 'result', rows: runFeasibility(module, repeats, suite) });
    } catch (error) {
      self.postMessage({
        id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
