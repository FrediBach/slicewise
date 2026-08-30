# Animation architecture

Slicewise animation is a non-destructive timeline over one frozen Config-mode settings snapshot. It does not add time awareness to the contour engine: every preview or export frame is evaluated into an ordinary `ContourSettings` object and sent through the existing render pipeline.

## Project model

`AnimationProject` is a DOM-free, versioned value owned by `animation-project.ts`. It contains:

- the immutable `baseSettings` captured on entry to Animation mode;
- duration, FPS, loop-preview, and video-export settings;
- a sorted global keyframe lane with a protected keyframe at `0 ms`;
- a complete registered morphable-value snapshot and outgoing easing on each keyframe.

Timeline edit functions return detached projects and never mutate their input. A dedicated `ParameterHistory<AnimationProject>` provides animation-only undo and redo. Config history and named parameter snapshots do not contain animation projects.

`animation-validation.ts` specifies the persisted invariants. `animation-migrations.ts` repairs incomplete version-one projects, fills newly registered values from the frozen base settings, normalizes timing and export values, removes duplicate keyframe times, repairs IDs, and adds the protected time-zero keyframe. Unsupported future project versions fall back to a new project instead of being interpreted as an older schema.

## Evaluation and interpolation

The browser runtime builds the morphable parameter registry from the same controls and setting mapping used by the existing Morph feature. Evaluation follows this fixed pipeline:

```text
playhead → surrounding keyframes → outgoing easing → typed interpolation
         → merge over frozen base settings → suppress X/Y Morph → render
```

Rules are deterministic:

- exact keyframe times return exact registered values;
- continuous numbers interpolate after easing and clamp to their descriptor range;
- integer values interpolate, round, and clamp;
- seeds hold the earlier value until the next keyframe;
- colours interpolate in RGB;
- missing registered values fall back to the frozen base setting;
- times before or after the keyframe range use the nearest endpoint.

Evaluation clones the base settings and always clears `morphEnabled`, `morphSecondEnabled`, `morphTargets`, and `morphTargets2`. It never mutates the project or Config state.

## Playback and rendering

Playback is clock-driven. `animation-playback.ts` derives the playhead from elapsed monotonic time, while `slicer.ts` requests quick renders at the configured preview cadence. Slow contour work may drop preview frames without slowing the timeline. Scrubbing also uses quick renders, followed by a debounced exact settle render; pausing and non-loop completion settle exactly.

Animation renders use explicit settings snapshots with history ignored and a distinct render purpose. Animation-preview results may update the viewport but cannot replace the last exact Config result used by SVG/G-code export. Animation-export results are routed only to the waiting video frame.

## Local persistence

`animation-storage.ts` keeps one autosaved animation for the local browser workspace in the `slicewise-animations` IndexedDB database. A generated project ID is retained under `slicewise.animationProjectId` in local storage, so association does not depend on an uploaded filename. The stored envelope has its own `storageVersion`, project ID, update timestamp, and versioned `AnimationProject` payload.

The first entry into Animation mode loads and migrates that record. The timeline is reused only when its frozen base settings equal the current Config snapshot; otherwise Slicewise creates and autosaves a new project for the workspace. Autosaves occur after coalesced animation history commits. Storage failures do not prevent editing or export, and source mesh/artwork bytes are never stored or uploaded by animation persistence.

Ordinary named parameter snapshots remain separate. There is intentionally no animation preset import/export or multi-project browser in the first release.

## Video export

Video export is deterministic and independent of playback. `animation-video-export.ts` defines an endpoint-inclusive frame schedule and explicit microsecond timestamps. For each frame, `slicer.ts` evaluates the project, waits for one exact worker render, rasterizes its SVG onto an opaque even-sized canvas, and submits it to `video-encoder.ts`.

The encoder adapter uses WebCodecs through Mediabunny, preferring VP9 with VP8 fallback, and produces a silent WebM. Frames are processed sequentially with backpressure rather than cached as SVGs. Cancellation aborts the pending sequence and closes encoder resources; animation and Config state remain usable afterward. All rendering, rasterization, encoding, persistence, and download work remains local to the browser.
