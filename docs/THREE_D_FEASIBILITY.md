# 3D mode: Phase-0 feasibility record

Status: first kernel spike implemented, 8 September 2026. **The Phase-0 gate is still open.** Manifold 3.5.3 is pinned for evaluation, not yet selected for a public printing release. No production controls or export behavior have changed.

## Implemented

- A DOM-free `solid-kernel.ts` boundary for indexed Float32 XYZ / Uint32 triangle buffers in Z-up millimeters. It imports copies, unions overlapping tools, subtracts grooves or adds ribs, and returns detached output with volume, bounds, triangle count and connected boundary-component count. Boundary components are not physical bodies: an enclosed cavity contributes an additional shell.
- Neutral operations retain the original mesh object and buffers exactly, while checking kernel acceptance. No Boolean runs for Off or an empty tool set.
- Input limits of 250,000 total triangles, 64 tools and 64 MiB of typed-array buffers, plus intermediate/output triangle limits. These do **not** constrain peak WASM working memory. Budget failures reject the operation rather than silently reducing detail.
- Explicit deletion of owned Manifold handles, including decomposition results and failure paths. The returned handle counter measures adapter ownership, not the WASM allocator or heap capacity.
- A separate local WASM worker trial with run, repeated-run, terminate/cancel and restart controls. The normal application entry does not import the spike. Its dedicated build emits the worker and WASM locally; no CDN is involved.

The [Manifold API](https://manifoldcad.org/docs/jsapi/classes/manifold.Manifold.html) requires explicit deletion and oriented manifold imports. Its import may collapse degenerate triangles or unnecessary vertices. This adapter does not add welding, hole filling, winding correction or other repair. Kernel acceptance and positive signed volume are insufficient evidence of geometric or printing validity.

## Fixtures and evidence

All fixtures use one fixed equatorial tool with a 0.6 mm circular radius. Sphere and torus use revolved circular tools; the box uses cylindrical segments joined with spheres. The deformed fixture uses the existing Object shear implementation on the box. These are analytic fixture tools, **not extracted contours or a general surface-normal sweep**. Width and depth are coupled in this spike; the proposed independent production controls are not implemented.

| Fixture     | Base dimensions (mm) | Base triangles | Inset triangles | Emboss triangles |
| ----------- | -------------------- | -------------- | --------------- | ---------------- |
| Sphere      | 40 × 40 × 40         | 2,048          | 7,248           | 7,760            |
| Box         | 40 × 30 × 50         | 12             | 148             | 660              |
| Torus       | 60 × 60 × 20         | 8,192          | 13,760          | 14,272           |
| Sheared box | 55 × 30 × 50         | 12             | 172             | 700              |

Thirteen focused tests exercise the actual WASM module. All four fixtures lose material under Inset and gain material under Emboss, remain one connected body, and produce deterministic buffers without mutating inputs. Independent buffer checks verify closed edges, opposite edge winding and signed volume. The box test measures 0.6 mm penetration/protrusion at equatorial samples; the torus retains its 10 mm inner radius. Duplicate tools, separate bodies, an enclosed cavity, malformed/open meshes, an entirely removed object and repeated preparation cover additional failure and lifecycle behavior. These measurements do not establish width accuracy at box corners, on the sheared surface or between samples.

Initial Node benchmark: Apple M3 Max, arm64, Darwin 24.6.0, Node 25.5.0; 20 repetitions / 240 operations. Inset and Emboss timings are combined below and include input conversion, tool union, Boolean evaluation, measurements and output copies. Fixture construction and module startup are excluded.

| Fixture     | Minimum (ms) | Median (ms) | Maximum (ms) |
| ----------- | ------------ | ----------- | ------------ |
| Sphere      | 16.07        | 16.76       | 22.10        |
| Box         | 0.78         | 0.94        | 1.20         |
| Torus       | 23.78        | 24.68       | 25.62        |
| Sheared box | 1.08         | 1.23        | 1.50         |

All 240 operations ended with zero adapter-owned handles. Process RSS sampled before/after the run was 126,746,624 / 180,502,528 bytes; external memory was 41,486,039 / 46,195,068 bytes. These include Vite, JavaScript, allocator retention and WASM. They are neither peak measurements nor evidence that the planned 256 MiB geometry working-set target is met. These small fixtures also do not establish the proposed 100k-triangle / 24-slice performance target.

## Reproduce

```bash
npm run test:3d
npm run bench:3d -- 20
npm run build:3d
npm run dev
```

Open `/tools/three-d-feasibility.html` on the local dev server. Run the fixtures, inspect the measurements, then start 20 repetitions and cancel while work is pending. Verify that cancellation stays responsive, releases the worker and allows a fresh run without old results replacing the new run. Closing the page also terminates the worker. The developer trial deliberately has no export action or print-readiness badge.

`npm run build:3d` writes the separate entry under `dist/three-d-feasibility/`. To exercise the built assets, run `npx vite preview --config vite.feasibility.config.ts` and visit the same page path. Vite reports a browser-externalized `node:module` import from Manifold's environment adapter; real-browser loading still needs confirmation.

The browser automation bridge was unavailable during the initial implementation session, so browser loading, responsive cancellation and restart have **not** been manually verified. The dedicated production build passes, including emission of the approximately 541 kB WASM asset, but that does not substitute for interaction testing.

## Gate still to resolve

1. Extract actual source-triangle contour paths, construct stable frames and seams, and measure independent profile width/depth on sharp corners and curved/deformed surfaces at a declared tolerance.
2. Add twisted/bent sources, cavities, thin walls, close folds, intersecting tools, degenerate slice levels, generated tunnel sources and rejected-source statistics.
3. Add independent vertex manifoldness, shell containment/orientation and non-adjacent intersection checks. Preserve intentional cavities; never infer validity from total volume alone.
4. Verify browser cancellation/reinitialization, stale-job handling and source-buffer installation with realistic jobs. Measure peak WASM/JS/GPU memory and lower-memory devices. The internal page recreates its fixed fixtures; it is not the production source lifecycle.
5. Benchmark representative 100k-triangle / 24-slice cases before recording a kernel decision and moving through the shared-foundation/workspace gates in [the implementation plan](./THREE_D_MODE_PLAN.md).
