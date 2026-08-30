# Video Mode

The cleanest design is to treat animation as a separate, non-destructive layer over a frozen configuration:

- Config mode edits the artwork.
- Animation mode freezes that configuration.
- Keyframes contain only values from the existing morphable-parameter allowlist.
- Each preview or export frame is produced by interpolating those keyframes into one ordinary `ContourSettings` snapshot.
- The existing grid-based Morph feature remains separate and is temporarily suppressed during animation.

This fits the current exhaustive settings adapter, worker pipeline, and local-first architecture without teaching the contour engine about timelines.

## 1. Product behavior

### Mode switch

Add a prominent `Config / Animation` switch, preferably in the workspace top bar.

Entering Animation mode:

1. Commit any pending parameter-history change.
2. Capture an immutable base settings snapshot.
3. Preserve existing Morph configuration, but force Morph off in animation render snapshots so each frame contains one contour drawing.
4. Create an animation project if none exists.
5. Add a protected keyframe at `0:00` containing the current morphable values.
6. Lock source selection, mesh generation, canvas dimensions, effect enablement, export-machine settings, snapshots, and other non-morphable controls.
7. Reveal the timeline below the preview.

Leaving Animation mode:

1. Stop playback or export.
2. Preserve the animation project in memory.
3. Restore the exact Config-mode snapshot, including the existing Morph setup.
4. Render the normal static configuration again.

Animation edits must never mutate the frozen base configuration.

### What “config locked” means

The sidebar should remain visible so users retain context, but its controls have three states:

- Morphable control + selected keyframe: editable.
- Morphable control + playhead between keyframes: read-only, showing the interpolated value.
- Non-morphable control: locked with the explanation “Return to Config mode to change this setting.”

Orbit, roll, zoom, and pan gestures count as morphable edits. They should update the selected keyframe, but be disabled while playing or when the playhead is not on a keyframe.

The existing Morph arrows and X/Y target inputs should be hidden in Animation mode; otherwise two different interpolation systems would be visible simultaneously.

### Keyframe workflow

Recommended timeline behavior:

- Default duration: 5 seconds.
- Default preview/export rate: 30 fps.
- One protected keyframe at time zero.
- Clicking a keyframe selects it and moves the playhead to it.
- Scrubbing away from a keyframe deselects it and shows an interpolated, read-only state.
- “Add keyframe” captures all currently evaluated morphable values at the playhead.
- Editing any morphable control updates the selected keyframe immediately.
- Keyframes can be dragged, duplicated, or deleted, except for the protected time-zero keyframe.
- Keyframes cannot overlap; dragging onto an occupied time snaps beside it or is rejected.
- The animation duration cannot be shortened below the final keyframe.

A keyframe should hold a complete snapshot of all morphable values rather than sparse property overrides. It uses a little more storage but makes insertion, migration, undo, and evaluation much more predictable.

### Timeline UI

The timeline below the preview should contain:

- Play/pause
- Jump to start/end
- Current time and total duration
- Scrubber/playhead
- Keyframe diamonds
- Add, duplicate, and delete keyframe actions
- Loop-preview toggle
- Duration
- FPS
- Easing for the outgoing segment
- Export Video

For the first version, use one global keyframe lane. Individual property tracks and a dope-sheet view can come later.

Keyboard behavior:

- Space: play/pause unless typing in a field
- Left/right: move one frame
- Shift + left/right: move ten frames
- K: add keyframe
- Delete/Backspace: delete selected keyframe
- Home/End: start/end
- Ctrl/⌘ Z: animation undo while in Animation mode

Respect `prefers-reduced-motion`: do not autoplay and leave loop preview off by default for those users.

## 2. Animation data model

Create a pure, versioned model, independent of React and the DOM:

```ts
type AnimationProject = {
  version: 1;
  baseSettings: ContourSettings;
  durationMs: number;
  fps: number;
  loopPreview: boolean;
  export: AnimationExportSettings;
  keyframes: AnimationKeyframe[];
};

type AnimationKeyframe = {
  id: string;
  timeMs: number;
  values: AnimationValues;
  easingToNext: AnimationEasing;
};

type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';
```

`AnimationValues` should be derived from a central morphable-parameter registry, not declared as arbitrary `Partial<ContourSettings>`.

The registry should define:

```ts
type AnimationParameterDescriptor = {
  controlId: string;
  settingKey: keyof ContourSettings;
  kind: 'continuous' | 'integer' | 'seed' | 'color';
  min?: number;
  max?: number;
  step?: number;
};
```

This registry should become the shared source of truth for both Morph and Animation eligibility.

That cleanup matters because morphability is currently split between `ValueControl` defaults and `morphKeyById` inside [slicer.ts](/Users/fredibach/Projects/slicewise/src/lib/slicer.ts). For example, the background colour control presents a morph affordance, but only the ink-colour key is explicitly registered. Centralizing the registry prevents UI/runtime drift.

## 3. Interpolation rules

Implement interpolation in a new DOM-free module such as:

- `src/lib/animation-project.ts`
- `src/lib/animation-interpolation.ts`
- `src/lib/animation-parameters.ts`

Evaluation should follow this sequence:

```text
playhead time
    ↓
surrounding keyframes
    ↓
segment easing
    ↓
interpolate registered values
    ↓
merge into frozen base settings
    ↓
force grid Morph off
    ↓
ordinary contour render
```

Recommended rules:

- Continuous numeric values: direct linear interpolation after easing.
- Integer counts: interpolate, then round and clamp.
- Seed values: hold the earlier value until the next keyframe. Interpolating seeds would cause unstable reshuffling on nearly every frame.
- Colours: initially use RGB interpolation to match the existing Morph implementation. OKLCH interpolation can be a later visual-quality enhancement.
- Angles: initially use direct numeric interpolation for parity with Morph. Add optional shortest-path angle interpolation later.
- Before the first keyframe: use the first value.
- After the last keyframe: use the last value.
- At an exact keyframe time: return its values exactly, without floating-point drift.
- Unknown or newly introduced settings: fall back to the frozen base configuration.

The evaluator must never mutate the project, keyframes, or base settings.

## 4. Rendering architecture

The existing render scheduler in [slicer.ts](/Users/fredibach/Projects/slicewise/src/lib/slicer.ts) always snapshots the mutable global state and records parameter history for full renders. Animation needs explicit derived snapshots.

Refactor it to support something equivalent to:

```ts
requestRender({
  settings,
  quality: 'quick' | 'exact',
  history: 'record' | 'ignore',
  purpose: 'config' | 'animation-preview' | 'animation-export',
});
```

This prevents playback renders from:

- Mutating Config state
- Filling parameter history
- Accidentally exporting a stale frame
- Re-enabling the existing Morph grid

### Playback

Playback should be clock-driven, not render-count-driven:

1. Use `requestAnimationFrame` and elapsed monotonic time to calculate the playhead.
2. Evaluate settings for that time.
3. Request a quick render.
4. Coalesce queued frames using the current latest-request-wins behavior.
5. Drop preview frames if contour rendering is slower than the desired rate.
6. Keep the playhead tied to elapsed time so the animation does not slow down.
7. On pause or completion, request an exact render for the final playhead position.

Scrubbing should use the same quick-render path and issue an exact render after a short idle debounce.

Avoid caching every rendered SVG. Complex animations could consume large amounts of memory; retain only the current committed frame and perhaps one pending frame.

## 5. Video export

Video export must be deterministic and independent of real-time playback:

```text
frame index
    ↓
exact timeline time
    ↓
interpolated ContourSettings
    ↓
exact worker render
    ↓
SVG rasterized into fixed-size canvas
    ↓
VideoFrame with explicit timestamp
    ↓
video encoder + container muxer
    ↓
download
```

Recommended first-release output:

- WebM
- VP9 where supported, VP8 fallback
- No audio
- 30 fps default, with 24/30/60 choices
- Derived aspect ratio from the artboard
- 1080-pixel long edge by default
- Even pixel dimensions for codec compatibility
- Configured background flattened to an opaque frame
- Exact, non-quick contour rendering for every frame

WebCodecs is the appropriate primary path because it provides frame-level encoding and accepts canvas sources as `VideoFrame`s. Codec support must still be checked at runtime because implementations may support different codec combinations. [MDN WebCodecs guide](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API), [W3C WebCodecs specification](https://www.w3.org/TR/webcodecs/).

Use a small, audited WebM muxer behind an internal `VideoEncoderAdapter`; do not let muxer-specific types leak into timeline or rendering code. A short implementation spike should select the dependency based on maintenance, bundle size, browser coverage, and streaming output support.

`MediaRecorder` plus `canvas.captureStream()` should be only a fallback. Although manual canvas frame requests exist, that path has limited availability and is more closely tied to real-time capture, making slow contour frames harder to export reliably. [MDN CanvasCaptureMediaStreamTrack.requestFrame](https://developer.mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack/requestFrame).

Export behavior:

- Lock timeline editing while exporting.
- Render sequentially so memory stays bounded.
- Show `Rendering frame 42 / 150`, elapsed time, and cancellation.
- Check cancellation between frames and after each encoder flush.
- Close every `ImageBitmap`, `VideoFrame`, encoder, and object URL.
- Never update the visible preview for each export frame.
- Keep all source geometry and encoded data local to the browser.
- If the browser has no supported encoder, explain that video export is unavailable; playback and timeline editing must still work.

For `N` frames, evaluate animation time as:

```ts
timeMs = N === 1 ? 0 : (frameIndex / (N - 1)) * durationMs;
timestampUs = Math.round((frameIndex / fps) * 1_000_000);
```

This guarantees that both the first and final keyframes appear in the exported sequence.

## 6. React and runtime boundaries

Suggested components:

- `components/animation/ModeSwitch.tsx`
- `components/animation/AnimationTimeline.tsx`
- `components/animation/AnimationTransport.tsx`
- `components/animation/AnimationExportDialog.tsx`

React should own presentation and accessible interaction state. The pure animation project and interpolation logic should live in `src/lib/`. Browser rendering, worker coordination, SVG rasterization, and download behavior remain browser orchestration.

Given the current event-based bridge, use a small typed event surface:

- `animationmodechange`
- `animationcommand`
- `animationstatechange`
- `animationkeyframechange`
- `animationexportprogress`

Avoid sending full state on every playback frame. Publish UI state only when the playhead, selection, transport state, or project structure changes.

The layout in [App.tsx](/Users/fredibach/Projects/slicewise/src/App.tsx) should change from one preview flex area to:

```text
Workspace
├── Top bar + mode switch
├── Preview viewport
└── Timeline, visible in Animation mode
```

On mobile, keep the preview usable, give the timeline a fixed minimum height, and let the keyframe rail scroll horizontally.

## 7. Undo, persistence, and snapshots

Use a separate `ParameterHistory<AnimationProject>` instance. The existing generic history implementation in [parameter-history.ts](/Users/fredibach/Projects/slicewise/src/lib/parameter-history.ts) can be reused.

Commit animation history for:

- Adding, deleting, duplicating, or moving a keyframe
- Editing a keyframe value
- Changing easing
- Changing duration, FPS, or export settings

Coalesce slider changes using the same delayed-commit pattern as Config mode.

First-release persistence recommendation:

- Keep the current animation project when switching modes.
- Autosave it as a versioned local IndexedDB project.
- Associate it with a stable local project ID, not merely the source filename.
- Do not include animation data inside ordinary parameter snapshots initially.
- Add explicit “Save animation preset/project” only after migrations and source association are settled.

## 8. Implementation phases

### Phase 1 — Contracts and registry

- Centralize morphable parameter descriptors.
- Make Morph use that registry.
- Remove any false morph affordances.
- Extract interpolation primitives from the contour-engine Morph loop where practical.
- Add registry exhaustiveness and uniqueness tests.

### Phase 2 — Pure animation core

- Add project, keyframe, easing, evaluation, migration, and validation modules.
- Add timeline editing operations.
- Reuse `ParameterHistory` for animation undo/redo.
- Test determinism, endpoint accuracy, duplicate times, rounding, seeds, colours, and snapshot isolation.

### Phase 3 — Explicit render snapshots

- Refactor the scheduler to accept derived settings and history policy.
- Ensure animation frames force `morphEnabled`, `morphSecondEnabled`, and target maps off.
- Preserve stale-response protection by render purpose and request ID.
- Test that playback cannot alter Config state or export freshness.

### Phase 4 — Mode and timeline UI

- Add the main mode switch.
- Add locked/editable/interpolated control states.
- Add timeline, selection, dragging, transport, timecode, easing, and keyboard support.
- Add responsive styling and accessibility tests.

### Phase 5 — Playback

- Add clock-driven play/pause, looping, frame stepping, scrubbing, and exact settle renders.
- Coalesce quick requests and tolerate dropped preview frames.
- Manually exercise expensive meshes and visibility modes.

### Phase 6 — Video export

- Add exact sequential frame rendering.
- Rasterize SVG to a fixed canvas.
- Add WebCodecs feature detection, encoding, muxing, progress, and cancellation.
- Verify first/last frame, frame count, dimensions, timestamps, filename, MIME type, and cleanup.

### Phase 7 — Persistence and documentation

- Add versioned local animation storage and migrations.
- Update [ARCHITECTURE.md](/Users/fredibach/Projects/slicewise/docs/ARCHITECTURE.md), [PARAMETERS.md](/Users/fredibach/Projects/slicewise/docs/PARAMETERS.md), and [TESTING.md](/Users/fredibach/Projects/slicewise/docs/TESTING.md).
- Add a focused `docs/ANIMATION.md` documenting the model, interpolation contract, and export pipeline.

## 9. Definition of done

The first release is complete when:

- Switching modes never loses or mutates the static configuration.
- Only registered morphable values can change in Animation mode.
- A keyframe can be added, selected, edited, moved, duplicated, and deleted.
- Scrubbing always produces the same settings for the same time.
- Preview playback remains time-correct even when frames are dropped.
- Pausing settles on an exact render.
- Undo/redo is scoped correctly by mode.
- Export renders every frame exactly and produces a playable local video.
- Cancellation leaves the app usable and releases encoder resources.
- Animation works without network access or uploading source content.
- Existing SVG/G-code, snapshots, Morph, worker, and history tests remain green.
