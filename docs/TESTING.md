# Testing Slicewise

Slicewise uses Vitest for unit and integration tests, Testing Library for React interactions, jsdom for browser-like component tests, and V8 for coverage.

## Commands

```bash
npm test                 # run the suite once
npm run test:watch       # rerun affected tests during development
npm run test:coverage    # run tests and write coverage/index.html
npm run doctor           # audit React health; fail on error-severity findings
npm run test:3d          # internal Phase-0 kernel fixture regressions
npm run bench:3d -- 20   # 20 repetitions; JSON timings and process memory samples
npm run bench:3d -- 5 contours # triangle-derived tools on six source fixtures
npm run build:3d         # separate local WASM/worker developer-page build
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

`solid-kernel.test.ts` exercises the real Manifold WASM kernel, including groove/rib volume direction on sphere, box and sheared-box fixtures, deterministic geometry, input immutability, exact neutral buffers, asymmetric millimeter bounds, measured box penetration/protrusion, untreated torus and enclosed-cavity retention, explicit rejection of degenerate analytic torus treatments, overlapping tools, disconnected bodies, malformed/open input rejection, budgets, and owned-handle cleanup on success/failure/repetition. Boundary shell counts are kept distinct from physical body counts. It also verifies rejection of source faces that the native kernel would silently remove, exact neutral auditing, retained input warnings and cleanup on independent audit failures. These checks are not a complete solid or manufacturing validator. The separate browser worker trial, cancellation procedure, benchmark context, and remaining Phase-0 gates are documented in [THREE_D_FEASIBILITY.md](./THREE_D_FEASIBILITY.md).

`print-validation.test.ts` covers closed shells, edge/winding defects, vertex fans touching at one vertex, indexed duplicates, zero-area faces, cavity volumes, translated volume stability, mutable input cache isolation, warning counts and bounded locations, malformed inputs and budgets. Overlapping shells now fail non-adjacent contact checks; misplaced cavities now fail shell orientation checks.

`print-intersections.test.ts` covers transverse crossings, coplanar overlaps/containment, unindexed edge/point contact, disjoint triangles with overlapping bounds, winding/order/transform invariance, declared tolerance, bounded samples, incomplete budget results, pruning and mutable-buffer isolation. Adjacent cases cover flat/convex/concave shared edges, folded edges, shared-vertex crossings, disjoint direction cones, index/winding/transform invariance and near-coplanar uncertainty. A captured Float32 contour-torus pair has an exact integer-arithmetic interior-point witness confirming an actual overlap. Kernel integration rejects contacting source/tool shells and a closed manifold octahedron with a folded face fan, and verifies unchanged inputs and zero remaining native handles. The contour torus Inset passes; Emboss rejects four adjacent pairs with complete diagnostics.

`print-shells.test.ts` covers cavity preservation, nested solid islands, wrongly oriented nested/disconnected shells, multiple cavities and bodies, reordered shells, bounding-box false positives, translated geometry, unused vertices, prerequisite failures, numerical uncertainty and work/shell/triangle caps. Kernel tests distinguish a body in a torus hole from a cavity inside its tube, reject an inward shell in empty space as a source or tool, and verify body counts and handle cleanup.

`print-manufacturing.test.ts` covers placed/floating/below-bed boxes, exact build-volume limits, overhang angle conventions, clipped sloping faces, cavity ceilings, multiple bodies with individual bed contact, reordered nested material islands, full counts with bounded face samples, unused vertices, detached settings, mutated geometry and invalid assumptions. Thickness remains unperformed unless explicitly configured; stability and the full manufacturing check remain unperformed. Optional thin-plate integration verifies estimate advisories and detached priority settings.

`print-thickness.test.ts` covers known box dimensions, thin plates, translation, cavity boundaries, disconnected bodies, deterministic priority sampling, bounded work with discarded partial rays, ambiguous edge/near-origin hits and invalid settings. These tests verify sampled normal chords, not a guarantee of global wall thickness or structural strength.

`slice-geometry.test.ts` covers exact triangle/barycentric alignment, plane normalization, run/level ordering, buffer isolation, compatibility with generic unsmoothed drawing intersections, cuts through vertices/edges, coincident but topologically separate surfaces, open paths, branching/coplanar failures and budgets. The shared drawing chaining routine is guarded by the full contour integration suite. `slice-treatment.test.ts` checks deterministic All/range/every-N selections, zero/open/budget cases, detached recipes, real capsule geometry, independent line/triangle feature measurements, tilted and deformed surfaces, multiple torus runs and native-failure cleanup. `src/dev/three-d-feasibility.test.ts` exercises suite routing, stale replies, cancellation, error recovery and page-exit cleanup with a mock worker; real-browser WASM responsiveness still needs manual verification.

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
- Animation preview caching: slow-worker backpressure and visible completion, stable frame slots, loop-aware prefetch, bounded bytes/frame count, progressive temporal sampling, and project/mesh invalidation. `animation-runtime.test.tsx` exercises the real runtime with a deliberately delayed worker, including cached replay and exact pause settling.
- Animation video export: endpoint-inclusive frame timing, timestamps, even aspect-preserving resolution presets, saved quality choices and defaults, dialog confirmation/cancellation and focus restoration, suppression of background shortcuts, UI command/locking contracts, codec support refresh after edits and undo/redo, selected bitrate propagation to the encoder, opaque backgrounds, safe filenames, progress/cancellation, and resource cleanup. jsdom tests emulate native dialog opening/closing; modal focus containment and visual layout still need a browser check when available.

Avoid snapshots of entire panels. They are noisy and do not prove that controls remain connected to the imperative runtime. Prefer assertions about accessible controls, event payloads, and exported data.

`non-euclidean-integration.test.ts` is the release compatibility matrix. It combines every new projection/field family with quick and exact rendering, camera transforms, X/Y morphs, gradients and indexed colours, Humanizer, Yarn cut & curl, artboard and mask clipping, blueprint/topographic output, SVG centreline projection, generated tiling line art, and both G-code origins. Keep focused kernel tests as the primary numerical specification; extend this matrix when a new feature family must share the complete composition pipeline.

When fixing a bug, first add the smallest test that reproduces it at the closest stable boundary. Add broader integration coverage only when the bug crosses module boundaries.

## Coverage

Coverage currently measures the focused core under active test:

- `animation-project.ts`
- `animation-storage.ts`
- `animation-playback.ts`
- `animation-frame-cache.ts`
- `animation-history.ts`
- `animation-interpolation.ts`
- `animation-migrations.ts`
- `animation-validation.ts`
- `animation-video-export.ts`
- `block-glitch.ts`
- `colorPair.ts`
- `contour-engine.ts`
- `contour-refinement.ts`
- `contour-features.ts`
- `contour-sequence.ts`
- `demo-meshes/index.ts`
- `euclidean-rhythm.ts`
- `gcode.ts`
- `gcode-3d-toolpaths.ts`
- `gcode-calibration.ts`
- `gcode-layout.ts`
- `gcode-nib-footprint.ts`
- `gcode-profiles.ts`
- `gcode-surface-presets.ts`
- `grbl-serial.ts`
- `gcode-validation.ts`
- `generativeMesh.ts`
- `generative-terrain.ts`
- `hyperbolic-tiling.ts`
- `mapAnnotations.ts`
- `map-features.ts`
- `terrain-routes.ts`
- `map-settings.ts`
- `mesh.ts`
- `planar-sweep.ts`
- `contour-approximation.ts`
- `print-thickness.ts`
- `print-manufacturing.ts`
- `print-shells.ts`
- `print-intersections.ts`
- `print-validation.ts`
- `solid-kernel.ts`
- `slice-geometry.ts`
- `slice-treatment.ts`
- `mesh-deformation.ts`
- `object-settings.ts`
- `mesh-curvature.ts`
- `mesh-geodesics.ts`
- `mesh-topology.ts`
- `misregistration.ts`
- `music-quantization.ts`
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
- `sequencer-project.ts`
- `sequencer-events.ts`
- `sequencer-playback.ts`
- `sequencer-probability.ts`
- `web-audio-engine.ts`
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

`generative-terrain.test.ts` verifies deterministic height fields, square boundaries without a base, winding/normals, independent parameter effects, and terrain contour integration. `terrain-runtime.test.tsx` exercises source switching, slider/number synchronization, queued generation, and stale worker replies. `mapAnnotations.test.ts` covers scalar-level labels, collision rejection, rotated plotter gaps, and decorative line-art fallback.

`map-features.test.ts` verifies layer isolation, zero/count controls, deterministic density prefixes, footprint bounds, scale, and SVG/plotter geometry. `map-runtime.test.tsx` covers effect enablement, slider/number bindings, worker settings, undo, and redo. Map snapshot migrations preserve zeros and sanitize invalid counts.

`terrain-routes.test.ts` verifies strictly downhill valley drainage, accumulated tributaries, stopping in depressions, road detours through passes, rejection of impassable cliffs, exact terrain sampling after welding, and model-space route projection. Terrain runtime tests verify transfer of the source capability and route control availability across up-axis changes.

`contour-weave.test.ts` covers thread geometry on source triangles, separate overlapping folds, material-index patterns and phase, complementary cut fragments, gap protection, surface ribbons, density/orientation/twist, cached geometry, migration of obsolete copy transforms, common projection/visibility, mesh-only operation, colour morphs, and protected pen grouping. `contour-weave-runtime.test.tsx` covers the new fabric controls, disabled superseded slice settings, worker snapshots, undo/redo, numeric/colour morph targets, and randomization locks. G-code tests verify that travel optimization preserves physical weave gaps.

`contour-refinement.test.ts` covers sparse closed-loop accuracy, slice-plane and endpoint preservation, deterministic output, straight/degenerate fallbacks, S bends, and bounded subdivision. The contour-engine regression checks that the top torus-knot slices remain closed without false sharp corners; scalar-field tests preserve authored faces and quality-one intersections.

`svg-slice-field.test.ts` checks bounded path intersections, divergence, disconnected subpaths, preview/export integration, and complexity errors. `svg-slice-parser.test.ts` checks compound paths, open strokes, transforms, and empty artwork. `svg-slice-runtime.test.tsx` exercises upload, disabled incompatible controls, placement worker snapshots, and undo/redo.

`contour-effects.test.ts` also verifies that the nonconvex twin-balls silhouette retains its complete boundary at low camera elevations while genuinely occluded torus-knot silhouette spans remain hidden. Silhouette visibility accepts uncovered pixels within its existing two-pixel neighbourhood; ordinary contour visibility retains its depth-only test.

`slice-rays.test.ts` verifies planar outward directions, winding independence, holes, concavity, bounded lengths, deterministic variation, physical fade gaps, zero/invalid settings, legacy normalization, source-feature isolation, hidden-line/preview/export integration, and incompatible-mode bypass. `slice-rays-runtime.test.tsx` exercises control enablement, slider/number synchronization, worker snapshots, undo/redo, and slicing-mode compatibility.

`slice-ray-surface.test.ts` verifies source-normal interpolation and face fallback, open contours, local field tangents, singular-direction rejection, translated fade gaps under explosion, and actual ray output for spherical/cylindrical fields, all geodesic modes, curvature, divergence, and LFO modulation. The non-Euclidean compatibility matrix enables rays through projection warps, morphs, clipping, effects, and both G-code profiles. Runtime ray tests cover the expanded field availability and retained unsupported modes.

Origin-driven ray regressions check spherical and cylindrical source positions inside and on either side of a surface, reject entry crossings, verify alignment away from the origin, and confirm the same propagation direction in exported contour toolpaths.

`mesh-deformation.test.ts` verifies exact neutral behavior, immutable source data, rotation before fixed-axis deformation and normal transforms, analytic ripple amplitude/phase/direction on all axes, deterministic seeded organic displacement and coincident seams, feature-size refinement, taper/twist/bend geometry, localized bulge/pinch profiles and moving centres, narrow-band refinement reuse, shear volume/connectivity and inverse-transpose normals on all axes, combined transform order, shared-edge closure and manifold topology on all axes, bounded cache eviction, finite extreme/flat input, and source capabilities. `object-integration.test.ts` compares every slice-field mode against an explicitly deformed mesh, including visibility, silhouettes, rays and both G-code origins. It also covers nonlinear projection, weave, LFO, spiral, per-instance X/Y ripple/organic morphs, and animated geometry with discrete organic seeds. The release compatibility matrix also enables bulge, shear, ripple, and organic displacement through its downstream effect combinations. `object-runtime.test.tsx` exercises all numeric bindings, axis changes, toggles, reset/undo, snapshots, locks and group randomization, line-art source switching, and animation editing/restoration.

`three-d-feasibility.test.ts` in `src/lib/` verifies the deterministic 100,352-triangle, 24-slice scale fixture and completed source intersection auditing followed by rounded-tool recipe budget rejection across repetitions, including stage diagnostics, JSON serialization and zero remaining adapter handles. It asserts no machine-specific timing threshold. The scale workload is available through `npm run bench:3d -- 3 scale`; an early rejection does not satisfy the final-preparation performance target.

The intersection suite also compares BVH traversal counts and sampled face pairs against exhaustive two-face contact queries across reordered groups, with exact and just-insufficient work-budget checks. The optimized traversal keeps all narrow predicates and rejection tolerances unchanged.

`contour-approximation.test.ts` independently measures circular-path deviation, checks retained concave corners, detached deterministic buffers, rigid transforms, and input/collapse/work-budget rejection. Recipe integration verifies explicit opt-in, unchanged exact defaults, and real-kernel groove/rib dimensions after collinear subdivision removal. The scale-approximate feasibility test records the measured 0.05 mm reduction and retained recipe-budget rejection.

`planar-sweep.test.ts` checks closed deterministic miter tubes, linear face counts, circular-path volume/radius, reported corner extension, reversed/tilted planes, native Inset/Emboss integration, and rejection of nonplanar, acute, self-contacting or over-budget inputs. The `scale-sweep` CLI benchmark separately records complete tool construction followed by current final-output rejection; it is not a passing performance gate.

`three-d-project.test.ts` checks raw normalization provenance, restored asymmetric physical dimensions, uniform sizing, print-axis order, bed offsets, shared deformation, immutable buffers, session identity and unsupported inputs. `three-d-runtime.test.ts` checks detached worker input, bounded queued edits, stale source/revision rejection, errors, exit cleanup and restart. `three-d-workspace-runtime.test.tsx` exercises the real app bindings across Animation/3D/Config/Sequencer, physical and shared Object undo/redo, a single Config exit transaction, source replacement, remembered sizing and disabled drawing export. Geometry remains explicitly untreated and unvalidated.

The 8 September 2026 workspace check passed in local headless Chromium: lazy WebGL load, camera-only orbit/reference/projection changes preserving exact physical vertices, sizing, print orientation/bed placement, Animation restoration, source reset/recall, shared Object edits and Config undo, explicit OBJ millimeter sizing with Y-up correction, repeated mode cleanup, and desktop/tablet/phone layouts. There were no page errors and only the expected three workers remained after re-entry (drawing, generation, 3D). This checks the untreated workspace; it does not verify the separate WASM trial, GPU memory over long sessions or physical printing. The in-app browser bridge was unavailable, so an installed headless Chromium was used.

Verification: formatting, lint, typecheck, Doctor and the production build passed. Doctor retains its five existing warnings. The default five-second test limit intermittently times out existing `OutputPanel.test.tsx` Effects-control queries, including when that file runs alone; the complete suite passes **848 tests** with `npm test -- --testTimeout=15000`. Repository test timeouts were not changed. `ThreeDWorkspace.test.tsx` also covers signed numeric drafts, rejected out-of-range values and external history restoration.

`three-d-preparation.test.ts` covers shared eased levels, frozen View depth versus camera/print transforms, selected-level overlays, empty ranges, real-kernel Inset/Emboss on an asymmetric box, placed-result auditing, separate manufacturing status, immutable inputs, unsupported fields/modifiers and rejected source geometry. `three-d-runtime.test.ts` additionally checks progress without premature completion, native-worker termination/restart, stale post-cancel replies, invalidation on edits and duplicate-request retention of accepted artifacts. Workspace tests verify a single instance of shared field/count controls, shared slice edits, alignment undo and preparation/cancel/export gates. Existing drawing integration tests guard the unchanged easing function extracted into `slice-spacing.ts`.

The follow-up treatment milestone passed the same headless Chromium interaction regression against both Vite development and production preview servers: compact 26 px buttons, shared selected slices, fixed View depth and explicit alignment, cancellation during first local WASM loading and fresh-worker restart, accepted Inset and Emboss on an imported asymmetric box, source/result comparison, invalidation after edits, unsupported-field rejection, source replacement and mode cleanup. Desktop and phone screenshots were inspected. No page errors occurred; three expected workers remained after re-entry. This does not establish native cancellation timing on large Boolean workloads or long-session peak memory. The browser check also exposed redundant blur-triggered geometry requests; identical requests now preserve the current accepted artifact and this has a runtime regression.

Follow-up verification: **856 tests** pass with `npm test -- --testTimeout=15000`; formatting, lint, typecheck, Doctor and both production/developer-trial builds pass. Doctor retains the same five existing warnings. Both builds emit the expected Manifold `node:module` externalization warning; the production browser run successfully loads and executes the local kernel. No public solid export is enabled.

The worker-cache follow-up adds coverage for reuse across placement/selection edits, transferred reply buffers, cached versus fresh preparation equivalence, independent slice invalidation, size/Object/source changes, exact source-array changes and retention-budget fallback. The full suite passes **859 tests** with the same 15-second timeout allowance; typecheck, lint, formatting, Doctor and the production build pass. The headless browser workflow also passes with compact 26 px controls, real Inset/Emboss, cancellation/restart, source comparison/replacement and mode cleanup. Long-session memory profiling remains outstanding.
