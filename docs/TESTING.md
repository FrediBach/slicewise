# Testing Slicewise

Slicewise uses Vitest for unit and integration tests, Testing Library for React interactions, jsdom for browser-like component tests, and V8 for coverage.

## Commands

```bash
npm test                 # run the suite once
npm run test:watch       # rerun affected tests during development
npm run test:coverage    # run tests and write coverage/index.html
npm run doctor           # audit React health; fail on error-severity findings
```

The normal pre-commit verification sequence is:

```bash
npm run format:check
npm run doctor
npm run lint
npm run typecheck
npm test
npm run build
```

## Test organization

Tests are colocated with implementation files and use the `.test.ts` or `.test.tsx` suffix. Shared test setup lives in `src/test/setup.ts`.

The default environment is Node. A component test that needs browser APIs declares jsdom at the top of the file:

```ts
// @vitest-environment jsdom
```

Prefer Node for geometry and serialization tests: it starts faster and makes accidental DOM dependencies visible.

## What to test

Prioritize observable contracts and failure-prone transformations:

- Parsers: accepted variants, triangulation, malformed input, and useful errors.
- Geometry: topology, normalization, winding, determinism, and finite output.
- Contours: valid SVG, non-empty toolpaths, morph instances, and effect-specific output.
- Polyline styling: corner preservation, deterministic seeding, closure, finite output, and density/count boundaries.
- G-code: coordinate systems, path ordering, feeds, pen changes, and sanitized comments.
- Export assembly: runtime-profile mapping, MIME/extension selection, effect metadata, and safe filenames.
- React controls: user interactions and the custom events consumed by `slicer.ts`.
- Render snapshots: exhaustive worker keys, omission of browser-only state, derived metadata, and detached mutable values.
- Parameter history and migrations: duplicate suppression, branch truncation, bounded eviction, snapshot isolation, legacy compatibility, and invalid saved values.
- Animation projects: detached base settings, complete keyframe capture, exact endpoints, easing, typed interpolation, discrete seed behavior, timeline editing boundaries, and forced suppression of the separate Morph grid.
- Animation video export: endpoint-inclusive frame timing, timestamps, even dimensions, codec fallback, opaque backgrounds, safe filenames, progress/cancellation, and resource cleanup.

Avoid snapshots of entire panels. They are noisy and do not prove that controls remain connected to the imperative runtime. Prefer assertions about accessible controls, event payloads, and exported data.

`non-euclidean-integration.test.ts` is the release compatibility matrix. It combines every new projection/field family with quick and exact rendering, camera transforms, X/Y morphs, gradients and indexed colours, Humanizer, Yarn cut & curl, artboard and mask clipping, blueprint/topographic output, SVG centreline projection, generated tiling line art, and both G-code origins. Keep focused kernel tests as the primary numerical specification; extend this matrix when a new feature family must share the complete composition pipeline.

When fixing a bug, first add the smallest test that reproduces it at the closest stable boundary. Add broader integration coverage only when the bug crosses module boundaries.

## Coverage

Coverage currently measures the focused core under active test:

- `animation-project.ts`
- `animation-storage.ts`
- `animation-playback.ts`
- `animation-history.ts`
- `animation-interpolation.ts`
- `animation-migrations.ts`
- `animation-validation.ts`
- `animation-video-export.ts`
- `block-glitch.ts`
- `colorPair.ts`
- `contour-engine.ts`
- `demo-meshes/index.ts`
- `gcode.ts`
- `gcode-3d-toolpaths.ts`
- `gcode-calibration.ts`
- `gcode-layout.ts`
- `gcode-profiles.ts`
- `grbl-serial.ts`
- `gcode-validation.ts`
- `generativeMesh.ts`
- `hyperbolic-tiling.ts`
- `mapAnnotations.ts`
- `mesh.ts`
- `mesh-curvature.ts`
- `mesh-geodesics.ts`
- `mesh-topology.ts`
- `misregistration.ts`
- `parameter-history.ts`
- `parameter-migrations.ts`
- `paper-orientation.ts`
- `projection.ts`
- `polyline-styling.ts`
- `render-settings.ts`
- `render-scheduling.ts`
- `sample-and-hold.ts`
- `scalar-fields.ts`
- `scan-band-glitch.ts`
- `slicer-export.ts`
- `svg-mesh.ts`
- `staggered-slices.ts`
- `tile-shuffle.ts`
- `toolpaths.ts`
- `vector-zoom.ts`
- `wraparound-tear.ts`
- `video-encoder.ts`
- `FormControls.tsx`
- `GradientChooser.tsx`

This avoids presenting untested declarative panel markup as the same risk category as geometry and export logic. Coverage enforces a regression floor of 85% statements, 70% branches, 80% functions, and 85% lines across this focused scope. Raising coverage should still come from useful behavior rather than assertions written only to pad a percentage. Expand the configured scope when adding meaningful tests for another subsystem.

## Refactoring large modules

Use three layers of confidence when extracting behavior from `contour-engine.ts` or `slicer.ts`:

1. Add focused tests for the new pure module, including determinism and boundary inputs.
2. Keep or extend the nearest integration test that exercises the same behavior through `computeContours` or the export adapter.
3. Run the full suite and production build to catch worker, serialization, and module-graph regressions.

Prefer moving one cohesive pipeline stage at a time. Avoid tests that duplicate the implementation line for line; specify inputs, output geometry or metadata, ordering, and invariants such as finite coordinates and closed loops.

The HTML report is generated under `coverage/` and is ignored by Git.
