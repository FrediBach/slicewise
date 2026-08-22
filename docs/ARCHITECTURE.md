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
        │ mesh source         │ settings snapshot
        ▼                     ▼
mesh.ts / demo-meshes/  slicer-worker.ts
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

Generative meshes use a separate path: `slicer.ts` sends implicit-field parameters to `generative-mesh-worker.ts`, which calls `generativeMesh.ts` and transfers typed-array buffers back to the main thread. Uploaded SVG artwork is parsed lazily through `svg-mesh.ts`. It can become an extruded mesh or scale-axis centreline polylines; centreline points and run offsets are transferred to the contour worker as typed arrays.

## Module responsibilities

### React layer

- `main.tsx` mounts the application and loads global styles.
- `App.tsx` is the composition root. It bootstraps the browser runtime and arranges panels, actions, and the preview workspace.
- `components/panels/*` groups markup by product feature. Panels should remain declarative and retain the DOM IDs consumed by the runtime.
- `components/controls/FormControls.tsx` contains shared numeric, colour, checkbox, morph, and randomization controls.
- `components/controls/GradientChooser.tsx` owns editable gradient-stop state.
- `components/ui/*` contains small, style-oriented primitives without domain behavior.

### Geometry and export layer

- `mesh.ts` parses supported mesh formats, welds and normalizes geometry, and calculates vertex normals.
- `demo-meshes/index.ts` contains the deterministic procedural generators for the built-in demo sources.
- `contour-engine.ts` is the pure rendering core. It projects geometry, calculates scalar fields, slices triangles, chains line segments, performs visibility and silhouette work, and returns SVG plus grouped centreline toolpaths. Output effects compose in a fixed order: geometry effects and clipping, path colour/weight styling, halftone styling, chromatic copies, map annotations, then document overlays. Mesh contours and imported SVG centrelines share those composition rules. It must not read the DOM.
- `slicer-worker.ts` is deliberately small: it stores the current transferable mesh, invokes `computeContours`, and reports results or errors.
- `generativeMesh.ts` generates indexed meshes from implicit fields. Its worker transfers array buffers rather than cloning large arrays.
- `svg-mesh.ts` converts filled SVG artwork into extruded mesh geometry or pruned medial/scale-axis centreline polylines.
- `toolpaths.ts` owns rectangular clipping, near-endpoint joining, greedy run ordering, and reversible 2-opt refinement.
- `gcode.ts` converts grouped toolpaths into machine instructions, applies an export-time clipping safety net, and owns plotter-profile defaults.
- `colorPair.ts` creates random ink/background combinations and ink-anchored harmonic gradients in OKLCH while enforcing contrast and gamut constraints.
- `mapAnnotations.ts` derives deterministic, plotter-safe elevation labels, generated locations, map symbols, and single-line lettering from finished contour runs.

### Browser orchestration

`slicer.ts` is the integration boundary for browser-only behavior. It owns the current settings, binds form controls, schedules worker renders, manages parameter history and randomization, handles orbit/pan gestures, and coordinates preview and export. Keep computation that can run without `document`, `window`, or mutable UI state out of this module.

## State and events

Most ordinary settings live in the runtime `state` object. Before rendering, `settingsSnapshot()` creates a serializable object for the worker. Meshes are sent only when their version changes; render requests then reference the worker's current mesh.

Complex React controls communicate through custom DOM events:

- `morphchange` and `morphseconddimension` synchronize morph targets.
- `randomlockchange` and `randomlockbulk` coordinate parameter locks.
- `gradientchange` publishes normalized gradient stops.
- `setgradient` synchronizes generated gradient stops into the React editor.
- `restoreparameters` restores React-owned control state during undo/redo.

These event names and their payloads are internal interfaces. Change producers and consumers together.

## Rendering and concurrency

Contour requests are assigned monotonically increasing IDs and mesh versions. Results from replaced meshes and stale full-quality responses are ignored; stale quick responses may be shown transiently but cannot overwrite exact export state. The runtime adjusts throttling using triangle count, contour count, visibility work, curve quality, and morph instance count.

Interactive preview state is intentionally distinct from exact export state. A completed quick response may replace the visible preview even when a newer gesture request is queued, but only the latest full-quality response updates the stored SVG and toolpaths used by copy and download. Quick responses omit export toolpaths and use an adaptive detail level for contour density and curve quality, with a conservative bound on morph-grid dimensions. The level begins at two-thirds detail, rises through discrete steps to full detail after several fast end-to-painted-frame measurements, and falls with a wider slow-frame threshold to avoid oscillation. The measured cost also replaces the conservative static throttle estimate once samples are available. Export actions automatically request a current full-quality result when necessary.

Pan and wheel zoom use a temporary SVG group transform for immediate feedback. Their exact clipped geometry is recomputed when the pointer gesture ends or wheel input has been idle for 140 ms. Orbit and roll still require worker projection and visibility work, so they use the lightweight quick-render path while dragging.

For the model-space `up`, `x`, `y`, and custom slice axes, the contour engine caches a bounded set of 3D slice topologies per mesh. This includes divergent fan slices, whose virtual source axis is derived in model space. Orbiting can then reproject the cached polylines instead of rescanning every triangle at every contour level. Camera-axis slicing is excluded because its scalar field changes with the camera.

The runtime publishes the latest timing samples through the browser Performance API as `slicewise:render:queue`, `slicewise:render:worker-roundtrip`, `slicewise:render:dom-apply`, and `slicewise:render:end-to-paint`. The visible Render statistic remains the contour engine's worker computation time.

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
5. Document the control in [`PARAMETERS.md`](./PARAMETERS.md).

### Add an import format or demo mesh

Implement import parsing in `mesh.ts` or procedural demo geometry in `demo-meshes/`, returning `{ verts, tris }`. Register uploads or demos in `slicer.ts`; normalization and normal calculation happen when the mesh is installed.

### Add a contour algorithm or output effect

Implement deterministic, DOM-free work in `contour-engine.ts` or a focused helper such as `toolpaths.ts`. Pass configuration in the settings snapshot and return any export metadata with the render result. Browser-specific toggles and enable/disable behavior remain in `slicer.ts`.

### Add an export format

Keep serialization in a focused library module like `gcode.ts`. Let `slicer.ts` choose the serializer and handle browser download or clipboard APIs.

## Verification

Run all checks before committing:

```bash
npm run format:check
npm run doctor
npm run lint
npm run typecheck
npm test
npm run build
```

For changes to controls or bindings, also exercise upload, demo switching, orbit controls, undo/redo, randomization, preview rendering, and both SVG and G-code export in the browser. Build success verifies module and worker graphs, but it does not replace interaction testing.
