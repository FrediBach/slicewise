# Evolution guide

This guide records the maintainability boundaries to use during Slicewise's next major product push. Read it with [`ARCHITECTURE.md`](./ARCHITECTURE.md), which remains the source of truth for current runtime data flow.

## Current pressure points

Two integration modules are intentionally still large:

- `lib/contour-engine.ts` coordinates the complete mesh/line-art-to-document pipeline. Its stable public boundary is `computeContours(mesh, settings, quick)` plus the exported scalar-level helpers.
- `lib/slicer.ts` is the browser composition runtime. It owns mutable session state, DOM bindings, workers, gestures, history, randomization, preview scheduling, and browser I/O.

Large size alone is not a reason to split code. Extract a section when it has a coherent vocabulary, can expose a small typed API, and can be tested without reconstructing the parent module's mutable environment.

The latest extraction established two examples:

- `polyline-styling.ts` is a pure geometry stage used by both mesh contours and line-art sources.
- `slicer-export.ts` translates runtime state into export content while leaving browser I/O in `slicer.ts`.
- `components/panels/contours/` separates slice-field and LFO markup from the Contours composition panel while preserving the runtime's ID-based interface.

## Preferred dependency direction

```text
React panels
    │ stable IDs and custom events
    ▼
slicer.ts ───────────────► slicer-export.ts ──► gcode.ts
    │
    │ serializable worker messages
    ▼
slicer-worker.ts ────────► contour-engine.ts
                                │
                                ├── scalar-fields / topology / projection
                                ├── polyline-styling
                                ├── clipping / masks / kaleidoscope / vector zoom
                                └── SVG and toolpath composition
```

Dependencies should flow downward. Pure library modules must not import React, query the DOM, instantiate workers, or use browser download/clipboard APIs. `contour-engine.ts` may coordinate helpers; helpers should not call back into it.

## Next extraction candidates

These are candidates, not mandatory milestones. Re-evaluate them against the feature being built.

1. **Serializable render settings.** Move construction and cloning of the worker settings snapshot out of `slicer.ts`. The API should explicitly separate render settings from source state, generated-mesh settings, cached output, and interaction flags.
2. **Parameter history and randomization.** Both manipulate the same control/state bridge. A controller with injected DOM adapters and random source could make undo/redo and scoped randomization testable without booting the application runtime.
3. **Contour document composition.** Blueprint stock, annotations, background, colour plans, and final SVG assembly form a later-stage concern in `contour-engine.ts`. Extract only after defining an intermediate rendered-run structure shared by mesh and line-art paths.
4. **Visibility and silhouette.** Depth-buffer creation and silhouette extraction can become a focused projected-geometry module once their cache and projection inputs are made explicit.
5. **Panel decomposition.** Split a React panel when a subsection owns state or an event contract. Preserve control IDs, and add an interaction test before moving markup.

Do not extract worker communication merely to reduce line count. Request IDs, mesh versions, quick/exact disposition, and transfer ownership form one concurrency protocol and should move together if that boundary changes.

## Adding a feature family

Before implementation, identify the narrowest layer that owns the behavior:

- source parsing or mesh construction;
- scalar field or topology;
- projection;
- finished-polyline geometry;
- document styling/annotation;
- export serialization;
- browser interaction;
- declarative controls.

Define serializable settings at the worker boundary and deterministic output at the pure-module boundary. Keep uploaded data local and transfer large typed arrays where practical. If a user-visible setting is added, update [`PARAMETERS.md`](./PARAMETERS.md); if data flow changes, update [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Test strategy for evolution

Every new feature should have a small test at its stable owner and only as much integration coverage as its cross-module risk requires:

- numerical kernels: deterministic fixtures, invalid/degenerate inputs, finite output, and tolerances;
- polyline effects: open/closed runs, selection boundaries, stable seeds, and preservation of plotter geometry;
- worker changes: serializable messages, request/version behavior, error responses, and transfer lists;
- controls: accessible interactions and exact custom-event payloads;
- exports: SVG/toolpath parity, profile mapping, filenames, clipping, and metadata;
- pipeline-wide feature families: extend `non-euclidean-integration.test.ts` rather than duplicating its matrix.

During refactors, keep the previous integration assertions in place while adding direct tests for the extracted module. The required verification sequence is documented in [`TESTING.md`](./TESTING.md).

## Completion checklist

- The new responsibility has one documented owner.
- Pure logic is DOM-free and deterministic.
- Worker messages remain serializable and large buffers are transferred when practical.
- Control IDs and event producers/consumers still agree.
- Focused tests cover behavior and important boundaries.
- Relevant integration tests still pass.
- Parameter, architecture, testing, and evolution docs reflect the change.
- Formatting, React Doctor, lint, typecheck, tests, and production build pass.
