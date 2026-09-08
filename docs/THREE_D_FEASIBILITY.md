# 3D mode: Phase-0 feasibility record

Status: kernel spike and triangle-derived capsule sweep trial implemented, 8 September 2026. **The Phase-0 gate is still open.** Manifold 3.5.3 is pinned for evaluation, not yet selected for a public printing release. No production controls or export behavior have changed.

## Implemented

- A DOM-free `solid-kernel.ts` boundary for indexed Float32 XYZ / Uint32 triangle buffers in Z-up millimeters. It imports copies, unions overlapping tools, subtracts grooves or adds ribs, and returns detached output with volume, bounds, triangle count and connected boundary-component count. Boundary components are not physical bodies: an enclosed cavity contributes an additional shell.
- Neutral operations retain the original mesh object and buffers exactly, while checking kernel acceptance. No Boolean runs for Off or an empty tool set.
- Input limits of 250,000 total triangles, 64 tools and 64 MiB of typed-array buffers, plus intermediate/output triangle limits. These do **not** constrain peak WASM working memory. Budget failures reject the operation rather than silently reducing detail.
- Explicit deletion of owned Manifold handles, including decomposition results and failure paths. The returned handle counter measures adapter ownership, not the WASM allocator or heap capacity.
- A separate local WASM worker trial with run, repeated-run, terminate/cancel and restart controls. The normal application entry does not import the spike. Its dedicated build emits the worker and WASM locally; no CDN is involved.
- `slice-geometry.ts` retains ordered levels, source revision, a fixed planar direction, XYZ points, segment triangle ownership, endpoint barycentrics, geometric face normals, run offsets and closure flags in serializable buffers. Roots join by source edge/vertex identity, never spatial proximity. Coplanar faces, branching cuts, malformed inputs and exceeded budgets fail explicitly. Open runs remain identifiable and cannot become closed treatment tools. The existing drawing run-chaining routine was moved here unchanged; the stricter manufacturing extractor does not replace drawing smoothing or field behavior.
- `slice-treatment.ts` selects whole levels with All, inclusive ranges or every-N patterns with wrapped offsets. It creates detached circular capsule recipes. Zero radius produces no tools; the kernel retains exact source buffers for neutral operations. Primitive budgets preserve the whole selection or reject it.
- Rounded tools use convex hulls of identically oriented endpoint spheres, unioned in batches of eight. Constructed tools must have one connected boundary shell both natively and after Float32 buffer conversion. Extra shells fail instead of being removed. This is a circular profile trial; independent width/depth and surface-normal profile frames remain unimplemented.

The [Manifold API](https://manifoldcad.org/docs/jsapi/classes/manifold.Manifold.html) requires explicit deletion and oriented manifold imports. Its import may collapse degenerate triangles or unnecessary vertices. This adapter does not add welding, hole filling, winding correction or other repair. Kernel acceptance and positive signed volume are insufficient evidence of geometric or printing validity.

## Fixtures and evidence

The initial analytic suite uses one fixed equatorial tool with a 0.6 mm circular radius. Sphere and torus use revolved circular tools; the box uses cylindrical segments joined with spheres. The deformed fixture uses the existing Object shear implementation on the box. These baseline tools remain available separately from the newer contour-driven suite below. Width and depth are coupled in both trials; the proposed independent production controls are not implemented.

| Fixture     | Base dimensions (mm) | Base triangles | Inset triangles | Emboss triangles |
| ----------- | -------------------- | -------------- | --------------- | ---------------- |
| Sphere      | 40 × 40 × 40         | 2,048          | 7,248           | 7,760            |
| Box         | 40 × 30 × 50         | 12             | 148             | 660              |
| Torus       | 60 × 60 × 20         | 8,192          | 13,760          | 14,272           |
| Sheared box | 55 × 30 × 50         | 12             | 172             | 700              |

The original thirteen kernel tests exercise the actual WASM module. All four analytic fixtures lose material under Inset and gain material under Emboss, remain one connected body, and produce deterministic buffers without mutating inputs. Independent buffer checks verify closed edges, opposite edge winding and signed volume. The box test measures 0.6 mm penetration/protrusion at equatorial samples; the torus retains its 10 mm inner radius. Duplicate tools, separate bodies, an enclosed cavity, malformed/open meshes, an entirely removed object and repeated preparation cover additional failure and lifecycle behavior. These measurements do not establish width accuracy at box corners, on the sheared surface or between samples.

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
3. Add independent vertex manifoldness, shell containment/orientation and non-adjacent intersection checks. Preserve intentional cavities; never infer validity from total volume alone.
4. Verify browser cancellation/reinitialization, stale-job handling and source-buffer installation with realistic jobs. Measure peak WASM/JS/GPU memory and lower-memory devices. The internal page recreates its fixed fixtures; it is not the production source lifecycle.
5. Benchmark representative 100k-triangle / 24-slice cases before recording a kernel decision and moving through the shared-foundation/workspace gates in [the implementation plan](./THREE_D_MODE_PLAN.md).
