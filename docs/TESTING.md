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
- G-code: coordinate systems, path ordering, feeds, pen changes, and sanitized comments.
- React controls: user interactions and the custom events consumed by `slicer.ts`.

Avoid snapshots of entire panels. They are noisy and do not prove that controls remain connected to the imperative runtime. Prefer assertions about accessible controls, event payloads, and exported data.

When fixing a bug, first add the smallest test that reproduces it at the closest stable boundary. Add broader integration coverage only when the bug crosses module boundaries.

## Coverage

Coverage currently measures the focused core under active test:

- `colorPair.ts`
- `contour-engine.ts`
- `demo-meshes/index.ts`
- `gcode.ts`
- `generativeMesh.ts`
- `mapAnnotations.ts`
- `mesh.ts`
- `mesh-geodesics.ts`
- `mesh-topology.ts`
- `projection.ts`
- `scalar-fields.ts`
- `svg-mesh.ts`
- `toolpaths.ts`
- `FormControls.tsx`
- `GradientChooser.tsx`

This avoids presenting untested declarative panel markup as the same risk category as geometry and export logic. Coverage enforces a regression floor of 85% statements, 70% branches, 80% functions, and 85% lines across this focused scope. Raising coverage should still come from useful behavior rather than assertions written only to pad a percentage. Expand the configured scope when adding meaningful tests for another subsystem.

The HTML report is generated under `coverage/` and is ignored by Git.
