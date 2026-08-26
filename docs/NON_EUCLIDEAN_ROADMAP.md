# Non-Euclidean experimentation roadmap

## Purpose

This document breaks the next non-Euclidean geometry work into focused development sessions. Each session should leave the repository in a releasable state: existing snapshots still load, the worker protocol remains serializable, relevant tests pass, and unfinished controls are not exposed.

The roadmap covers five related feature families:

1. Hyperbolic Möbius navigation within the Poincaré disk.
2. Curved wavefront slicing with spherical and cylindrical scalar fields.
3. Intrinsic geodesic-distance contours and multi-source variations.
4. Mesh-curvature contours.
5. Spherical projection models and a hyperbolic tiling source.

The order is deliberate. The first two foundation sessions create reusable projection and scalar-field boundaries. Later sessions should extend those boundaries rather than add mode-specific branches throughout `contour-engine.ts`.

## Product language and boundaries

Use these terms consistently in controls, help text, snapshots, and documentation:

- **Projection warp** changes the 2D image after the Euclidean mesh has been viewed by the camera. It does not change the mesh metric. Klein↔Poincaré, Möbius navigation, circle inversion, and spherical map projections belong here.
- **Curved slicing field** intersects the mesh with level sets defined in model space. Spherical and cylindrical wavefronts belong here. These are spatially nonlinear but do not measure distance along the surface.
- **Intrinsic mesh field** is calculated from the mesh's own surface geometry. Geodesic distance and curvature belong here and are genuinely non-Euclidean.
- **Generative geometry** creates independent line art or a mesh. Hyperbolic tilings belong here.

The UI should not claim that the existing Klein↔Poincaré control changes the intrinsic geometry. Its current description in `PARAMETERS.md` remains correct.

## Shared engineering constraints

Every session follows these constraints:

- Geometry and numerical algorithms remain deterministic and DOM-free.
- Uploaded geometry remains local and is never sent to a service.
- Worker messages contain only structured-cloneable values and transferable typed arrays.
- SVG and G-code use the same finished centerline geometry unless a feature is explicitly documented as SVG-only.
- Exact exports must never use quick-preview approximations.
- New numeric creative controls support parameter snapshots, undo/redo, locks, curated randomization, and X/Y morphing unless a session explicitly defers one of those behaviors.
- Old snapshots must load with neutral defaults. New settings should be optional at the `ContourSettings` boundary until snapshot migration is established.
- Non-finite coordinates, singular transformations, degenerate triangles, disconnected components, boundaries, and non-manifold edges must fail safely.
- Source SVG centerlines bypass mesh-only intrinsic fields but continue to support projection warps.
- Each cache key includes every setting that changes its result, and caches stay bounded per mesh.

## Target module boundaries

These names are proposed rather than mandatory, but the responsibilities should stay separate:

- `projection.ts`: pure camera-space projection warps, Möbius math, spherical projections, domain checks, and nonlinear path subdivision.
- `scalar-fields.ts`: scalar-field contracts and analytic planar, spherical, cylindrical, and toroidal fields.
- `mesh-topology.ts`: adjacency, unique edges, boundary detection, connected components, and reusable per-mesh topology caches.
- `mesh-geodesics.ts`: weighted surface-graph distances and multi-source combinations.
- `mesh-curvature.ts`: Gaussian curvature, mean curvature, smoothing, and robust normalization.
- `hyperbolic-tiling.ts`: deterministic Poincaré-disk tiling generation as line art.
- `contour-engine.ts`: orchestration, contour extraction, visibility, composition, and serialization.
- `slicer.ts`: browser bindings, snapshot compatibility, randomization, enable/disable logic, and worker scheduling.

Do not require all files to exist before their first real use. Extract code only when a session gains a stable boundary and focused tests.

## Proposed shared types

The present `ScalarField` assumes a constant `dir`. That works for planes but not for curved or intrinsic fields. Introduce an equivalent of:

```ts
interface MeshScalarField {
  values: ArrayLike<number>;
  min: number;
  max: number;
  kind: 'planar' | 'analytic' | 'intrinsic';
  evaluate?: (x: number, y: number, z: number) => number;
  gradient?: (x: number, y: number, z: number) => Vec3 | null;
  constantDirection?: Vec3;
  cacheKey: string;
}
```

Important semantics:

- `values` are authoritative at mesh vertices.
- `evaluate` enables root refinement for analytic nonlinear fields. Intrinsic fields normally interpolate vertex values and do not pretend to have an off-surface evaluator.
- `gradient` supplies a local explode direction for analytic fields.
- `constantDirection` retains the optimized planar path and blueprint annotation direction.
- An intrinsic field without a reliable local gradient initially disables slice explosion rather than using a misleading global direction.

Projection settings should similarly use a discriminated mode rather than unrelated booleans once more modes exist:

```ts
type ProjectionWarpMode = 'none' | 'klein-poincare' | 'mobius' | 'inversion' | 'spherical';
```

For backward compatibility, a snapshot with a nonzero `lensWarpExponent` and no new mode resolves to `klein-poincare`.

## Session map

| Session | Outcome                                     | Depends on          |
| ------- | ------------------------------------------- | ------------------- |
| 1       | Baseline fixtures and projection extraction | —                   |
| 2       | Nonlinear projection/path contract          | 1                   |
| 3       | Möbius transformation math                  | 2                   |
| 4       | Möbius controls, morphing, and exports      | 3                   |
| 5       | General scalar-field contract               | 1                   |
| 6       | Spherical and cylindrical wavefront slicing | 5                   |
| 7       | Topology cache and geodesic solver          | 5                   |
| 8       | Single-source geodesic contours             | 7                   |
| 9       | Multi-source geodesic fields                | 8                   |
| 10      | Curvature fields                            | 7                   |
| 11      | Spherical map projections and inversion     | 2, 4                |
| 12      | Hyperbolic tiling generator                 | 3                   |
| 13      | Cross-feature hardening and documentation   | 4, 6, 9, 10, 11, 12 |

Sessions 3–4 and 5–7 may be developed independently after Session 2, but each individual session should still land as a complete vertical slice.

## Session 1 — Baseline fixtures and projection extraction

**Status: completed.**

### Goal

Create stable seams for projection work without changing rendered output.

### Work

- Record focused deterministic fixtures for orthographic, perspective, Klein↔Poincaré, and signed lens-distortion output.
- Cover both mesh contours and imported SVG centerline projection.
- Extract camera projection and existing warp functions from `contour-engine.ts` into `projection.ts` if the resulting API remains small.
- Keep the order explicit: camera basis → orthographic/perspective blend → projection warp → optical distortion → sheet scale/offset.
- Preserve the exact Klein↔Poincaré endpoint formula and legacy lens fallback.
- Export only the smallest pure functions required by tests and `contour-engine.ts`.

### Tests

- Existing projection tests remain byte-for-byte or tolerance-equivalent.
- Neutral projection returns unchanged finite coordinates.
- Klein endpoints and intermediate continuity remain covered.
- SVG centerlines and mesh vertices use the same projection function.

### Done when

- No control, default, snapshot, SVG, or G-code behavior changes.
- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.

## Session 2 — Nonlinear projection and path contract

**Status: completed.**

### Goal

Make strongly nonlinear warps accurate in previews and plotter output instead of representing curved images as long straight chords.

### Work

- Add an adaptive segment projector operating on 3D segment endpoints or camera-space samples.
- Subdivide until the projected midpoint deviates from the projected chord by less than a quality-dependent sheet-space tolerance.
- Set strict maximum depth and node limits to prevent singular transformations from producing unbounded work.
- Return explicit domain results such as valid, clipped-at-domain, and invalid; do not encode invalidity as `NaN` and allow it to leak downstream.
- Use the same projected runs for SVG and full-quality G-code.
- Include nonlinear projection cost in quick-preview heuristics if measurements show a meaningful regression.
- Ensure hidden-line sampling still compares the correct projected XY coordinates and original camera depth.

### Decisions to record

- The sheet-space subdivision tolerance is `0.03 × 0.72^(quality − 1)` mm. Maximum depth rises with quality to eight; the per-run node cap rises with quality to a maximum of 8192.
- The depth buffer continues to rasterize projected source triangles for the currently bounded radial transforms. Its neighboring-pixel visibility tolerance remains in place. Singular or horizon projections must revisit adaptive face tessellation before Session 11 exposes them.
- Points brought safely to the Klein/Poincaré disk boundary remain drawable and are reported as `clipped-at-domain`. Non-finite and projection-singularity samples are `invalid` and split the emitted run.

### Tests

- A transformed long segment follows the analytic midpoint within tolerance.
- Increasing quality never reduces geometric fidelity.
- Singular or out-of-domain inputs emit finite, bounded runs.
- SVG and G-code endpoints agree after clipping.
- Quick mode returns fewer or equal nodes than exact mode.

### Done when

- Existing neutral render counts remain stable.
- The nonlinear projector is reusable by mesh contours and SVG centerlines.

## Session 3 — Hyperbolic Möbius transformation kernel

**Status: completed.**

### Goal

Implement pure, tested Poincaré-disk isometries before exposing controls.

### Work

- Implement complex-number helpers locally using scalar pairs; do not introduce a dependency for basic arithmetic.
- Implement disk translation and rotation:

  ```text
  z' = exp(iθ) · (z - a) / (1 - conjugate(a) · z)
  ```

- Parameterize `a` with a bounded radial magnitude and angle, or equivalent X/Y values constrained strictly inside the unit disk.
- Add a continuous strength control that is neutral at zero. Interpolate transformation parameters, not final XY coordinates, so intermediate values remain disk-preserving.
- Define behavior for points outside the disk. Preferred initial policy: reuse the existing safe radial normalization before transforming and restore overflow monotonically afterward; validate this visually before freezing it.
- Add an optional circle-inversion primitive to the math module only if it shares the same domain/result contract. Its UI belongs to Session 11.

### Decisions recorded

- Translation uses bounded Cartesian disk parameters; strength scales both the translation vector and rotation angle from identity before evaluating the transform.
- Points on or outside the disk are evaluated along a safe near-boundary direction, then have their original radius restored. They remain finite, preserve monotonic radial overflow, and report `clipped-at-domain`.
- Circle inversion remains deferred to Session 11 because Session 3 does not need it for the Möbius isometry contract.

### Tests

- Zero translation and rotation are identity.
- Interior points stay inside the disk within numerical tolerance.
- Applying a transform and its inverse restores representative points.
- Hyperbolic-distance invariance holds for representative interior pairs.
- Near-boundary values remain finite.
- Rotation composition behaves predictably.

### Done when

- The kernel has no DOM, worker, SVG, or application-state dependencies.
- No new UI is visible yet.

## Session 4 — Möbius navigation vertical slice

**Status: completed.**

### Goal

Expose asymmetric hyperbolic navigation as a complete creative control with preview and export parity.

### Proposed controls

- Projection warp: None / Klein↔Poincaré / Hyperbolic Möbius.
- Hyperbolic direction: −180° to 180°.
- Hyperbolic displacement: 0% to a safe near-boundary maximum.
- Hyperbolic rotation: −180° to 180°.
- Warp strength: 0–100% if it is not redundant with displacement.

Prefer polar displacement controls because they guarantee a valid disk parameter. If direct X/Y controls prove more useful for the two-dimensional morph matrix, clamp their vector magnitude and clearly show coupled values.

### Work

- Add declarative controls in `ViewPanel.tsx` using existing form controls.
- Add settings, defaults, bindings, snapshot restore defaults, undo/redo, random locks, curated randomization, and morph targets in `slicer.ts`.
- Add settings to worker snapshots and projection cache/signature inputs.
- Update blueprint formula text so it names the active transform compactly.
- Keep old `lensWarpExponent` snapshots visually equivalent.
- Define precedence: only one projection-warp mode is active, followed by existing optical distortion.
- Ensure source SVG centrelines receive the transform.

### Decisions recorded

- Projection warp is an exclusive `none` / `klein-poincare` / `mobius` mode. A missing mode retains legacy behavior by selecting Klein↔Poincaré only when the stored exponent is nonzero.
- Möbius uses polar direction and displacement controls, plus independent rotation and strength. Displacement is capped at 95% of the disk radius; strength defaults to 100% and remains useful as a single neutral-to-active morph parameter.
- Perspective runs before the selected projection warp, and existing signed optical distortion runs afterward. Preview, exact SVG, and G-code consume the same adaptively projected runs.

### Tests

- `ViewPanel.test.tsx` covers accessible labels, ranges, and defaults.
- Contour integration tests prove neutral equivalence, asymmetric displacement, determinism, morph endpoints, and finite output near the boundary.
- G-code tests confirm finite, clipped coordinates.
- Snapshot restoration tests cover missing new fields and active new fields at the closest available boundary.

### Manual check

- Orbit, pan, zoom, change the Möbius centre, and morph the transform on a torus knot and an SVG centreline.
- Compare preview, downloaded SVG, and plotted G-code geometry.
- Check hidden lines close to the disk boundary.

## Session 5 — General scalar-field contract

**Status: completed.**

### Goal

Remove the assumption that every contour level has one constant plane normal while preserving the optimized planar path.

### Work

- Introduce the `MeshScalarField`-style abstraction described above.
- Move planar/custom/camera field construction behind a focused factory.
- Update contour extraction to consume vertex values plus optional analytic evaluation.
- Replace `CachedSlice.direction` with metadata capable of either a constant direction or local gradient.
- Preserve bounded topology caching. Camera-dependent fields remain uncached unless the cache is explicitly keyed by camera state.
- Preserve divergent fan and LFO behavior as planar-field decorators; reject or disable them for incompatible nonlinear and intrinsic fields.
- Define compatibility centrally rather than scattering UI checks:

  | Feature           | Planar             | Analytic curved | Intrinsic    |
  | ----------------- | ------------------ | --------------- | ------------ |
  | Gap easing        | Yes                | Yes             | Yes          |
  | LFO               | Yes                | Deferred        | No           |
  | Divergence        | Yes                | No              | No           |
  | Continuous spiral | Yes                | No              | No           |
  | Slice explode     | Constant direction | Local gradient  | Initially no |

- Make blueprint metadata tolerate a field without a global direction.

### Decisions recorded

- `MeshScalarField.values` are authoritative at vertices. Analytic fields may additionally evaluate off-vertex points for root refinement; intrinsic fields do not receive a fabricated evaluator.
- A non-empty field `cacheKey` opts into the existing bounded per-mesh topology cache. Model/custom planar fields provide stable keys, while camera fields remain uncached with an empty key.
- One compatibility resolver governs LFO, divergence, continuous spiral, and explosion. Planar fields retain all existing behavior, analytic fields allow local-gradient explosion when available, and intrinsic fields initially disable all four effects except gap easing.
- Cached slices now carry constant-direction or local-gradient metadata. Blueprint metadata reports a local/unavailable gradient rather than inventing a global direction.

### Tests

- All existing planar, divergent, LFO, spiral, explode, and cache behavior remains covered.
- A synthetic nonlinear field extracts stable, finite contours.
- Incompatible combinations resolve deterministically and do not depend solely on disabled HTML controls.
- Cache keys separate fields and parameters correctly.

### Done when

- There is no visual change for existing settings.
- New scalar-field implementations can be added without modifying the core triangle-marching algorithm.

## Session 6 — Spherical and cylindrical wavefront slicing

**Status: completed.**

### Goal

Ship the first curved model-space slicing fields.

### Proposed modes and controls

- Slice field: existing axes / Spherical wavefront / Cylindrical wavefront.
- Centre X/Y/Z: normalized model-space range, initially −100% to 100% of normalized radius.
- Cylinder axis azimuth/elevation.
- Optional radius offset or phase only if line-gap easing cannot express the desired result.

### Field definitions

- Sphere: `f(p) = length(p - c)` with gradient `normalize(p - c)`.
- Cylinder: `f(p) = length((p - c) - axis * dot(p - c, axis))`, with the corresponding radial gradient.

Use actual min/max vertex values for contour levels. At analytic singularities, return no gradient and skip or locally limit explode displacement.

### Work

- Add pure field implementations and unit tests.
- Use adaptive intersection refinement for curved fields.
- Add controls to `ContoursPanel.tsx` and complete `slicer.ts` bindings, snapshots, morphing, randomization, and compatibility states.
- Disable divergence, LFO, and spiral in the UI while enforcing the same rule in the engine.
- Support local-gradient slice explosion only after verifying it does not fold paths excessively. Otherwise ship wavefront slicing first and leave explode disabled with documentation.
- Update `PARAMETERS.md`.

### Decisions recorded

- The existing `axis` discriminator now also accepts `spherical` and `cylindrical`, preserving old snapshots without a migration. Missing wavefront parameters restore to a centred field and a model-Z cylinder axis.
- Centre controls are percentages of the normalized model radius; the renderer converts them to model coordinates before constructing the analytic field. Cylinder orientation uses the same azimuth/elevation convention as custom planar slicing.
- Both fields use actual finite vertex minima and maxima for level placement. Analytic evaluation drives bounded adaptive triangle refinement, and field-specific cache keys include every centre and axis component.
- Local-gradient slice explosion ships for both fields. Points at the sphere centre or cylinder axis return no gradient and remain unmoved; divergence, slice LFO, and continuous spiral are disabled in the UI and independently rejected by the engine compatibility resolver.

### Tests and manual check

- Analytic values and gradients match known points.
- Moving the centre changes topology deterministically.
- A sphere mesh sliced from its centre produces expected circular families.
- Off-centre and axis-singularity cases remain finite.
- SVG/G-code parity and artboard/mask clipping remain intact.
- Manually exercise morphology between two centres and cylinder-axis orientations.

## Session 7 — Mesh topology cache and geodesic solver

**Status: completed.**

### Goal

Build a reusable intrinsic-geometry foundation without exposing unfinished UI.

### Work

- Build unique undirected mesh edges from triangle indices.
- Store weighted vertex adjacency using Euclidean edge length.
- Detect boundary edges, connected components, isolated vertices, duplicate/zero-length edges, and non-manifold edges.
- Cache topology in a `WeakMap` keyed by installed mesh.
- Implement deterministic binary-heap Dijkstra for one or multiple seed vertices.
- Make tie-breaking stable by vertex index.
- Return `Infinity` for components unreachable from all seeds.
- Add helpers for selecting a stable seed vertex from a model-space direction: maximize the normalized dot product from mesh centre, then break ties by vertex index.
- Keep the public solver independent of rendering settings.

### Accuracy policy

The first version computes shortest paths along mesh edges. Call it **surface graph distance** in technical documentation while the UI may use the friendlier **Geodesic distance (mesh)**. Do not claim continuous exact geodesics. A later heat-method implementation can replace or complement it behind the same scalar-field boundary.

### Tests

- Exact distances on a triangle, square grid, tetrahedron, and disconnected mesh.
- Deterministic seed and tie behavior.
- Boundaries and non-manifold input do not crash.
- Repeated calls reuse topology but return independent distance buffers.
- Runtime and memory benchmarks on representative low-, medium-, and high-resolution meshes are recorded in the session notes or PR.

### Decisions recorded

- Cached topology uses compact typed arrays for lexicographically ordered unique edges, Euclidean weights, bidirectional adjacency, face incidence, component labels/sizes, boundary and non-manifold edge pairs, and isolated vertices. The `WeakMap` key is the installed mesh object, whose geometry is treated as immutable.
- Repeated triangle-edge occurrences collapse to one graph edge. `duplicateEdgeCount` reports occurrences after the first—including ordinary two-face manifold sharing—while distinct face incidence determines boundary (`1`) and non-manifold (`>2`) classification.
- Invalid-index triangles are skipped. Non-finite and zero-length edges are diagnosed and omitted from adjacency; disconnected and isolated vertices remain represented as components. This prevents unusable weights from entering the solver without hiding malformed input.
- Multi-source Dijkstra deduplicates and sorts valid seeds, orders equal-distance heap entries by vertex index, ignores invalid seeds, returns `Infinity` for unreachable vertices, and creates a new `Float64Array` for every solve while reusing topology.
- Directional seeds use the finite bounding-box centre and the projection of each centred vertex onto a normalized model-space direction, divided by the common model radius. Maximum score wins and exact ties retain the lower vertex index. Invalid or zero directions fall back to model Z.

### Benchmark baseline

Single-process Vitest measurements on the development machine (26 August 2026) used deterministic welded ripple spheres. Times are diagnostic, not test gates; retained memory counts cached typed-array payloads rather than transient construction objects.

| Fixture | Vertices | Triangles |  Edges | Cold topology | One distance solve | Retained arrays |
| ------- | -------: | --------: | -----: | ------------: | -----------------: | --------------: |
| Low     |      266 |       528 |    792 |       1.19 ms |            0.71 ms |        36.1 KiB |
| Medium  |    2,522 |     5,040 |  7,560 |       6.13 ms |            2.66 ms |       344.6 KiB |
| High    |   12,642 |    25,280 | 37,920 |      19.62 ms |            2.03 ms |     1,728.1 KiB |

## Session 8 — Single-source geodesic contours

**Status: completed.**

### Goal

Ship genuinely intrinsic equal-distance contours from one stable model-space seed.

### Proposed controls

- Slice field: Geodesic distance.
- Seed azimuth: −180° to 180°.
- Seed elevation: −90° to 90°.
- Optional “show seed” preview marker, SVG-only and off by default; defer if it complicates composition.

Direction-based seed selection is deterministic, snapshot-friendly, and works without a new canvas picking protocol. Interactive picking can be evaluated after the field is useful.

### Work

- Convert the finite distance buffer into an intrinsic scalar field.
- Compute min/max using only the selected seed's reachable component.
- Extract contours by interpolation over triangle edges.
- Decide unreachable-component policy. Preferred initial behavior: omit it and report the number of skipped components in development diagnostics.
- Cache distances by mesh plus seed vertex. Keep a small bounded cache because morphing the seed direction can visit many vertices.
- Disable divergence, LFO, continuous spiral, and initially slice explode.
- Add complete UI, state, snapshot, morph, randomization, and docs integration.
- Ensure quick previews can reduce contour count without recomputing topology; measure whether geodesic distances themselves need deferred scheduling.

### Tests and manual check

- Contours expand across folded geometry by surface route rather than model-space radius.
- Rotating the camera does not change intrinsic contour topology.
- Changing mesh or seed invalidates the right cache entries.
- Disconnected meshes remain finite and deterministic.
- Manually compare a torus, rounded cube, gyroid, and open uploaded mesh.

### Decisions recorded

- `geodesic` extends the existing `axis` discriminator. Missing seed settings restore to azimuth 0° and elevation 90°, selecting the extreme model-Z vertex, so older snapshots remain unchanged unless the new field is explicitly active.
- The UI calls the mode **Geodesic distance · mesh** while technical documentation calls its values **surface graph distances**. The field uses deterministic shortest paths along weighted mesh edges and does not claim continuous exact geodesics.
- Finite values from the seed's connected component define the level range. Other components retain `Infinity`, are omitted by marching triangles, and are counted in intrinsic development diagnostics.
- Distance buffers use a per-mesh, per-seed least-recently-used cache capped at eight entries. Three-dimensional contour topology continues through the existing independent eight-entry per-mesh cache, so orbiting only reprojects cached intrinsic contours.
- Divergence, slice LFO, continuous spiral, and slice explosion are disabled in the UI and independently rejected by the scalar-field compatibility resolver. Gap easing remains available. Imported SVG centrelines continue to bypass mesh-only fields.
- Quick preview reduces contour count through the existing preview policy without approximating or recomputing the distance solve. Exact SVG and G-code consume the same finished centreline runs.

### Verification and performance observation

- Focused coverage exercises folded geometry, disconnected components, cache reuse/eviction and mesh replacement, camera-topology invariance, seed changes, legacy defaults, compatibility rejection, deterministic SVG, and finite G-code.
- Diagnostic single-process measurements on welded ripple spheres were 12.87 ms cold / 1.03 ms cached at 1,986 vertices and 22.03 ms cold / 1.58 ms cached at 8,066 vertices. Cold time includes topology construction; these measurements do not justify a separate deferred scheduling path at the current mesh sizes.
- The full format, React Doctor, lint, typecheck, 197-test, and production-build sequence passed. React Doctor retained its existing maintainability warning for the large `ContoursPanel` component.
- Live browser comparison could not be completed because no browser backend was available in the development environment; torus, rounded-cube, gyroid, and open uploaded-mesh visual checks remain recommended before release.

## Session 9 — Multi-source geodesic fields

**Status: completed.**

### Goal

Extend intrinsic distance into artistically distinct wave-interference and region-boundary modes.

### Modes

1. **Nearest source:** `min(dA, dB, ...)`, producing colliding wavefronts.
2. **Distance difference:** `dA - dB`, producing hyperbola-like intrinsic bands.
3. **Voronoi boundary:** extract boundaries where nearest-source labels differ.

Start with two sources using independent azimuth/elevation controls. More sources should be a later data-model decision, not an arbitrary list embedded in DOM state.

### Work

- Extend Dijkstra to return nearest-source labels alongside distances.
- Define deterministic equal-distance label ties.
- Implement distance-difference normalization without hiding its meaningful zero level. Consider a dedicated symmetric spacing option rather than forcing existing 0–1 gap easing.
- Implement Voronoi boundaries as explicit mesh-edge/triangle crossings and feed the resulting world-space polylines into normal visibility and output composition.
- Add controls, snapshots, morphing, compatibility behavior, randomization, and documentation.
- Label color groups only if multiple-source identity reaches the final runs; otherwise keep existing gradient-by-level behavior.

### Tests

- Symmetric meshes produce symmetric difference fields.
- Swapping A and B negates the difference field but preserves geometry at zero.
- Nearest-source and Voronoi ties are deterministic.
- Seeds on disconnected components behave predictably.
- All modes retain SVG/G-code parity.

### Decisions recorded

- `geodesicMode` is `single`, `nearest`, `difference`, or `voronoi`. Old snapshots default to `single`; Seed B defaults to azimuth 0° and elevation −90°, opposite Seed A's +90° elevation.
- Multi-source Dijkstra labels vertices with the responsible seed vertex. Exact equal-distance ties select the lower seed vertex regardless of source input order; unreachable vertices retain distance `Infinity` and label `−1`.
- Nearest mode uses `min(dA,dB)` over every component reached by either seed. Difference mode is finite only where both seeds are mutually reachable; seeds on separate components therefore produce no difference contours. Voronoi similarly emits no boundary between disconnected components.
- Difference mode automatically normalizes to `[-max|dA−dB|,+max|dA−dB|]`, ignores Gap easing, and uses midpoint levels symmetric about zero. An even requested Line count is raised by one so zero and paired positive/negative levels are all present.
- Voronoi mode uses stable nearest-source labels to identify crossed triangle edges, then interpolates boundary points with signed `dA−dB`. It emits one explicit boundary family, so Line count and Gap easing are disabled. Swapping A/B preserves boundary geometry.
- Source identity does not survive into finished runs, so all modes retain existing gradient-by-level and line-index coloring rather than creating source-specific color groups.
- Single-seed distance and two-seed nearest/label caches are independently capped at eight entries per mesh. All multi-source modes continue through the bounded contour-topology cache and normal visibility, clipping, SVG, and G-code composition.

### Verification and performance observation

- Tests cover signed symmetry, source swapping, zero-contour preservation, deterministic nearest ties, explicit Voronoi extraction, disconnected components, cache eviction, legacy defaults, second-seed morph endpoints, and finite deterministic SVG/G-code for every mode.
- A sequential diagnostic on an 8,066-vertex welded ripple sphere measured Nearest at 32.45 ms cold / 0.80 ms cached, Difference at 8.46 ms additional cold / 2.38 ms cached, and Voronoi at 2.27 ms additional cold / 0.44 ms cached. Nearest included topology construction; later modes reused topology and previously computed buffers.
- The full format, React Doctor, lint, typecheck, 209-test, and production-build sequence passed. React Doctor retains only the known large-component maintainability warning for `ContoursPanel`.
- Live browser checks could not run because no browser backend was available. Visual comparison of nearest collisions, signed bands, and Voronoi boundaries on a torus, rounded cube, gyroid, and disconnected/open mesh remains recommended before release.

## Session 10 — Curvature contours

**Status: completed.**

### Goal

Expose local differential geometry as contour fields.

### Fields

- Gaussian curvature from angle defect divided by a robust vertex-area estimate.
- Signed mean curvature from the cotangent Laplacian and vertex normals.
- Shape index derived from principal curvatures if both estimates are stable enough.

Ship Gaussian and mean curvature first. Treat shape index as optional within this session.

### Work

- Reuse topology and boundary metadata from Session 7.
- Define behavior at boundaries and non-manifold vertices; invalid samples should be masked, not emitted as extreme values.
- Add deterministic Laplacian smoothing iterations for the scalar field, separate from mesh geometry.
- Normalize displayed contour ranges using a documented robust percentile clamp so a few degenerate vertices do not flatten the artwork.
- Provide signed-range handling with an option to emphasize or include zero.
- Cache raw curvature per mesh and smoothed variants by method/iteration count.
- Add field selector, smoothing, range/contrast controls, state integration, tests, and docs.
- Keep slice explosion disabled until a reliable surface-tangent field gradient is available.

### Tests and manual check

- Planar patches approach zero Gaussian and mean curvature away from boundaries.
- Sphere vertices have consistently positive Gaussian curvature and stable mean-curvature sign.
- Saddle fixtures contain negative Gaussian curvature.
- Scale normalization is understood: meshes are normalized on load, but tests should still verify mathematical scaling behavior.
- Degenerate and non-manifold fixtures remain finite.
- Manually inspect gyroid, Schwarz P, rounded cube, and noisy uploaded meshes at several smoothing levels.

### Decisions recorded

- Gaussian curvature uses barycentric vertex area and angle defect; signed mean curvature uses the cotangent Laplacian projected onto area-weighted oriented vertex normals. Mean sign therefore follows source winding.
- Vertices touching mesh boundaries, non-manifold edges, invalid or degenerate triangles, and isolated vertices are masked. Masked samples do not participate in smoothing or contour interpolation.
- Scalar smoothing is a deterministic uniform one-ring average with the original sample included, capped at 20 iterations. Raw Gaussian/mean arrays and each method/iteration result are weakly cached per installed mesh.
- Display normalization clips symmetrically at the selected absolute-value percentile (80th–100th), maps the retained magnitude to `[−1,+1]`, then applies a signed power contrast curve. Include zero selects a symmetric range and raises an even line count by one so zero is present.
- Curvature remains an intrinsic field: slice LFO, divergence, continuous spiral, and slice explosion are disabled. SVG and G-code consume the same extracted centreline runs.

## Session 11 — Spherical projections and circle inversion

**Status: completed.**

### Goal

Add a coherent family of projection warps using the nonlinear path and domain contract from Session 2.

### Projection modes

- Stereographic: conformal and circle-preserving.
- Gnomonic: maps great-circle geodesics to straight lines.
- Lambert azimuthal equal-area.
- Circle inversion as a separate conformal-plane experiment.

Orthographic already exists as a camera projection and should be described in the UI without duplicating its implementation as a warp.

### Work

- Define precisely how camera-plane coordinates lift to a sphere and where scale normalization occurs.
- Add a projection blend that is neutral at 0% and reaches the exact selected endpoint at 100%.
- Add projection centre/orientation only if it produces behavior distinct from camera azimuth/elevation.
- Implement explicit horizon/domain clipping for gnomonic and stereographic singularities.
- For inversion, expose centre X/Y, radius, and strength; split runs at the singular circle/point rather than joining across infinity.
- Reuse the mutually exclusive projection-warp selector introduced in Session 4.
- Complete state, snapshot, morph, randomization, documentation, and blueprint-formula integration.

### Tests

- Known points match analytic projections.
- Stereographic conformality is checked numerically on small orthogonal directions.
- Representative great-circle samples are collinear after gnomonic projection.
- Lambert projection preserves small-area ratios within tolerance.
- Inverted lines/circles satisfy their expected circle/line relations.
- Horizon crossings split into bounded finite runs.

### Decisions recorded

- Camera-plane radius lifts by the sphere exponential map `ρ = πr/2`. The normalized model circle `r = 1` is the spherical horizon. Stereographic and Lambert are scaled to radius one there; gnomonic retains its exact tangent-plane scale and front-hemisphere domain.
- Camera azimuth/elevation/roll supplies all useful orientation, so no second spherical centre/orientation control is exposed. One shared spherical strength blends final normalized XY from identity to the exact selected projection.
- Gnomonic rejects the horizon and back hemisphere. Stereographic and Lambert reject the antipode and the sphere lift rejects radii at or beyond the antipodal limit. A normalized output-radius guard bounds work near every singularity.
- Circle inversion exposes normalized centre X/Y, radius, and output-space strength. Its centre and over-limit samples are invalid, causing the adaptive projector to split runs instead of drawing a chord across infinity.
- Hidden-line depth faces are adaptively subdivided for spherical and inversion modes to a depth-pixel tolerance, with recursion capped at four. Invalid horizon/singularity subfaces are omitted safely.
- Existing camera orientation, projection warp, and optical distortion order remains unchanged. Exact SVG and G-code reuse the same adaptively projected runs.

## Session 12 — Hyperbolic tiling generator

### Goal

Generate deterministic `{p,q}` tilings in the Poincaré disk as plotter-ready line art.

### Proposed controls

- Polygon sides `p`.
- Polygons per vertex `q`.
- Generation depth.
- Disk radius/scale.
- Hyperbolic rotation and Möbius displacement.
- Edge mode: complete edges or selected rings, if the latter can be added without expanding scope.

Only accept hyperbolic pairs satisfying `(p - 2) * (q - 2) > 4`.

### Work

- Generate one fundamental polygon and reflect or transform it across geodesic edges.
- Represent Poincaré geodesics as circular arcs orthogonal to the disk boundary, with diameters handled as straight lines.
- Deduplicate vertices and edges using stable hyperbolic or quantized disk-space keys.
- Bound generation by depth and maximum edge count.
- Convert arcs to adaptively sampled line-art runs and install them through the existing centreline source path.
- Decide source placement: preferred initial design is a new deterministic demo/generative line-art source, not an effect applied to arbitrary meshes.
- Reuse the Möbius kernel to navigate the tiling.
- Ensure clipping, color, Humanizer, yarn, masks, SVG, and G-code work through normal line-art composition.

### Tests and manual check

- Valid and invalid `{p,q}` pairs are handled clearly.
- Generated vertices stay inside the disk.
- Geodesic arcs meet the boundary orthogonally within tolerance.
- Edge counts are deterministic and bounded.
- No duplicate reversed edges are emitted.
- SVG/G-code contain the same base runs.
- Manually inspect `{3,7}`, `{4,5}`, and `{7,3}` at several depths.

## Session 13 — Cross-feature hardening and release documentation

### Goal

Resolve interactions that are easy to miss while individual features are developed.

### Compatibility audit

Exercise every new field or projection with:

- Quick preview and exact export.
- Orbit, roll, pan, and zoom.
- Hidden-line removal and silhouette.
- Gap easing and line-weight modes.
- Morph X and X/Y matrices.
- Gradients and indexed line colors.
- Humanizer and yarn curl.
- Artboard and generative-mask clipping.
- Topographic annotations and blueprint mode.
- SVG centerline imports where applicable.
- SVG and both G-code profiles.
- Undo/redo and named snapshots created before and after the new settings.

### Performance audit

- Measure worker time, end-to-paint time, node counts, and memory on representative meshes.
- Verify bounded caches during prolonged morphing and source switching.
- Set practical UI limits for tiling depth, field smoothing, and source count from measurements rather than guesswork.
- Confirm stale worker results remain rejected when expensive intrinsic fields are superseded.
- Consider moving topology-derived arrays into mesh-install worker messages only if profiling shows a meaningful benefit.

### Documentation

- Update `PARAMETERS.md` with exact defaults, ranges, compatibility, and metric terminology.
- Update `ARCHITECTURE.md` with projection, scalar-field, topology-cache, and generative-line-art flow.
- Update `TESTING.md` if new modules enter the coverage scope or add benchmark fixtures.
- Add short recipes for at least:
  - Off-centre Möbius compression.
  - Spherical wavefront contours.
  - A two-source intrinsic interference pattern.
  - Gaussian-curvature bands on a gyroid.
  - A navigated `{7,3}` hyperbolic tiling.

### Final verification

Run the complete project sequence:

```bash
npm run format:check
npm run doctor
npm run lint
npm run typecheck
npm test
npm run build
```

Then manually test at least one uploaded STL/OBJ/PLY, one filled SVG extrusion, and one SVG centreline source.

## Decisions intentionally deferred

The following ideas should not be silently added while implementing the sessions above:

- Continuous heat-method geodesics versus graph-edge distances.
- Canvas click/raycast seed placement and draggable seed handles.
- More than two persistent geodesic sources.
- LFO modulation of intrinsic fields.
- Intrinsic continuous spirals.
- Reliable explode directions for geodesic and curvature fields.
- Conformal mesh parameterization or full surface flattening.
- Exporting hyperbolic arcs as native SVG `A` commands rather than sampled centerlines.
- A general node-based field-composition editor.

Each is a plausible follow-up, but each changes the interaction or numerical model enough to deserve its own design session.

## Per-session handoff template

End every implementation session with a short entry in the PR or working notes containing:

1. What became user-visible.
2. Settings and snapshot defaults added.
3. Mathematical conventions and domain policies chosen.
4. Compatibility restrictions enforced in both UI and engine.
5. Tests added and commands run.
6. Manual workflows exercised.
7. Performance observations and cache behavior.
8. Remaining risks or explicitly deferred work.

This keeps later sessions from having to rediscover numerical and product decisions from code alone.
