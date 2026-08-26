import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'src/lib/{colorPair,contour-engine,gcode,generativeMesh,hyperbolic-tiling,mapAnnotations,mesh,mesh-curvature,mesh-geodesics,mesh-topology,projection,scalar-fields,svg-mesh,toolpaths}.ts',
        'src/lib/demo-meshes/index.ts',
        'src/components/controls/{FormControls,GradientChooser}.tsx',
      ],
      exclude: ['src/**/*.d.ts', 'src/test/**'],
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 80,
        lines: 85,
      },
    },
  },
});
