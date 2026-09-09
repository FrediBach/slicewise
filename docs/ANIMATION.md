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

Registered parameters include generative mesh and terrain numeric settings, SVG cutting-path placement, divergence, effect seeds, map settings, and effect colours. Generated sources are resolved in the contour worker for each evaluated frame before Object deformation, using the frozen source kind and up-axis correction. Resolution is integer-valued; seeds hold until the next keyframe.

Evaluation clones the base settings and always clears `morphEnabled`, `morphSecondEnabled`, `morphTargets`, and `morphTargets2`. It never mutates the project or Config state.

## Playback and rendering

Playback is clock-driven. `animation-playback.ts` derives the playhead from elapsed monotonic time, while `slicer.ts` requests quick renders at the configured preview cadence. Slow contour work may drop preview frames without slowing the timeline. Scrubbing also uses quick renders, followed by a debounced exact settle render; pausing and non-loop completion settle exactly.

Playback submits work only when the contour worker and queue are idle. Advancing the playhead no longer supersedes an unfinished frame, so expensive results reach the preview instead of being perpetually discarded. Control values update with displayed frames, and timeline notifications follow the project FPS rather than every browser refresh. Animation presentations skip the unchanged Config G-code serialization/preflight.

`animation-frame-cache.ts` owns the DOM-free playback cache and scheduling policy. Frames use stable FPS-aligned timeline indexes, allowing later loops and replay to reuse completed SVG previews and their evaluated settings. On a cache hit, spare worker time prepares the next missing frame within a bounded 32-slot look-ahead, wrapping only for loops. Prefetched results populate the cache without jumping the viewport ahead. A newly displayed cached frame supersedes older visible work, while a still-valid late result can remain useful to the cache.

The cache holds at most 240 frames and an estimated 32 MiB (UTF-16 SVG/settings strings plus per-frame overhead). If either limit is exceeded, it repeatedly doubles the sampling interval and drops off-grid entries, retaining samples across the timeline instead of continually evicting the start of a loop. Oversized individual frames can display but are not retained. The immutable project identity and mesh version scope every cache generation: edits, undo/redo, timing changes, and source replacement invalidate old frames, including late responses. Leaving Animation mode releases the cache. This is a local in-memory preview cache; it never supplies paused exact renders, Config export, or video-export frames.

Animation renders use explicit settings snapshots with history ignored and a distinct render purpose. Animation-preview results may update the viewport but cannot replace the last exact Config result used by SVG/G-code export. Animation-export results are routed only to the waiting video frame.

## Local persistence

`animation-storage.ts` keeps one autosaved animation for the local browser workspace in the `slicewise-animations` IndexedDB database. A generated project ID is retained under `slicewise.animationProjectId` in local storage, so association does not depend on an uploaded filename. The stored envelope has its own `storageVersion`, project ID, update timestamp, and versioned `AnimationProject` payload.

The first entry into Animation mode loads and migrates that record. The timeline is reused only when its frozen base settings equal the current Config snapshot; otherwise Slicewise creates and autosaves a new project for the workspace. Autosaves occur after coalesced animation history commits. Storage failures do not prevent editing or export, and source mesh/artwork bytes are never stored or uploaded by animation persistence.

Ordinary named parameter snapshots remain separate. There is intentionally no animation preset import/export or multi-project browser in the first release.

## Video export

Video export is deterministic and independent of playback. `animation-video-export.ts` defines an endpoint-inclusive frame schedule and explicit microsecond timestamps. For each frame, `slicer.ts` evaluates the project, waits for one exact worker render, rasterizes its SVG onto an opaque even-sized canvas, and submits it to `video-encoder.ts`.

The encoder adapter uses WebCodecs through Mediabunny, preferring VP9 with VP8 fallback, and produces a silent WebM. Frames are processed sequentially with backpressure rather than cached as SVGs. Cancellation aborts the pending sequence and closes encoder resources; animation and Config state remain usable afterward. All rendering, rasterization, encoding, persistence, and download work remains local to the browser.

The timeline’s **Export video** button opens a native modal dialog and pauses active playback. The dialog selects a long edge of 1080, 1920, 2560, or 3840 pixels and a bitrate of 4, 8, 16, 24, 40, 60, or 100 Mbps. New projects default to 1920 pixels and 24 Mbps. Resolution follows the frozen artboard aspect ratio with even dimensions; bitrate is independent of resolution and FPS. The dialog shows actual pixel dimensions, duration, FPS, and an approximate file size derived from bitrate and duration. Actual encoder output can differ from that estimate.

Only **Start export** publishes the export command; opening the dialog or changing quality never starts encoding. Confirmation is disabled while support is being checked or the selected settings are unsupported. The dialog can always be opened to correct unsupported settings. Cancel and Escape dismiss it without exporting; quality selections remain autosaved. Native modal focus containment, focus restoration on dismissal, and suppression of background timeline shortcuts keep keyboard interaction inside the dialog.

These settings use the existing `project.export` model and participate in animation undo/redo and local autosave. Restored projects retain their saved export settings, including older or custom values; missing settings receive the new defaults. Changes are disabled during playback/export and recheck codec support before enabling export. Undo/redo also refreshes support when export settings change. The export loop uses the selected dimensions for rasterization and passes the chosen bitrate to the encoder without changing contour quality or preview rendering.
