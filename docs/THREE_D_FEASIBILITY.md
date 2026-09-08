# 3D mode: Phase-0 feasibility record

Status: kernel spike, triangle-derived capsule sweeps, independent topology audits and surface-contact checks including adjacent faces implemented, 8 September 2026. **The Phase-0 gate is still open.** Manifold 3.5.3 is pinned for evaluation, not yet selected for a public printing release. No production controls or export behavior have changed.

## Implemented

- A DOM-free `solid-kernel.ts` boundary for indexed Float32 XYZ / Uint32 triangle buffers in Z-up millimeters. It imports copies, unions overlapping tools, subtracts grooves or adds ribs, and returns detached output with volume, bounds, triangle count and connected boundary-component count. Boundary components are not physical bodies: an enclosed cavity contributes an additional shell.
- Neutral operations retain the original mesh object and buffers exactly, while checking kernel acceptance. No Boolean runs for Off or an empty tool set.
- Input limits of 250,000 total triangles, 64 tools and 64 MiB of typed-array buffers, plus intermediate/output triangle limits. These do **not** constrain peak WASM working memory. Budget failures reject the operation rather than silently reducing detail.
- Explicit deletion of owned Manifold handles, including decomposition results and failure paths. The returned handle counter measures adapter ownership, not the WASM allocator or heap capacity.
- A separate local WASM worker trial with run, repeated-run, terminate/cancel and restart controls. The normal application entry does not import the spike. Its dedicated build emits the worker and WASM locally; no CDN is involved.
- `slice-geometry.ts` retains ordered levels, source revision, a fixed planar direction, XYZ points, segment triangle ownership, endpoint barycentrics, geometric face normals, run offsets and closure flags in serializable buffers. Roots join by source edge/vertex identity, never spatial proximity. Coplanar faces, branching cuts, malformed inputs and exceeded budgets fail explicitly. Open runs remain identifiable and cannot become closed treatment tools. The existing drawing run-chaining routine was moved here unchanged; the stricter manufacturing extractor does not replace drawing smoothing or field behavior.
- `slice-treatment.ts` selects whole levels with All, inclusive ranges or every-N patterns with wrapped offsets. It creates detached circular capsule recipes. Zero radius produces no tools; the kernel retains exact source buffers for neutral operations. Primitive budgets preserve the whole selection or reject it.
- Rounded tools use convex hulls of identically oriented endpoint spheres, unioned in batches of eight. Constructed tools must have one connected boundary shell both natively and after Float32 buffer conversion. Extra shells fail instead of being removed. This is a circular profile trial; independent width/depth and surface-normal profile frames remain unimplemented.
- `print-validation.ts` audits the exact input/tool/result buffers independently of WASM: finite coordinates and indices, zero-area and duplicate indexed faces, edge incidence, opposing edge winding, single-cycle vertex links and signed shell volumes. Reports include bounded vertex/triangle samples, full issue counts and explicit unperformed checks. Invalid artifacts fail; unused vertices remain warnings, and source/tool reports survive in result metadata. Nothing is welded, reversed or discarded by the auditor.
- `print-intersections.ts` now rejects surface contacts after basic topology checks, including overlap beyond an indexed shared edge or vertex. It records the tolerance, triangle pairs, work performed and whether its counts are complete. Adjacent and non-adjacent pairs have separate counts; `selfIntersections` now records the full conservative surface audit.

The [Manifold API](https://manifoldcad.org/docs/jsapi/classes/manifold.Manifold.html) requires explicit deletion and oriented manifold imports. Its import may collapse degenerate triangles or unnecessary vertices. This adapter does not add welding, hole filling, winding correction or other repair. Kernel acceptance and positive signed volume are insufficient evidence of geometric or printing validity.

## Fixtures and evidence

The initial analytic suite uses one fixed equatorial tool with a 0.6 mm circular radius. Sphere and torus use revolved circular tools; the box uses cylindrical segments joined with spheres. The deformed fixture uses the existing Object shear implementation on the box. These baseline tools remain available separately from the newer contour-driven suite below. Width and depth are coupled in both trials; the proposed independent production controls are not implemented.

| Fixture     | Base dimensions (mm) | Base triangles | Inset triangles | Emboss triangles |
| ----------- | -------------------- | -------------- | --------------- | ---------------- |
| Sphere      | 40 × 40 × 40         | 2,048          | 7,248           | 7,760            |
| Box         | 40 × 30 × 50         | 12             | 148             | 660              |
| Torus       | 60 × 60 × 20         | 8,192          | 13,760          | 14,272           |
| Sheared box | 55 × 30 × 50         | 12             | 172             | 700              |

The initial thirteen kernel tests established volume changes, edge closure, determinism, input isolation and selected dimensions, plus failure/cleanup behavior. These historical measurements precede the independent topology audit below: **the analytic torus treatments are now rejected for zero-area output faces**, despite passing the earlier kernel-only checks. The box measurements remain 0.6 mm penetration/protrusion at equatorial samples. These measurements do not establish width accuracy at corners, on the sheared surface or between samples.

Initial Node benchmark: Apple M3 Max, arm64, Darwin 24.6.0, Node 25.5.0; 20 repetitions / 240 operations. Inset and Emboss timings are combined below and include input conversion, tool union, Boolean evaluation, measurements and output copies. Fixture construction and module startup are excluded.

| Fixture     | Minimum (ms) | Median (ms) | Maximum (ms) |
| ----------- | ------------ | ----------- | ------------ |
| Sphere      | 16.07        | 16.76       | 22.10        |
| Box         | 0.78         | 0.94        | 1.20         |
| Torus       | 23.78        | 24.68       | 25.62        |
| Sheared box | 1.08         | 1.23        | 1.50         |

All 240 operations ended with zero adapter-owned handles. Process RSS sampled before/after the run was 126,746,624 / 180,502,528 bytes; external memory was 41,486,039 / 46,195,068 bytes. These include Vite, JavaScript, allocator retention and WASM. They are neither peak measurements nor evidence that the planned 256 MiB geometry working-set target is met. These small fixtures also do not establish the proposed 100k-triangle / 24-slice performance target.

## Triangle-derived sweep follow-up

The contour suite slices each actual fixture mesh at level 3.7 mm, using Z height except for the box, whose fixed direction is normalized from `[0.2, 0.1, 1]`. It includes both torus runs and meshes evaluated by the existing 60° twist and 45° bend operations. It does not reuse analytic rings. The capsule radius is 0.6 mm with a requested 0.05 mm profile tessellation tolerance; this tolerance is not a certification of feature dimensions on arbitrary surfaces.

The initial cylinder/sphere construction produced tiny unintended cavity shells on tilted cuts (measured signed volumes around 10⁻¹⁰ mm³). Replacing those joins with convex capsules built from identical endpoint spheres eliminated the extra shells on the regression fixtures. Both native and transferred tool topology are checked; silently deleting those cavities would hide the construction defect.

Eighteen additional tests cover triangle/barycentric alignment, generic-plane agreement with unsmoothed drawing intersections, exact edge/vertex cuts, topologically separate coincident surfaces, ambiguous/open cuts, bounded selections, detached recipes, repeatable tool geometry, tilted sweeps, torus-hole retention, twisted/bent surfaces, zero operations and cleanup after an injected native construction failure. Independent line/triangle samples measure 0.6 mm penetration/protrusion on the box face and unchanged geometry outside the 1.2 mm nominal footprint. A jsdom worker-controller test covers suite routing, cancellation, stale replies, errors and page-exit cleanup; it does not prove native browser cancellation responsiveness.

Five repetitions on the same Node/M3 Max environment produced 60 accepted Boolean results, zero rejected fixtures and zero remaining adapter-owned handles. Each result retained the expected single boundary shell. Median times in milliseconds:

| Fixture     | Source triangles | Runs / path vertices | Extraction + recipe | Tool construction | Inset Boolean + measurements |
| ----------- | ---------------- | -------------------- | ------------------- | ----------------- | ---------------------------- |
| Sphere      | 2,048            | 1 / 116              | 0.83                | 145.17            | 11.25                        |
| Tilted box  | 12               | 1 / 8                | 0.06                | 9.02              | 0.69                         |
| Torus       | 8,192            | 2 / 512              | 3.36                | 835.79            | 58.22                        |
| Sheared box | 12               | 1 / 8                | 0.10                | 7.99              | 0.81                         |
| Twisted box | 6,144            | 1 / 192              | 2.21                | 252.80            | 21.37                        |
| Bent box    | 6,144            | 1 / 194              | 2.58                | 268.76            | 17.29                        |

Tool construction includes native unions, measurements and buffer-round-trip checks. The torus already misses the proposed 500 ms preview target with one selected slice; optimization or a different sweep construction is still needed before testing a public performance envelope. Source/model generation and module startup are excluded from these timings.

The process-wide peak RSS was 213,392 KiB; before/after RSS was 126,795,776 / 218,497,024 bytes. The benchmark now reports the OS high-water mark as well as memory samples. This includes Vite, fixture generation, JavaScript and WASM across the entire process and still does not isolate peak kernel allocation or establish a browser memory limit.

## Independent topology audit follow-up

The audit checks each vertex's triangle link as well as its edges. Two closed tetrahedra touching at one shared vertex pass edge incidence and winding but fail the link's single-cycle requirement. Indexed duplicate faces and geometrically collinear faces fail before import can silently collapse them. A translated box retains its measured volume through per-shell local origins and compensated summation. Negative cavity shells are preserved; unused vertices are reported without changing source buffers.

At this stage, the result status was **topology-checked**, never geometry-valid or print-ready. `selfIntersections`, `shellContainment` and `manufacturing` remain explicitly `not-run`. At this stage, overlapping boxes passed the implemented topological checks while still requiring intersection rejection, and a misplaced inward shell required containment analysis. The contact follow-up below now rejects the overlapping-box case. The auditor reuses connectivity with a fresh cache key so changed caller buffers cannot inherit a stale audit.

Bounds are 250,000 triangles / 750,000 vertices, with at most 32 vertex and triangle sample IDs per issue. Counts include every detected occurrence, not just the samples. Connectivity's existing minimum edge length of 10⁻¹² mm is treated as an unsupported-scale error instead of silently skipping those edges. Checks are read-only and never repair geometry.

Fourteen new regressions cover the auditor and its kernel integration. Both analytic torus operations now reject **160 zero-area faces** in their Float32 output. This limitation remains visible in benchmark rows with structured diagnostics; the runner continues through other operations instead of aborting the whole suite. A separate regression demonstrates that Manifold accepts a source with a degenerate face by dropping it, while the new guard rejects that exact source even for Off. These failures are intentional until an explicit, tolerance-accounted conversion/cleanup step is implemented and revalidated.

The newer contour-driven torus remained supported by the topology-only checks at this stage. Its Emboss result is now rejected by the adjacent-face checks below. Three repetitions produced 36 topology-checked contour results, zero rejected contour fixtures and zero remaining adapter-owned handles. One analytic repetition produced 10 topology-checked results and the two expected torus rejections, also with zero remaining handles. On the same Node/M3 Max environment, median tool-construction / Inset-operation times including the added audits were:

| Fixture     | Tool construction (ms) | Inset + audits/measurements (ms) |
| ----------- | ---------------------- | -------------------------------- |
| Sphere      | 149.37                 | 25.60                            |
| Tilted box  | 9.68                   | 1.68                             |
| Torus       | 855.89                 | 119.98                           |
| Sheared box | 8.03                   | 1.52                             |
| Twisted box | 258.89                 | 53.18                            |
| Bent box    | 275.49                 | 45.58                            |

Process peak RSS was 353,360 KiB; before/after RSS was 129,236,992 / 361,512,960 bytes. The additional JS topology structures increase allocation pressure. This remains a process-wide measurement including Vite and WASM, not an isolated geometry budget; memory optimization and browser measurements are still required.

Topology-audit verification: 779 tests across 102 files pass, including 45 focused 3D tests. Formatting, lint, typecheck and both production/developer builds pass. React Doctor reports only the five existing warnings outside this change. The developer build retains the Manifold `node:module` externalization warning; browser loading and cancellation remain unverified.

## Non-adjacent contact follow-up

After topology and signed-volume checks, exact source, active-tool and output buffers now undergo a bounded non-adjacent contact audit. A deterministic median bounding-volume hierarchy prunes separated triangle bounds. The narrow test projects triangles onto separating axes, including in-plane edge normals to handle coplanar pairs. The method follows the [Geometric Tools separating-axis description](https://www.geometrictools.com/Documentation/MethodOfSeparatingAxes.pdf); this implementation uses conservative floating-point comparisons, not exact predicates.

The reported tolerance is `max(1e-10 mm, 64 × Number.EPSILON × maximum absolute referenced coordinate)`. Geometry is never moved or welded. A pair without a separating gap beyond that tolerance is rejected as `non-adjacent-contact`; this includes unresolved near-contact, touching shells and coplanar overlap. Translation can increase the conservative tolerance. Unused coordinates do not affect it.

At this stage, pairs sharing **any indexed vertex** were excluded. Their expected vertex/edge contacts still needed to be distinguished from overlaps beyond that shared boundary. Therefore `nonAdjacentIntersections` could pass while the broader `selfIntersections`, `shellContainment` and `manufacturing` checks remained `not-run`; the adjacent-face follow-up below closes that pair-coverage gap. The overall result still says **topology-checked**, not geometry-valid. Nested outward shells and misplaced inward shells remain unresolved; the new audit does not infer physical body count or shell orientation.

The cap is 250,000 triangles and five million traversal/leaf-candidate visits per artifact. Tree construction is bounded by the triangle cap; the visit budget covers the subsequent query work. Exhaustion rejects the artifact, retains up to 32 triangle-pair samples and explicitly marks counts incomplete (lower bounds). A completed audit records all detected pair counts even after sample storage fills. Benchmarks preserve these fields in JSON.

Eleven additional regressions cover transverse and coplanar contact, gaps, ordering/transform invariance, explicit adjacent-face exclusions, numerical tolerance, diagnostic and work limits, spatial pruning, cache isolation and kernel source/tool rejection. Three contour repetitions produced 36 passing results, no rejections and zero remaining adapter-owned handles. The analytic repetition retained the same ten passing results and two torus rejections for 160 degenerate faces each, with zero remaining handles. Maximum output contact-audit work was 1,914,142 visits. On the same Node/M3 Max environment, median times including the additional checks were:

| Fixture     | Tool construction (ms) | Inset + audits/measurements (ms) |
| ----------- | ---------------------- | -------------------------------- |
| Sphere      | 171.39                 | 54.13                            |
| Tilted box  | 11.53                  | 4.26                             |
| Torus       | 942.29                 | 249.28                           |
| Sheared box | 9.84                   | 3.06                             |
| Twisted box | 289.17                 | 110.43                           |
| Bent box    | 313.30                 | 116.95                           |

Process peak RSS was 381,328 KiB; before/after RSS was 125,747,200 / 388,513,792 bytes. This is still process-wide, not an isolated working-memory bound. The added audit cost reinforces the need for optimization and representative browser measurements before a public performance claim.

Contact-audit verification: all 56 focused 3D tests pass. The full run passed 789 of 790 tests, with the previously observed five-second timeout in `OutputPanel.test.tsx`; an isolated rerun of that file passed all 13 tests without changing its timeout. Formatting, lint, typecheck and both builds pass. React Doctor retains only five pre-existing warnings. The separate build still reports Manifold’s `node:module` externalization warning; native browser interaction remains unverified.

## Adjacent-face overlap follow-up

The surface audit now checks pairs sharing indexed vertices. A shared edge is allowed when the triangles occupy different planes or opposite coplanar sides; folding onto the same side is rejected. For one shared vertex, the checker compares the triangles' direction cones at that point. Nonparallel planes can share only their intersection line; coplanar cones are tested for shared edge directions. Duplicate indexed faces remain invalid.

The linear tolerance remains `max(1e-10 mm, 64 × Number.EPSILON × maximum absolute referenced coordinate)`. Adjacent tests derive an angular tolerance from this value divided by the shortest incident ray length, with a floor of `64 × Number.EPSILON`. Features shorter than the tolerance, nearly degenerate direction cones and unresolved near-coplanar overlaps fail conservatively. This is still a floating-point audit, not an exact-predicate implementation or a general minimum-clearance measurement. No source repair is performed.

The report now stores `intersections` with total, adjacent and non-adjacent pair counts, bounded triangle-pair samples, tolerance and completion/work metadata. `selfIntersections` passes only when the complete surface audit passes. `shellContainment` and `manufacturing` remain `not-run`, so the overall status stays **topology-checked**, not geometry-valid. The existing work and storage caps apply to both kinds of pair.

The broader audit found **four actual adjacent overlaps in the Float32 contour-torus Emboss result**. Exact rational evaluation of all four captured pairs confirmed overlapping direction cones. A committed regression retains one captured pair and constructs a rational point strictly inside both triangles, verifying plane membership and projected edge half-planes with integer arithmetic. This establishes a real overlap independently of the audit's floating-point threshold. The Inset result passes; the Emboss result fails and releases all owned native handles. The contour runner now names the failing operation and continues with subsequent operations/fixtures.

Eight new regressions cover valid and folded shared edges, shared-vertex crossings, separated cones, winding/index/transform/scale invariance, mixed pair counts, the exact captured witness, closed-manifold folded input and the full contour-torus operation. The folded octahedron demonstrates why coherent edge winding, a single vertex-link cycle and positive volume are not sufficient.

Three contour repetitions produced **33 passing results and three torus Emboss rejections**, with zero remaining adapter-owned handles. A further single repetition confirmed 11 passes and the named Emboss rejection after the runner change. Median Inset timings (all of which passed), on the same Node/M3 Max environment:

| Fixture     | Tool construction (ms) | Inset + audits/measurements (ms) |
| ----------- | ---------------------- | -------------------------------- |
| Sphere      | 187.60                 | 117.31                           |
| Tilted box  | 14.04                  | 7.97                             |
| Torus       | 1031.36                | 524.21                           |
| Sheared box | 11.85                  | 6.43                             |
| Twisted box | 310.48                 | 248.52                           |
| Bent box    | 334.73                 | 249.09                           |

Process peak RSS was 424,336 KiB; before/after RSS was 132,399,104 / 416,350,208 bytes. Adjacent-pair evaluation adds substantial cost despite sharing the same traversal budget. These process-wide numbers include Vite, JavaScript and WASM; representative browser performance and memory remain open gates.

Adjacent-audit verification: all 798 tests across 103 files pass, including 64 focused 3D tests. Formatting, lint, typecheck and both builds pass. React Doctor retains five pre-existing warnings outside this change. The developer build still reports Manifold’s `node:module` externalization warning; native browser loading and cancellation remain unverified.

## Reproduce

```bash
npm run test:3d
npm run bench:3d -- 20
npm run bench:3d -- 5 contours
npm run build:3d
npm run dev
```

Open `/tools/three-d-feasibility.html` on the local dev server. Choose the analytic baseline or the contour fixtures, inspect the measurements and explicit rejection counts, then repeat contour fixtures ×20 and cancel while work is pending. Verify that cancellation stays responsive, releases the worker and allows a fresh run without old results replacing the new run. Closing the page also terminates the worker. The developer trial deliberately has no export action or print-readiness badge.

`npm run build:3d` writes the separate entry under `dist/three-d-feasibility/`. To exercise the built assets, run `npx vite preview --config vite.feasibility.config.ts` and visit the same page path. Vite reports a browser-externalized `node:module` import from Manifold's environment adapter; real-browser loading still needs confirmation.

The browser automation bridge was unavailable during both implementation sessions, so browser loading, responsive native cancellation and restart have **not** been manually verified. The dedicated production build passes, including emission of the approximately 541 kB WASM asset, but that does not substitute for interaction testing.

## Gate still to resolve

1. Extend the triangle-derived circular sweeps to stable surface-normal frames with independent profile width/depth, and measure sharp corners and curved/deformed surfaces at a declared tolerance. The new path contract is not yet integrated with shared Config controls or physical sizing.
2. Extend the initial twisted/bent/cavity and degenerate-cut regressions to thin walls, close folds, intersecting tools, generated tunnel sources and representative rejected-source statistics.
3. Complete shell containment/orientation, then manufacturing diagnostics. Adjacent and non-adjacent contacts now have a bounded conservative audit; exact/near-degenerate predicate robustness still needs broader stress testing. Vertex manifoldness and basic topology audits now run independently, but they do not establish full solid validity. Resolve the analytic torus's degenerate output and the contour torus's Emboss overlaps through explicit, measured operations rather than silent repair.
4. Verify browser cancellation/reinitialization, stale-job handling and source-buffer installation with realistic jobs. Measure peak WASM/JS/GPU memory and lower-memory devices. The internal page recreates its fixed fixtures; it is not the production source lifecycle.
5. Benchmark representative 100k-triangle / 24-slice cases before recording a kernel decision and moving through the shared-foundation/workspace gates in [the implementation plan](./THREE_D_MODE_PLAN.md).
