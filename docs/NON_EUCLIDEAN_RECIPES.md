# Non-Euclidean recipes

These recipes are starting points rather than presets. Values use the control names from the interface and preserve exact SVG/G-code geometry unless a noted effect is SVG-only.

## Off-centre Möbius compression

1. Load **Ripple sphere** and set **Projection warp** to **Hyperbolic Möbius**.
2. Set **Hyperbolic direction** to `35°`, **Hyperbolic displacement** to `65%`, **Hyperbolic rotation** to `−20°`, and **Warp strength** to `85%`.
3. Use **Perspective** `0%` and **Lens distortion** `0%` to see the disk isometry without optical distortion.
4. Turn on an X morph for **Hyperbolic displacement** with a target of `10%`. Four X steps show the asymmetric compression developing from near-centred to strongly displaced.

The transform is a camera-space projection warp. It preserves Poincaré-disk hyperbolic distance; it does not change distances on the source mesh.

## Spherical wavefront contours

1. Load **Ripple sphere** and choose **Spherical wavefront** for **Slice field**.
2. Set **Centre X/Y/Z** to `35% / −20% / 10%`, **Line count** to `48`, and **Gap easing** to **Sine · In & Out**.
3. Set **Slice explode** to `35%` to separate levels along the analytic local radial gradient.
4. Orbit the model or add a spherical projection warp; the wavefront topology remains defined in model space while the projection changes only its image.

Spherical wavefront distance is ambient model-space radius from the chosen centre. It is nonlinear but is not intrinsic surface distance.

## Two-source intrinsic interference

1. Load **Torus knot** and choose **Geodesic distance · mesh** for **Slice field**.
2. Choose **Distance difference** for **Geodesic mode**.
3. Set Seed A to `30°` azimuth and `55°` elevation; set Seed B to `−145°` azimuth and `−45°` elevation.
4. Use **Line count** `41`, **Uniform** line weight, and a three-colour gradient. The zero contour is included automatically and marks equal surface-graph distance from both seeds.

For colliding unsigned fronts, switch to **Nearest source**. For only the region boundary, use **Voronoi boundary**. These modes use shortest paths along mesh edges, not continuous exact geodesics.

## Gaussian-curvature bands on a gyroid

1. Choose **Generative mesh**, select **Gyroid**, keep **Frequency** near `2`, and use **Resolution** `96` while editing.
2. Choose **Mesh curvature** for **Slice field** and **Gaussian curvature** for **Curvature field**.
3. Set **Field smoothing** to `3`, **Robust range** to `97`, **Curvature contrast** to `120%`, and keep **Include zero curvature** on.
4. Use an odd **Line count**, such as `31`, so positive and negative bands remain balanced around the zero-curvature family.

Curvature values are robustly normalized for display after calculation. Smoothing changes only the scalar field, never the gyroid vertices.

## Navigated `{7,3}` hyperbolic tiling

1. Choose **Hyperbolic tiling** as the source. Set **Polygon sides** to `7`, **Polygons per vertex** to `3`, **Generation depth** to `4`, and **Disk scale** to `92%`.
2. In View, choose **Hyperbolic Möbius**. Set **Hyperbolic direction** to `−40°`, **Hyperbolic displacement** to `40%`, **Hyperbolic rotation** to `25°`, and **Warp strength** to `100%`.
3. Add an X morph from **Disk scale** `92%` to `68%`, then add a Y morph from **Hyperbolic rotation** `25°` to `−30°`.
4. A gradient, Humanizer, Yarn cut & curl, masks, and topographic annotations all operate through the ordinary centreline composition path and are included in plotter geometry where documented.

The source contains sampled Poincaré geodesics. Native SVG arc commands and selected-ring generation remain intentionally deferred.
