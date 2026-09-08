# 3D mode: Phase-0 feasibility record

Status: Phase-0 kernel and validation spike implemented through manufacturing screening and bounded thickness estimates, 8 September 2026. **The Phase-0 gate is still open.** Manifold 3.5.3 is pinned for evaluation, not yet selected for a public printing release. No production controls or export behavior have changed.

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

- `print-shells.ts` classifies nesting after closed-manifold and surface-contact checks pass. It validates alternating outward/inward orientation and reports physical body count separately from boundary shell count. Ambiguity and budget exhaustion reject the artifact and leave body count unavailable.

- `print-manufacturing.ts` provides an initial advisory screen with explicit build bounds, bed tolerance and overhang angle. It reports physical placement, a near-bed projected-area estimate, overhang area/face samples and body count, with optional bounded thickness estimates and stability still unperformed. It never changes or automatically places the artifact.

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

At this stage, the result status was **topology-checked**, never geometry-valid or print-ready. `selfIntersections`, `shellContainment` and `manufacturing` were explicitly `not-run`. At this stage, overlapping boxes passed the implemented topological checks while still requiring intersection rejection, and a misplaced inward shell required containment analysis. The contact follow-up below now rejects the overlapping-box case. The auditor reuses connectivity with a fresh cache key so changed caller buffers cannot inherit a stale audit.

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

At this stage, pairs sharing **any indexed vertex** were excluded. Their expected vertex/edge contacts still needed to be distinguished from overlaps beyond that shared boundary. Therefore `nonAdjacentIntersections` could pass while the broader `selfIntersections`, `shellContainment` and `manufacturing` checks remained `not-run`; the adjacent-face follow-up below closes that pair-coverage gap. The overall result still says **topology-checked**, not geometry-valid. Nested outward shells and misplaced inward shells remained unresolved at this stage; the shell follow-up below now classifies those cases.

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

The report now stores `intersections` with total, adjacent and non-adjacent pair counts, bounded triangle-pair samples, tolerance and completion/work metadata. `selfIntersections` passes only when the complete surface audit passes. At this stage, `shellContainment` and `manufacturing` remained `not-run`, so the overall status stayed **topology-checked**, not geometry-valid. The existing work and storage caps apply to both kinds of pair.

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

## Shell containment and orientation follow-up

Shell nesting now runs only after finite/face/edge/vertex/volume and surface-contact checks pass. Each connected boundary contributes one of its own vertices as the classification sample; a shell centroid is not used because it may lie outside a concave shell. Given disjoint closed connected boundaries, that sample classifies the entire shell relative to every other boundary. Bounding boxes prune impossible containers, but containment is established by summed signed triangle solid angles, following the [winding-number approach](https://igl.ethz.ch/projects/winding-number/).

The implementation normalizes point-to-vertex rays and uses compensated summation. Absolute winding within `1e-6` of zero means outside, within `1e-6` of one means inside; other values are indeterminate. Near-zero ray lengths at the preceding surface audit's coordinate tolerance and numerically unresolved solid angles also reject classification. Containment relations must form a consistent forest. These are bounded floating-point checks, not an exact-predicate guarantee.

Roots and even-depth shells must have positive signed volume; odd-depth shells must be inward, preserving cavity volume. A nested outward shell or a disconnected inward shell fails instead of being reversed. Successful reports expose parent/depth, original component and sample vertex/triangle IDs, signed volume and orientation agreement. **Physical body count** counts even-depth solid regions: a cavity is part of its surrounding body, while an island inside a cavity is a separate body. This differs from Manifold's boundary-component measurement, which remains separately labeled.

The limits are 256 nonempty shells, 250,000 triangles and five million candidate/triangle visits per artifact. Group construction is bounded by the triangle cap; the work budget covers containment queries. Unused vertices do not become shells. An exhausted or indeterminate report retains bounded shell records and the unresolved pair when available, leaves unfinished parent/depth fields null and never supplies a body count. Failed orientation likewise leaves body count unavailable. No welding, shell reversal, removal or repair occurs.

Ten added regressions cover alternating nesting, cavities, islands, multiple bodies, reversed shell order, wrongly oriented shells, bounding-box false positives, translation, unused vertices, prerequisite failures, uncertainty and budget handling. The real kernel test distinguishes a solid body in a torus's empty center from a cavity inside its tube, and rejects an inward shell in empty space as either source or tool. Existing cavity and disconnected-body tests now assert the physical count independently of shell count.

Single contour and analytic benchmark repetitions retained the expected outcomes: 11 contour passes plus the torus Emboss overlap rejection; ten analytic passes plus the two torus degenerate-face rejections. Every passing fixture reported one physical body and every operation ended with zero adapter-owned handles. These fixtures mostly have one boundary shell, so this run does not establish performance for deeply nested or many-shell uploads.

`manufacturing` remains explicitly `not-run`. The internal success label stays **topology-checked** while broader numerical stress tests, known torus construction defects, browser validation and the remaining Phase-0 gates are unresolved; no public print-readiness classification is introduced.

Shell-audit verification: all 808 tests across 104 files pass, including 74 focused 3D tests. Formatting, lint, typecheck and both builds pass. React Doctor retains five pre-existing warnings outside this change. The developer build retains its Manifold `node:module` externalization warning; native browser loading and cancellation remain unverified.

## Initial manufacturing advisory screen

A separate read-only screen now accepts explicit axis-aligned build bounds in the artifact's existing Z-up millimeter frame. The build region's minimum Z is the bed; the function does not rotate, translate or drop geometry. It freshly runs the geometry audit before measuring the artifact, so a stale caller report cannot authorize changed buffers. Invalid geometry returns `unavailable` with its diagnostics. Geometry that passes gets a `screened` result and any advisories; this label never means print-ready.

The screen reports referenced-vertex bounds and dimensions, exact bounds fit, depth below bed, lowest-point clearance and validated body count. Build-volume fit uses the actual bounds without tolerance expansion. A separate below-bed advisory triggers beyond the stated bed tolerance. Unused vertices remain geometry warnings and do not enlarge the bounds.

For approximate bed contact, downward-facing triangles are clipped to the band within `bedToleranceMm` of the bed. Their projected XY areas are summed. This is a **near-bed area estimate**, not a union footprint, adhesion estimate or proof that every body is supported. A tilted face with only a line at the bed can have a nonzero band estimate; zero tolerance gives that line zero area. Multiple bodies remain an explicit advisory even when the total near-bed area is nonzero.

Overhang angle is measured **from vertical toward a downward horizontal underside**: vertical is 0°, a downward 45° slope is 45°, and an underside is 90°. Downward faces exceeding the configured threshold are flagged, excluding portions inside/below the bed band. The screen records full face count, clipped surface area and at most 32 original triangle IDs. The numeric angular comparison has a `64 × Number.EPSILON` margin on the normal ratio. It does not simulate supports or bridging; enclosed cavity ceilings can also be flagged. Thickness and stability are explicitly `not-run`, and the geometry report's full `manufacturing` check remains `not-run`.

The developer trial uses recorded assumptions of `[-100, -100, 0]` to `[100, 100, 200]` mm build bounds, 0.05 mm bed tolerance and a 45° overhang threshold. These are internal fixture assumptions, not new production controls or printer recommendations. Centered fixtures therefore report below-bed placement. Each accepted analytic/contour row includes serialized manufacturing diagnostics and `manufacturingMs`; the existing Boolean/operation timing stops before this separate screen. Screening time includes the fresh geometry audit, which currently duplicates the kernel boundary audit and can be substantial.

Nine new regressions cover analytic dimensions and area, floating/below-bed placement, build limits, sloping-face clipping, angle thresholds, cavity ceilings, multiple bodies, bounded samples, unused coordinates, detached settings, stale-buffer rejection and invalid assumptions. A single contour repetition retains 11 accepted geometry results and the known torus Emboss overlap rejection; all 11 accepted results are screened and all rows end with zero adapter-owned handles. The analytic suite likewise retains its two known torus degeneracy rejections. Manufacturing advisories do not reclassify accepted geometry as kernel failures.

Manufacturing-screen verification: all 817 tests across 105 files pass, including 83 focused 3D tests. Formatting, lint, typecheck and both builds pass. React Doctor retains five pre-existing warnings. The developer build retains its Manifold `node:module` externalization warning; native browser loading and cancellation remain unverified.

## Bounded thickness-sampling follow-up

The manufacturing screen can now run an optional inward-normal ray from each selected triangle. The fixed sample barycentrics are `[1/2, 1/3, 1/6]`; centroid samples were avoided because opposite face diagonals produced many exact ties even on an ordinary box. The geometric face normal points the ray into material, including correctly oriented cavity shells. The first boundary hit determines a **normal chord estimate**. This is neither the nearest opposing-surface distance nor a guarantee of global minimum wall thickness or strength.

The screen freshly audits geometry before sampling. Source faces alone are excluded from their rays; cavity walls and adjacent faces remain candidates. First hits on triangle edges, grazing/coplanar candidates, near-origin hits, missing exits or non-exiting orientations are unresolved, rather than skipped to measure a farther surface. A partially scanned ray is discarded when the work budget expires. Thus a ray cannot claim a complete nearest-hit result from only part of the mesh.

Limits are 256 samples, 250,000 triangles and two million triangle visits. Precomputation of face areas/bounds is bounded by the triangle cap; each sampled ray scans candidate bounds under the visit budget. Caller-supplied priority output face IDs reserve sample slots, must be unique and must all fit. Remaining slots use deterministic triangle-index strata. This selection is not adaptive or area weighted. The report retains every selected sample's position, face ID, opposite face when available, estimate or unresolved reason, measured minimum, below-threshold count and work. `resolvedTriangleAreaFraction` refers to faces having one resolved point, not the fraction of surface whose thickness has been established.

Sampling is optional in the library and remains `not-run` when omitted or geometry is rejected. The developer trial explicitly requests 64 samples and a 1 mm review threshold; these are recorded trial assumptions, not printer recommendations. Short resolved chords add `thin-samples`; unresolved rays add `thickness-unresolved`. These advisories do not reject accepted geometry. Stability and the full manufacturing check remain unperformed.

Nine new regressions cover exact box chord lengths, a 0.1 mm plate, translation, cavity boundaries, separate bodies, priority retention, uncertainty, incomplete work and manufacturing integration. A single contour repetition retained 11 accepted results and the known torus Emboss rejection, with zero adapter-owned handles left. All 64 requested rays resolved for each accepted contour result; the maximum query work was 1,310,080 visits. Some inset and raised-feature samples returned short chords below the trial threshold. These can occur near groove lips and sharp features and must not be presented as proof of globally thin structural walls. No adaptive coverage or treatment-region completeness is claimed; priority IDs still need integration with production output provenance.

Thickness-sampling verification: all 92 focused 3D tests pass. The full run passed 825 of 826 tests, with a five-second timeout in the unrelated `OutputPanel.test.tsx` file; its isolated rerun passed all 13 tests without changing the timeout. Formatting, lint, typecheck and both builds pass. React Doctor retains five pre-existing warnings. The developer build retains its Manifold `node:module` externalization warning; native browser loading and cancellation remain unverified.

## Per-body bed-contact follow-up

The manufacturing screen now reports bed-band contact separately for every material body. Each record identifies its exterior shell, lowest Z, below-bed depth, gap above the bed, projected downward contact area, complete contact-face count and up to 32 original face IDs. Bodies are derived from the validated containment forest: cavity boundaries do not become bodies or contribute to their exterior contact, while material islands inside cavities remain separate bodies. Fresh component labels avoid stale identity-cache results after buffer edits.

`bodies-without-near-bed-area` flags any body with zero measured exterior contact, even when another body provides a positive aggregate contact area. Measurements use the authored placement and existing bed tolerance; they do not place the object automatically. The legacy aggregate still includes all downward boundaries, including cavity surfaces, and is not a per-body support test. Neither record establishes adhesion, center-of-mass stability, support from another body, or printability; stability and the full manufacturing check remain `not-run`.

Regressions cover a placed body beside a floating body, cavities, nested material islands in reordered shell buffers, and original face identification. No production controls or defaults change. A single contour benchmark repetition retained 11 accepted results and the known torus Emboss rejection, with zero adapter-owned handles left. Accepted rows serialize the new per-body records; their centered fixtures still carry below-bed advisories even where sloping faces cross the bed band.

## Target-scale workload follow-up

The CLI now accepts `npm run bench:3d -- 3 scale`. This generates a deterministic 100 mm diameter sphere with 100,352 triangles and requests 24 Z-plane contours from −46.7 to 45.3 mm at 4 mm spacing, with the existing 0.6 mm circular tool radius. Fixture generation is outside preparation timing. The scale suite first audits the exact untreated source, then attempts extraction, recipe generation, tool construction and both Boolean operations. It preserves the declared workload, completed-stage measurements, failing stage, elapsed time, structured geometry diagnostics and live handle count on rejection. Existing contour failures also retain completed extraction/tool measurements rather than losing that context. Extraction timing now covers extraction alone; tool-construction timing includes recipe generation (previously included in extraction timing).

This is a target-sized smooth-surface workload, not representative coverage of imported or deformed models. It does not yet test independent groove width/depth, browser cancellation, GPU usage or lower-memory hardware. The scale suite is CLI-only; the browser trial buttons retain their existing workloads.

At this stage, the source exhausted the surface-intersection auditor's five-million-visit budget before slicing. No contacts are detected within that budget, but completion is false and the source remains rejected. No treatment or manufacturing time is reported for an operation that never ran. The ten-second final-preparation target is therefore **not met**: an early bounded rejection is not successful preparation. This identified broad-phase intersection work as the first prerequisite to measuring sweep and Boolean costs; the traversal follow-up below resolves that source-audit blocker.

On Apple M3 Max / arm64 / Darwin 24.6.0 with Node v25.5.0 and Manifold 3.5.3, three sequential repetitions rejected at source audit in 791.15, 774.64 and 765.20 ms, each with zero adapter-owned handles remaining. Process peak RSS was 446,176 KiB across the run (Vite, JS and WASM combined, not peak WASM alone). The existing contour suite retained 11 accepted results and the known torus Emboss rejection.

## Paired BVH traversal follow-up

The surface audit now traverses unordered pairs of BVH regions instead of starting a root-to-leaf query for every face. A region paired with itself splits into left/left, left/right and right/right; two different regions split one side at a time. Leaf pairs enumerate each unordered face pair once, retaining canonical original face IDs. Bounds use the same conservative tolerance, and all adjacent/non-adjacent narrow predicates are unchanged. The five-million work cap and 32-pair diagnostic cap remain unchanged. Work now counts region-pair visits plus candidate face-pair visits, so it is not directly comparable to the earlier per-face traversal count. Diagnostic sample order can change, but remains deterministic for the same buffers.

The 100,352-face source now completes validation and all 24 contours extract successfully. Preparation subsequently rejects the rounded-tool recipe: the paths contain 15,088 vertices, above the existing 2,000-vertex cap (and also beyond its primitive-triangle allowance). The scale workload still does not produce a printable treatment or meet the final-preparation target. No paths are silently simplified and no limits are raised.

A new regression compares the BVH's full contact counts and sampled original pairs with exhaustive two-face queries over mixed indexed/unindexed contacts in reordered spatial groups. It also checks exact versus just-insufficient work budgets. Existing folded-face, close-contact, captured torus-overlap and real-kernel tests remain required. The scale regression now requires completed source auditing followed by the explicit recipe-budget rejection, with handles released across repetitions.

Three sequential runs on the same M3 Max / Node v25.5.0 reference environment completed source auditing in 1,046.98, 994.89 and 991.41 ms, each using 2,840,139 intersection work units. Extraction took 340.998, 319.005 and 329.391 ms; recipe rejection occurred after 1,388.29, 1,314.01 and 1,320.91 ms total. All adapter handle counts returned to zero. Process peak RSS was 450,656 KiB across all repetitions (combined Vite/JS/WASM). These complete-audit timings cannot be interpreted as a speed comparison with the previous incomplete audits.

## Explicit contour-approximation follow-up

`contour-approximation.ts` adds opt-in closed-polyline approximation. It preserves the first vertex, splits at the farthest vertex, and recursively replaces each arc only when every original arc vertex lies within the declared distance of its chord. Distance to a segment is convex along each original edge, so this bounds the intervening edge points too; continuous projection across the arc gives the reverse chord-to-arc bound. The implementation uses floating-point measurements, not exact predicates. It returns retained original vertex IDs, detached points, measured maximum deviation and work. It rejects collapsing loops, nonfinite measurements and exhausted work instead of returning partial paths. Limits are 200,000 input vertices per loop and two million distance queries shared across the selected recipe.

The recipe's optional fifth argument is the path tolerance in millimeters; zero retains the existing exact path behavior. This is separate from the fourth argument's circular-profile tolerance. The source mesh and extracted contours are unchanged. Summary metadata records input/output vertex counts, measured maximum deviation and work, including on a tool-budget rejection. The approximation is a path-distance estimate, not a promise of identical groove depth, sharp-feature behavior, loop topology or clearance between nearby surfaces. Constructed tools and outputs must still undergo their existing independent audits. No production controls change.

`npm run bench:3d -- 1 scale-approximate` explicitly requests 0.05 mm path tolerance alongside the existing 0.05 mm profile tolerance and 0.6 mm capsule radius. It reduces the 24 paths from 15,088 to 2,373 vertices, with maximum measured deviation 0.04990734 mm and 110,738 distance queries. This still exceeds the 2,000-vertex limit and the conservative primitive budget: 2,373 × (16² + 4) = 616,980 triangle allowance versus 250,000. The operation therefore remains rejected at recipe generation, with zero adapter-owned handles left. The exact `scale` suite remains available for comparison. Tolerances are not increased automatically to fit a budget.

Regressions measure circle deviation independently, preserve concave corners and original indices, check deterministic detached output, rigid transforms, collapse/input/work rejection, opt-in recipe behavior, and real-kernel box groove/rib dimensions after removing collinear contour subdivisions. The remaining scale blocker calls for a more efficient tool representation or a separately declared accuracy tradeoff; approximation at this tolerance alone does not resolve it.

## Indexed planar miter-sweep trial

`planar-sweep.ts` adds a separate experimental tool representation. It connects circular-profile rings into one indexed mesh per closed planar contour, with `2 × path vertices × profile segments` faces. Ring offsets intersect neighboring edge-offset lines, giving miter joins instead of capsule-union corners. The maximum miter multiplier is reported and capped at 2; reversing/acute corners and nonplanar paths are rejected. Planarity is checked within 1e-7 mm. Circular-profile sagitta is reported for straight segments, separately from corner extension. The exact Float32 tool buffer must pass the independent topology, contact and shell audits before use; small-loop foldovers and contacting tubes remain errors.

`npm run bench:3d -- 1 scale-sweep` explicitly selects this representation with 0.05 mm path approximation, 0.6 mm radius and 16 profile segments. The 2,373 retained vertices produce 75,936 tool triangles across 24 closed, audited tools, fitting the existing 250k aggregate input triangle budget together with the 100,352-face source. No capsule limits are raised. Maximum miter multiplier is 1.00158110 and straight-segment profile deviation is 0.01152883 mm. These are path-plane frames, not independently controlled surface-normal width/depth; the representation is not enabled in production or substituted for the existing capsule trial.

On one M3 Max / Node v25.5.0 run, source audit took 1,097.96 ms, extraction 361.21 ms and tool construction (including path approximation and tool audits) 733.40 ms. Inset and Emboss operation attempts took 4,184.82 and 4,209.44 ms. Both final outputs were rejected: Inset detected 57 contacts before exhausting five million audit work units; Emboss exhausted that budget without detecting a contact. Counts from incomplete audits are lower bounds, and contact classification is conservative rather than an exact-predicate proof. No accepted final artifact or ten-second target success is claimed. All adapter-owned handles returned to zero; process peak RSS was 815,936 KiB including Vite, JS and WASM.

Tests cover deterministic closed tools, linear triangle count, measured circle volume and radius, miter extension, reversed/tilted paths, native box Inset/Emboss operations, and rejection of nonplanar, acute, intersecting and over-budget tools. The remaining questions are output-contact robustness, complete output auditing within limits, dimensional fidelity on deformed surfaces and eventual profile/join design.

## Reproduce

```bash
npm run test:3d
npm run bench:3d -- 20
npm run bench:3d -- 5 contours
npm run bench:3d -- 3 scale
npm run bench:3d -- 1 scale-approximate
npm run bench:3d -- 1 scale-sweep
npm run build:3d
npm run dev
```

Open `/tools/three-d-feasibility.html` on the local dev server. Choose the analytic baseline or the contour fixtures, inspect the measurements and explicit rejection counts, then repeat contour fixtures ×20 and cancel while work is pending. Verify that cancellation stays responsive, releases the worker and allows a fresh run without old results replacing the new run. Closing the page also terminates the worker. The developer trial deliberately has no export action or print-readiness badge.

`npm run build:3d` writes the separate entry under `dist/three-d-feasibility/`. To exercise the built assets, run `npx vite preview --config vite.feasibility.config.ts` and visit the same page path. Vite reports a browser-externalized `node:module` import from Manifold's environment adapter; real-browser loading still needs confirmation.

The browser automation bridge was unavailable during both implementation sessions, so browser loading, responsive native cancellation and restart have **not** been manually verified. The dedicated production build passes, including emission of the approximately 541 kB WASM asset, but that does not substitute for interaction testing.

## Gate still to resolve

1. Extend the triangle-derived circular sweeps to stable surface-normal frames with independent profile width/depth, and measure sharp corners and curved/deformed surfaces at a declared tolerance. The new path contract is not yet integrated with shared Config controls or physical sizing.
2. Extend the initial twisted/bent/cavity and degenerate-cut regressions to thin walls, close folds, intersecting tools, generated tunnel sources and representative rejected-source statistics.
3. Extend thickness sampling with adaptive treatment-region coverage and extend per-body bed-contact screening with support/stability diagnostics, and expand shell/intersection numerical stress testing. Shell containment/orientation now has a bounded implementation. Adjacent and non-adjacent contacts now have a bounded conservative audit; exact/near-degenerate predicate robustness still needs broader stress testing. Vertex manifoldness and basic topology audits now run independently, but they do not establish full solid validity. Resolve the analytic torus's degenerate output and the contour torus's Emboss overlaps through explicit, measured operations rather than silent repair.
4. Verify browser cancellation/reinitialization, stale-job handling and source-buffer installation with realistic jobs. Measure peak WASM/JS/GPU memory and lower-memory devices. The internal page recreates its fixed fixtures; it is not the production source lifecycle.
5. Resolve the capsule recipe budget blocker or establish an alternative sweep with accepted final outputs (the planar miter trial currently fails output contact/budget checks), then benchmark complete preparation on representative 100k-triangle / 24-slice cases before recording a kernel decision and moving through the shared-foundation/workspace gates in [the implementation plan](./THREE_D_MODE_PLAN.md).

## Rounded-cube construction allowance follow-up

The original 2,000-path-vertex / 250,000-estimated-construction-triangle limits rejected eight exact slices of the built-in rounded cube: 2,048 vertices and a conservative 532,480 construction triangles at 0.6 mm radius / 16 profile segments. The caps are now 8,000 vertices / 1,000,000 construction triangles. The 64-loop limit, 250,000 aggregate input/output triangle limits, buffer limits, independent audits and cancellation remain in force. These construction counts represent cumulative capsule work, not final solid size or measured peak WASM memory.

At 100 mm, explicit 0.05 mm path approximation reduces this eight-slice workload from 2,048 to 757 vertices with 0.04958057 mm maximum measured deviation and 13,984 distance queries. Exact paths remain the default. At 80 mm with exact paths, both Inset and Emboss complete tool construction and reach the Boolean result audit, which rejects 16 degenerate faces; the local standalone regression takes roughly 5–6 seconds per operation. This is progress past the budget rejection, not an accepted treatment or a general performance guarantee. Sixteen exact cube slices still exceed construction work at 1,064,960 estimated triangles, and the error now reports that total and the 1,000,000 limit. Earlier scale measurements above describe the old limits.

The existing 100,352-face / 24-slice scale-approximate trial (2,373 retained path vertices) also now passes recipe and capsule construction and reaches Boolean/output auditing, where it remains rejected. Its regression continues to require zero remaining adapter-owned native handles. The larger construction allowance has not established an accepted scale result.

## Exact generated cleanup, adjacent predicates and larger workloads

The current pipeline resolves the earlier eight-slice cube failure. Float32 conversion can collapse generated edges/faces. Exact generated-only cleanup merges identical coordinates and removes zero-area faces/unused vertices without moving coordinates; independent auditing then runs again. Remaining candidate contacts on very thin adjacent faces are resolved using exact dyadic integer plane/cone signs. Tests retain rejection of true adjacent crossings, coplanar folds and nonadjacent contacts; arbitrarily close but actually distinct adjacent planes now pass. This changes the earlier conservative adjacent-uncertainty behavior rather than increasing its numerical tolerance. Nonadjacent tests are still conservative.

Eight exact cube slices pass Inset and Emboss at 80 mm; cleanup removes 16 collapsed result faces in each regression. At the default 100 mm, `npm run bench:3d:cube -- 8 inset 0` passes in about 7.1 seconds on Apple M3 Max / Node 25.5.0, removing 32 collapsed faces and merging 16 coincident vertices. Analytic torus operations that previously failed for zero-area faces now pass with disclosed cleanup. Source/neutral buffers are never cleaned automatically.

The construction ceiling is now 32,000 vertices / 8,000,000 estimated capsule triangles (64 loops), and mesh/audit ceilings are 500,000 triangles / 20,000,000 intersection traversal units. Source slice extraction remains capped at 250,000 triangles. Measurements at 100 mm, 0.6 mm radius, Inset:

| Selected slices | Path approximation | Elapsed | Outcome                                                            |
| --------------- | ------------------ | ------- | ------------------------------------------------------------------ |
| 16              | Exact              | 12.1 s  | Final audit rejects 16 surface contacts; no work-budget exhaustion |
| 32              | Exact              | 25.1 s  | Final audit rejects 125 surface contacts                           |
| 40              | 0.05 mm            | 0.62 s  | Tool rejected for unexpected boundary shells                       |

Sequential process RSS samples grew from roughly 99 MB to 738 MB across those trials. They include JS, WASM and the test runner; they are neither peak WASM measurements nor evidence of a leak. Under the former 250,000 mesh-triangle ceiling, 40 exact slices took 19.6 seconds before rejection at aggregate input size. Forty exact slices have not yet been remeasured through the expanded final mesh/audit allowance. Larger budgets permit more work; they do not establish that every larger treatment is valid or fast.

`npm run bench:3d:cube -- <slices> <inset|emboss> <0|0.05>` provides a repeatable end-to-end 100 mm cube trial, including stage timings, status, cleanup, accepted result triangle count, environment and process-memory samples. Full dense exact scale Boolean trials remain opt-in; regression tests check their source audit and complete 24-path recipe without repeatedly constructing thousands of native capsules.

## 100 mm Emboss rounding regression

The user's default-size cube exposed a case missed by the 80 mm browser trial. Eight exact height slices, 0.6 mm radius and 100 mm longest dimension passed Inset but Emboss retained 16 actual adjacent overlaps after exact-only cleanup (16 merged vertices, 32 removed zero-area faces). Captured candidate vertices differed by one Float32 step near ±32.584 mm (about 0.00000381 mm). Exact predicates correctly rejected these overlaps; validation thresholds were not weakened.

`Result vertex cleanup` now declares a 0.00001 mm default tolerance for generated Boolean buffers, with zero available as an exact-only option. Spatially indexed fixed representatives bound each merged vertex's Euclidean movement and prohibit tolerance accumulation through chained merges. Source inputs remain unchanged; tools and placed buffers retain exact-only cleanup. Full geometry validation follows cleanup, and the UI reports tolerance and measured movement for every changed stage. The 100 mm Emboss trial now passes with maximum measured displacement 0.0000085299224 mm, 68 merged vertices and 136 removed zero-area faces. The exact-only option still reproduces the 16-contact rejection. This addresses this numerical case, not general repair or all invalid larger workloads.
