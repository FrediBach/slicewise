import { defineConfig } from 'vite';
import path from 'node:path';

// Separate internal entry: the production application does not load the spike.
export default defineConfig({
  build: {
    outDir: 'dist/three-d-feasibility',
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'tools/three-d-feasibility.html'),
    },
  },
});
