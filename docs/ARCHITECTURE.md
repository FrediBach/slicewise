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
- Complex panel subsections live in feature-named subdirectories such as `components/panels/contours/`. These components may reorganize declarative markup, but the runtime-facing control IDs, hidden wrapper IDs, defaults, and custom-event contracts remain stable.
- `components/panels/OutputPanel.tsx` is a compatibility barrel for the independently owned appearance, canvas, effects, vector-zoom, and export components under `components/panels/output/`. Callers should keep using the barrel unless they need one focused component in isolation.
- Top-level parameter groups use native `details` accordions through `components/ui/section.tsx`. Collapsing a group only changes its presentation; its controls remain mounted so `lib/slicer.ts` can keep binding to their stable IDs.
- `components/controls/FormControls.tsx` contains shared numeric, colour, checkbox, morph, and randomization controls.
- `components/controls/GradientChooser.tsx` owns editable gradient-stop state.
- `components/ui/*` contains small, style-oriented primitives without domain behavior.

### Geometry and export layer

- `mesh.ts` parses supported mesh formats, welds and normalizes geometry, and calculates vertex normals.
- `demo-meshes/index.ts` contains the deterministic procedural generators for the built-in demo sources.
- `projection.ts` owns deterministic camera bases, perspective blending, the discriminated projection-warp stage, optical lens warps, mesh projection, arbitrary world-point projection, and bounded adaptive projection of nonlinear polyline spans. Besides Klein↔Poincaré and Möbius transforms, it provides a radial exponential-map sphere lift, horizon-normalized stereographic/gnomonic/Lambert azimuthal projections, and circle inversion. Projection results distinguish valid, domain-clamped, and invalid samples; singular or out-of-domain samples split runs rather than leaking non-finite coordinates. Mesh contours, spirals, silhouettes, slice-exploded output, and imported SVG centrelines use this same pure projection path.
- `scalar-fields.ts` defines the vertex-authoritative mesh scalar-field contract and constructs planar, analytic wavefront, geodesic-distance, and normalized curvature fields. Geodesic modes include one source, nearest of two sources, signed distance difference, and a two-source Voronoi payload. Curvature display fields apply a symmetric robust percentile clamp and signed contrast curve without altering the mesh. It assigns field-specific topology cache keys and resolves compatibility for LFO, divergence, continuous spiral, and slice explosion. Analytic wavefront fields provide off-vertex evaluation and gradients; intrinsic fields interpolate finite vertex values without inventing an ambient evaluator or gradient and omit invalid samples.
- `mesh-topology.ts` builds and caches deterministic mesh connectivity. It stores lexicographically ordered unique edges, Euclidean edge weights, compact bidirectional adjacency, edge face incidence, boundaries, non-manifold edges, connected-component labels and sizes, and isolated vertices in typed arrays. A `WeakMap` keys the immutable derived topology by the installed mesh object; invalid triangles and non-finite or zero-length edges are diagnosed and omitted from adjacency.
- `mesh-geodesics.ts` computes deterministic single- and multi-source shortest paths over the cached weighted edge graph. Multi-source solves also return nearest-seed vertex labels; equal-distance ties select the lower seed vertex independent of source order. Unreachable vertices retain `Infinity` and label `−1`. Directional seeds use the normalized model-space extreme with vertex index as the tie-break. These values are **surface graph distances**, not continuous exact geodesics.
- `mesh-curvature.ts` computes cached Gaussian curvature from area-normalized angle defect and signed mean curvature from the cotangent Laplacian and oriented vertex normals. Scalar-only smoothing is deterministic and cached by method/iteration count. Boundary, isolated, degenerate, and non-manifold vertices are masked rather than converted into extreme values.
- `hyperbolic-tiling.ts` generates deterministic regular `{p,q}` tilings in the Poincaré disk. It constructs the central polygon from its hyperbolic circumradius, reflects polygons across diameter or orthogonal-circle geodesics, deduplicates tiles and unoriented edges with stable quantized keys, enforces a fixed edge cap, and samples arcs into transferable line-art runs.
- `contour-engine.ts` is the pure rendering coordinator. It calculates scalar fields, delegates projection math to `projection.ts`, optionally warps slice fields with in-plane LFOs, adaptively subdivides nonlinear intersections, slices triangles, and explicitly extracts two-source Voronoi boundaries where nearest-source labels differ. It then chains line segments, performs visibility and silhouette work, and returns SVG plus grouped centreline toolpaths. Output effects compose in a fixed order: geometry effects and clipping, path colour/weight styling, halftone styling, chromatic copies, map annotations, then document overlays. Mesh contours, imported SVG centrelines, and generated hyperbolic tilings share those composition rules. It must not read the DOM.
- `polyline-styling.ts` owns deterministic post-processing of finished 2D runs: sharp-corner detection, Ramer–Douglas–Peucker simplification, coordinate-seeded Humanizer displacement, and Yarn cut-and-curl selection and geometry. Keeping these transformations outside the contour coordinator makes them independently testable and reusable by future source types.
- `block-glitch.ts` owns deterministic rectangular glitch-region placement and plotter-real cut-and-translate geometry. Every block samples immutable finished linework; source windows and optional destination windows are removed from the base before translated fragments continue through Kaleidoscope, mask/artboard clipping, and Vector zoom.
- `scan-band-glitch.ts` resolves regularly spaced horizontal or vertical glitch bands with monotonic seeded selection. It reuses the block-glitch cut-and-translate kernel so density changes reveal stable additional bands and SVG/G-code receive identical sync-tear geometry.
- `staggered-slices.ts` partitions a centered region into contiguous strips and assigns ramped, alternating, or seeded displacement. Its resolved rectangles reuse the common block-glitch geometry kernel and remain identical across SVG and G-code.
- `wraparound-tear.ts` shifts one full-width or full-height band along its long axis, splits displaced fragments at the drawable edge, and wraps overflow to the opposite edge without losing plotter marks. It shares the rectangle clipping primitives used by the other glitch effects and runs identically for SVG and G-code.
- `tile-shuffle.ts` partitions a centered region into an equal-cell grid, deterministically selects a bounded subset, and resolves a seeded one-cycle permutation with no fixed cells. Its immutable-source rectangle mappings preserve SVG/G-code parity and ensure every selected destination receives exactly one selected source tile.
- `sample-and-hold.ts` resamples finished runs at bounded arc-length intervals and holds X or Y across fixed-size sample groups. It preserves closed-run closure, supports a continuous geometry mix, caps emitted samples, and feeds identical stepped centrelines to SVG and G-code.
- `misregistration.ts` creates one to three deterministic colour-copy transforms around the artboard centre. The contour coordinator re-clips these explicit runs to the artboard and active mask, serializes them as SVG layers, and emits each colour as a separate plotter pen group.
- `generative-mask.ts` evaluates the deterministic superellipse and dual angular-LFO output mask, creates its SVG boundary, and clips polylines for SVG/G-code parity. Fractional oscillator counts crossfade adjacent integer harmonics so morphing never opens the closed boundary.
- `kaleidoscope.ts` clips finished polylines to a radial wedge and alternately mirrors them around the artboard centre, preserving identical geometry for SVG and G-code.
- `vector-zoom.ts` crops rectangular or circular source regions, clears destination windows, uniformly scales vector detail into corner insets, and constructs segmented dashed borders and leaders for identical SVG/G-code output.
- `slicer-worker.ts` is deliberately small: it stores the current transferable mesh or line-art source, invokes `computeContours`, and reports results or errors. Line art transfers packed 3D points and run offsets plus a source-kind discriminator.
- `generativeMesh.ts` generates indexed meshes from implicit fields. Its worker transfers array buffers rather than cloning large arrays.
- `svg-mesh.ts` converts filled SVG artwork into extruded mesh geometry or pruned medial/scale-axis centreline polylines.
- `toolpaths.ts` owns rectangular clipping, near-endpoint joining, greedy run ordering, and reversible 2-opt refinement.
- `gcode.ts` converts grouped toolpaths into machine instructions, applies an export-time clipping safety net, and owns plotter-profile defaults.
- `slicer-export.ts` maps browser runtime state into SVG/G-code export artifacts and safe download names. It is DOM-free; `slicer.ts` remains responsible only for waiting for a current render, clipboard access, and initiating downloads.
- `render-settings.ts` is the exhaustive browser-state-to-worker-settings adapter. Its key list is compile-time checked against `ContourSettings`, omits runtime/request-only fields, derives the document title, and detaches mutable morph maps.
- `parameter-history.ts` owns the bounded, branch-aware undo/redo timeline. It clones values at its boundary and exposes navigation availability without knowing about controls or rendering.
- `parameter-migrations.ts` normalizes legacy and incomplete parameter snapshots before the browser runtime applies them. Compatibility defaults, legacy lens conversion, and saved vector-zoom validation belong here rather than in DOM restoration code.
- `animation-project.ts` owns the versioned, DOM-free animation project model and immutable timeline editing operations. `animation-interpolation.ts` applies easing and typed interpolation, including rounded integer counts, discrete seeds, and RGB colours. `animation-validation.ts` checks persisted project invariants, `animation-migrations.ts` repairs incomplete version-one data, and `animation-history.ts` creates an animation-scoped `ParameterHistory`. Evaluation produces one ordinary `ContourSettings` snapshot and always disables the separate overlaid X/Y Morph feature.
- `colorPair.ts` creates random ink/background combinations and ink-anchored harmonic gradients in OKLCH while enforcing contrast and gamut constraints.
- `mapAnnotations.ts` derives deterministic, plotter-safe elevation labels, generated locations, map symbols, and single-line lettering from finished contour runs.

### Browser orchestration

`slicer.ts` is the integration boundary for browser-only behavior. It owns the current settings, binds form controls, schedules worker renders, connects the pure history timeline to DOM restoration, manages randomization, handles orbit/pan gestures, and coordinates preview and export. Keep computation that can run without `document`, `window`, or mutable UI state out of this module.

## State and events

Most ordinary settings live in the runtime `state` object. Before rendering, `settingsSnapshot()` creates a serializable object for the worker. Meshes are sent only when their version changes; render requests then reference the worker's current mesh.

Complex React controls communicate through custom DOM events:

- `morphchange` and `morphseconddimension` synchronize morph targets.
- `randomlockchange` and `randomlockbulk` coordinate parameter locks.
- `randomizegroup` sends the randomizable parameter IDs from one accordion to the runtime.
- `gradientchange` publishes normalized gradient stops.
- `lineindexcolorschange` publishes one-based contour-index colour overrides.
- `setgradient` synchronizes generated gradient stops into the React editor.
- `restoreparameters` restores React-owned control state during undo/redo.
- `captureparametersnapshot` and `applyparametersnapshot` bridge the React snapshot manager to the runtime-owned parameter and lock state.

Named parameter snapshots are stored locally in IndexedDB by `parameter-snapshots.ts`. They use the same render-setting shape as undo/redo and additionally preserve randomization locks; active X/Y morph targets are already part of the render settings.

These event names and their payloads are internal interfaces. Change producers and consumers together.

Animation controls use `animationmodechange` for the top-level Config/Animation switch, `animationcommand` for transport and timeline editing, `animationstatechange` for runtime-to-React state, and `animationstaterequest` for initial synchronization. In Animation mode, `slicer.ts` freezes a normal render-settings snapshot and intercepts morphable control input before the ordinary Config bindings can mutate runtime state. Quick playback renders use explicit evaluated snapshots and do not enter parameter history; leaving the mode restores the frozen Config snapshot.

## Rendering and concurrency

Contour requests are assigned monotonically increasing IDs and mesh versions. Results from replaced meshes and stale full-quality responses are ignored. During an active orbit or roll gesture, a completed same-mesh quick response may be shown transiently while a newer request remains queued; outside direct manipulation, stale quick responses are discarded. The runtime adjusts throttling using triangle count, preview contour count, visibility work, curve quality, and preview morph instance count.

Interactive preview state is intentionally distinct from exact export state. Quick responses omit export toolpaths and adapt contour density, curve precision, and morph-grid dimensions. Detail begins at two-thirds, rises through discrete steps to full detail after several fast end-to-painted-frame measurements, and falls with a wider slow-frame threshold to avoid oscillation. A completed gesture always requests an exact render with the full contour and morph settings, and only the latest full-quality response updates the stored SVG and toolpaths used by copy and download. The measured preview cost also replaces the conservative static throttle estimate once samples are available. Export actions automatically request a current full-quality result when necessary.

Pan and wheel zoom use a temporary SVG group transform for immediate feedback. Their exact clipped geometry is recomputed when the pointer gesture ends or wheel input has been idle for 140 ms. Orbit and roll still require worker projection and visibility work, so they use the lightweight quick-render path while dragging.

Scalar fields with a non-empty `cacheKey` use a bounded set of at most eight 3D slice topologies per mesh. Every active planar decorator and contour-spacing parameter that changes topology participates in that key. The model-space `up`, `x`, `y`, custom, analytic wavefront, and geodesic fields opt into this cache. Orbiting can then reproject cached polylines instead of rescanning every triangle at every contour level. Camera-axis fields use an empty key and remain uncached because their vertex values change with the camera.

Mesh connectivity uses a separate lifetime cache in `mesh-topology.ts`. One installed mesh object maps to one immutable derived topology, reused by every surface-graph distance solve and intrinsic field. Replacing the installed mesh naturally releases the old entry through the weak key. `scalar-fields.ts` additionally retains at most eight least-recently-used single-seed distance buffers and eight two-seed nearest/label buffers per mesh, preventing directional morphing from growing memory without bound. `mesh-curvature.ts` weakly caches both raw methods and their bounded 0–20 smoothing variants for the installed mesh.

Session 13 profiling retained this worker-local cache design. On the 312-vertex/576-triangle release fixture at 24 contours and quality 7, cold exact renders ranged from about 9–46 ms and warm renders from about 5–12 ms on the audit machine; topology transfer at mesh installation would add protocol complexity without addressing the measured bottleneck. The maximum UI tiling sweep found `{11,12}` at depth 6 reached the 12,000-edge cap with 29,436 sampled nodes in about 18 ms. Its installed point/normal/offset typed arrays occupy about 0.72 MiB per main-thread or worker copy; source replacement releases those arrays and mesh-keyed weak caches.

Nonlinear projected runs are adaptively subdivided in world space before visibility splitting and SVG/G-code simplification. The sheet-space chord tolerance follows curve quality, with a maximum recursion depth of eight and at most 8192 projected nodes per source run. Exact SVG and G-code therefore share the same curved centreline geometry; quick previews naturally use their reduced curve quality. Paired source/output samples keep visibility coordinates aligned when slice explosion displaces the emitted geometry.

The hidden-line depth buffer rasterizes projected source triangles directly for affine and bounded disk transforms. Spherical and inversion modes adaptively tessellate source faces to a depth-buffer-pixel error tolerance, with a recursion cap of four. Faces crossing a horizon or singular domain are subdivided; only finite valid subfaces are rasterized. Visibility retains its neighboring-pixel tolerance around the resulting surface.

Every render request carries an explicit detached settings snapshot, quick/exact quality, record/ignore history policy, and Config/animation-preview/animation-export purpose. Animation snapshots defensively disable both Morph dimensions and never replace the exact Config SVG/toolpaths used by ordinary export. Stale-response checks include both the request ID and purpose; animation-export results are routed away from the visible preview for the dedicated exporter.

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

Finished-polyline transformations belong in `polyline-styling.ts` when they do not need mesh, scalar-field, projection, or document context. Effects that change the common clipping/composition order should stay coordinated by `contour-engine.ts` and call a focused helper.

### Add an export format

Keep serialization in a focused library module like `gcode.ts`. Let `slicer.ts` choose the serializer and handle browser download or clipboard APIs.

Machine/profile mapping and file metadata belong in `slicer-export.ts`; controller-neutral instruction generation belongs in `gcode.ts`.

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
