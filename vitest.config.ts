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
        'src/lib/{animation-history,animation-interpolation,animation-migrations,animation-playback,animation-project,animation-validation,block-glitch,colorPair,contour-engine,gcode,generativeMesh,hyperbolic-tiling,mapAnnotations,mesh,mesh-curvature,mesh-geodesics,mesh-topology,misregistration,parameter-history,parameter-migrations,polyline-styling,projection,render-scheduling,render-settings,sample-and-hold,scalar-fields,scan-band-glitch,slicer-export,staggered-slices,svg-mesh,tile-shuffle,toolpaths,vector-zoom,wraparound-tear}.ts',
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
