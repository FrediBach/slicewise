# Slicewise architecture

This document describes the maintained Vite/React application under `src`. The root-level `slicewise.html` is a historical prototype and is not part of the production module graph.

## Design goals

Slicewise is organized around four constraints:

1. Model data stays local to the browser.
2. Expensive geometry work runs away from the main UI thread.
3. The contour engine remains independent of React and the DOM.
4. Existing control element IDs form a stable adapter between React markup and the imperative browser runtime.

The fourth constraint is intentional. React owns the interface structure and stateful controls; `lib/slicer.ts` owns the high-frequency drawing state and binds to controls by ID. Refactors must preserve those IDs unless the runtime binding is updated at the same time.

## Runtime data flow

```text
React panels and controls
        │ DOM events / stable element IDs
        ▼
lib/slicer.ts ────────────────┐
        │                     │
        │ mesh upload/demo    │ settings snapshot
        ▼                     ▼
lib/mesh.ts             slicer-worker.ts
                              │
                              ▼
                      contour-engine.ts
                              │
                       SVG + toolpaths
                              │
                              ▼
lib/slicer.ts ── preview / clipboard / download
                              │
                              └── gcode.ts for G-code export
```

Generative meshes use a separate path: `slicer.ts` sends implicit-field parameters to `generative-mesh-worker.ts`, which calls `generativeMesh.ts` and transfers typed-array buffers back to the main thread. Uploaded SVG artwork is parsed and extruded lazily through `svg-mesh.ts`.

## Module responsibilities

### React layer

- `main.tsx` mounts the application and loads global styles.
- `App.tsx` is the composition root. It bootstraps the browser runtime and arranges panels, actions, and the preview workspace.
- `components/panels/*` groups markup by product feature. Panels should remain declarative and retain the DOM IDs consumed by the runtime.
- `components/controls/FormControls.tsx` contains shared numeric, colour, checkbox, morph, and randomization controls.
- `components/controls/GradientChooser.tsx` owns editable gradient-stop state.
- `components/ui/*` contains small, style-oriented primitives without domain behavior.

### Geometry and export layer

- `mesh.ts` parses supported mesh formats, welds and normalizes uploaded geometry, calculates vertex normals, and creates built-in demo meshes.
- `contour-engine.ts` is the pure rendering core. It projects geometry, calculates scalar fields, slices triangles, chains line segments, performs visibility and silhouette work, applies output effects, and returns SVG plus grouped toolpaths. It must not read the DOM.
- `slicer-worker.ts` is deliberately small: it stores the current transferable mesh, invokes `computeContours`, and reports results or errors.
- `generativeMesh.ts` generates indexed meshes from implicit fields. Its worker transfers array buffers rather than cloning large arrays.
- `svg-mesh.ts` converts SVG artwork into mesh geometry.
- `gcode.ts` converts grouped toolpaths into machine instructions and owns plotter-profile defaults.
- `colorPair.ts` creates random ink/background combinations in OKLCH while enforcing contrast and gamut constraints.

### Browser orchestration

`slicer.ts` is the integration boundary for browser-only behavior. It owns the current settings, binds form controls, schedules worker renders, manages parameter history and randomization, handles orbit/pan gestures, and coordinates preview and export. Keep computation that can run without `document`, `window`, or mutable UI state out of this module.

## State and events

Most ordinary settings live in the runtime `state` object. Before rendering, `settingsSnapshot()` creates a serializable object for the worker. Meshes are sent only when their version changes; render requests then reference the worker's current mesh.

Complex React controls communicate through custom DOM events:

- `morphchange` and `morphseconddimension` synchronize morph targets.
- `randomlockchange` and `randomlockbulk` coordinate parameter locks.
- `gradientchange` publishes normalized gradient stops.
- `restoreparameters` restores React-owned control state during undo/redo.

These event names and their payloads are internal interfaces. Change producers and consumers together.

## Rendering and concurrency

Contour requests are assigned monotonically increasing IDs and mesh versions. The main thread ignores stale responses, so quick interactive renders cannot overwrite newer settings. The runtime adjusts throttling using triangle count, contour count, visibility work, curve quality, and morph instance count.

There are two worker entry points:

- `slicer-worker.ts` for contour computation.
- `generative-mesh-worker.ts` for implicit-surface generation.

Both return structured errors instead of throwing across the worker boundary.

## Adding functionality

### Add a control

1. Put the markup in the appropriate panel using an existing shared control when possible.
2. Give it a stable, unique ID.
3. Add the setting and binding in `slicer.ts`.
4. Include render-relevant values in `settingsSnapshot()`.
5. Document the control in `PARAMETERS.md`.

### Add an import format or demo mesh

Implement parsing or procedural geometry in `mesh.ts`, returning `{ verts, tris }`. Register uploads or demos in `slicer.ts`; normalization and normal calculation happen when the mesh is installed.

### Add a contour algorithm or output effect

Implement deterministic, DOM-free work in `contour-engine.ts`. Pass configuration in the settings snapshot and return any export metadata with the render result. Browser-specific toggles and enable/disable behavior remain in `slicer.ts`.

### Add an export format

Keep serialization in a focused library module like `gcode.ts`. Let `slicer.ts` choose the serializer and handle browser download or clipboard APIs.

## Verification

Run all checks before committing:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For changes to controls or bindings, also exercise upload, demo switching, orbit controls, undo/redo, randomization, preview rendering, and both SVG and G-code export in the browser. Build success verifies module and worker graphs, but it does not replace interaction testing.
