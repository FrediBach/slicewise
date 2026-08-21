import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      include: [
        "src/lib/{colorPair,contour-engine,gcode,generativeMesh,mesh}.ts",
        "src/components/controls/GradientChooser.tsx",
      ],
      exclude: ["src/**/*.d.ts", "src/test/**"],
    },
  },
});
