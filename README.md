# Slicewise

Slicewise is a local-first browser studio for turning 3D meshes and filled SVG artwork into contour drawings. It previews the result interactively and exports clean SVG or plotter-ready G-code.

All geometry processing happens in the browser. Uploaded artwork and models are not sent to a server.

## Capabilities

- Import binary or ASCII STL, OBJ, ASCII or binary PLY, and filled SVG artwork.
- Extrude SVG artwork with proportional depth and optional rounded edges.
- Start from built-in demo meshes, generate implicit-surface meshes, or create `{p,q}` hyperbolic tiling line art.
- Slice by planar, spherical/cylindrical wavefront, surface-graph distance, or Gaussian/mean-curvature fields.
- Apply Möbius navigation, spherical map projections, circle inversion, and optical distortion through one projection pipeline.
- Create discrete contours or continuous helicoidal paths.
- Remove hidden lines and add silhouettes.
- Morph selected parameters across one- or two-dimensional instance grids.
- Apply gradients, halftone strokes, chromatic aberration, humanization, and blueprint styling.
- Export SVG or configurable plotter G-code, including a UUNA TEK 3.0 A3 profile.

## Getting started

Requirements: a current Node.js release and npm.

```bash
npm install
npm run dev
```

Vite prints the local development URL. Production verification uses:

```bash
npm run format:check
npm run doctor
npm run lint
npm run typecheck
npm run build
```

`npm run preview` serves the generated `dist` build locally.

## Testing

```bash
npm test
npm run test:watch
npm run test:coverage
```

Tests are colocated with the modules they protect. The suite covers ASCII and binary mesh parsing, SVG extrusion, contour modes and effects, deterministic colour pairing, every generative field family, G-code output, and React control-event contracts. See the [testing guide](./docs/TESTING.md) for conventions, fixtures, and enforced coverage thresholds.

## Repository guide

```text
src/
├── App.tsx                    Application composition and runtime bootstrap
├── components/
│   ├── controls/              Stateful form controls shared by feature panels
│   ├── panels/                Source, morph, view, contour, and output panels
│   └── ui/                    Small visual primitives
├── lib/
│   ├── contour-engine.ts      DOM-free mesh-to-SVG contour pipeline
│   ├── polyline-styling.ts    Deterministic simplification and run effects
│   ├── projection.ts          Projection warps and adaptive nonlinear paths
│   ├── scalar-fields.ts       Planar, curved, geodesic, and curvature fields
│   ├── hyperbolic-tiling.ts   Poincaré-disk tiling line-art generator
│   ├── demo-meshes/           Built-in procedural mesh generators
│   ├── mesh.ts                Mesh parsers, normalization, and normals
│   ├── slicer.ts              Browser state, bindings, history, and export flow
│   ├── slicer-export.ts       DOM-free export/profile assembly
│   ├── slicer-worker.ts       Contour worker message adapter
│   ├── generativeMesh.ts      Implicit-field mesh generation
│   ├── generative-mesh-worker.ts
│   ├── svg-mesh.ts            SVG parsing and extrusion
│   ├── gcode.ts               Plotter G-code serialization
│   └── colorPair.ts           Perceptual random colour pairing
├── index.css                  Application styles
└── main.tsx                   React entry point
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) describes runtime data flow, module boundaries, worker behavior, and extension guidance.
- [Parameter reference](./docs/PARAMETERS.md) documents user-facing controls, defaults, ranges, and export behavior.
- [Testing guide](./docs/TESTING.md) covers test conventions, fixtures, coverage, and verification commands.
- [Evolution guide](./docs/EVOLUTION.md) records current pressure points, extraction seams, and the checklist for the next product push.
- [Non-Euclidean recipes](./docs/NON_EUCLIDEAN_RECIPES.md) gives starting settings for Möbius, wavefront, intrinsic, curvature, and tiling studies.

Contributor and coding-agent guidance lives in [AGENTS.md](./AGENTS.md).

## Deployment

The Vercel configuration builds the Vite application into `dist` and rewrites application routes to `index.html`. `slicewise.html` is the original standalone prototype and remains reference material; the maintained application starts at `src/main.tsx`.

## License

See [LICENSE](./LICENSE).
