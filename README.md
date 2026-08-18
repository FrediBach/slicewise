# Slicewise

A browser-based contour studio that slices 3D meshes into clean, single-weight SVG paths for plotting, laser work, and illustration.

## Features

- Imports binary/ASCII STL, OBJ, and ASCII/binary PLY models
- Includes torus-knot, rippled-sphere, rounded-cube, and ring-torus demos
- Generates topographic, camera-depth, width, or depth contours
- Optional continuous helicoidal slicing for pen-down spiral paths
- Optional hidden-line removal and silhouette generation
- Interactive orbit, roll, and zoom controls
- Configurable sheet size, margin, ink colour, and stroke width
- Local-only mesh processing with SVG download and clipboard export
- Responsive React interface with shadcn-compatible component structure

## Development

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
```

The Vercel configuration builds the Vite app to `dist` and rewrites application routes to `index.html`.

## Architecture

The interface lives in `src/App.jsx`, reusable UI primitives are under `src/components/ui`, and the dependency-free geometry pipeline is in `src/lib/slicer.js`. The original single-file prototype remains in `slicewise.html` for reference.
