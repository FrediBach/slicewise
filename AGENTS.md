# Contributor guide for coding agents

## Project overview

Slicewise is a local-first Vite, React, and TypeScript application that converts 3D meshes and filled SVG artwork into contour drawings and plotter-ready output. The maintained application is under `src/`; root-level `slicewise.html` is a historical prototype and is not part of the production module graph.

Read the relevant documentation before making changes:

- `docs/ARCHITECTURE.md` for runtime data flow, module ownership, worker boundaries, and extension guidance.
- `docs/PARAMETERS.md` for user-facing settings, defaults, ranges, and interactions.
- `docs/TESTING.md` for test conventions, coverage scope, and verification commands.

## Development commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run test:watch` while developing and `npm run test:coverage` when checking coverage. Do not commit generated `dist/` or `coverage/` output.

## Code organization and invariants

- Keep geometry, contour, and serialization logic deterministic and DOM-free in `src/lib/` where possible.
- Keep browser orchestration, UI bindings, history, preview behavior, and downloads in `src/lib/slicer.ts`.
- Preserve control element IDs and custom event names unless their producers and consumers are updated together. React markup and the imperative runtime use these as internal interfaces.
- Keep worker messages serializable. Transfer large typed-array buffers instead of cloning them when practical.
- Treat uploaded models and artwork as local-only data; do not add server uploads or telemetry for source content.
- Reuse controls in `src/components/controls/` and visual primitives in `src/components/ui/` before creating new ones.
- Update `docs/PARAMETERS.md` for changes to user-visible controls or defaults, and update `docs/ARCHITECTURE.md` when module boundaries or data flow change.

## Testing expectations

Add or update the smallest test at the closest stable boundary for behavior changes and bug fixes. Tests live beside implementation files as `.test.ts` or `.test.tsx`; browser-dependent component tests should declare the jsdom environment. Prefer observable behavior and event contracts over large snapshots.

Before handing off a change, run the checks relevant to it. For a full verification pass, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For control or runtime-binding changes, also manually exercise the affected workflow in the browser when possible. Build success validates module and worker graphs but does not validate interactions.
