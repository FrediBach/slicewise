The right model is “expressive 3-axis plotting with a fixed angled tool,” not a fourth motorized angle axis.

## Implementation status

Phases 1–4 are implemented in the application, except for the hardware-gated 3×3 height map:

- machine profiles declare coordinated-XYZ and fixed-angle-holder capabilities;
- export state has a structured, disabled-by-default UUNA expressive-motion configuration;
- UUNA export exposes an opt-in master control and constant Contact Z;
- a pure machine-operation model builds constant-contact 3D strokes;
- the serializer emits coordinated XYZ only when both the UUNA capability and opt-in are active;
- preflight validates the coordinated command subset and reports its Z range;
- disabled and Generic output stay on the existing binary-Z path.
- tapered mode resamples final strokes at a bounded arc-length step and applies smooth lead-in and lead-out pressure ramps;
- fixed pen angle and canvas-relative tilt direction are recorded as physical setup metadata;
- pressure displacement receives XY tip-offset compensation relative to Contact Z, including auto-rotation of the tilt direction;
- preflight reports pressure and Z slope and renders low, medium, and high pressure separately;
- a preflight-validated calibration download contains a contact ladder, angle crosses, and taper fan;
- direct serial confirmation calls out the physical angle, machine direction, Z range, compensation state, and calibration requirement.
- three-point machine-coordinate paper planes correct contact and pressure Z independently;
- pen-up clearance follows the highest point of the fitted surface;
- full-bed three-point patterns and browser-local per-machine plane presets support calibration.

Hardware characterization remains open. Until coordinated motion is confirmed on target firmware, expressive motion remains calibration-required output. Broad-nib preview, spacing checks, and surface-plane compensation must be confirmed with the physical tool. The optional 3×3 map remains deferred until its measurement workflow is physically validated.

UUNA TEK 3.0 has stepper-driven X, Y, and Z axes, while its advertised 0–90° pen angle appears to be a manually adjusted holder setting. I found no evidence that pen angle can be changed through G-code. The angle still matters computationally: changing Z with a tilted pen shifts the physical tip in X/Y, affects pressure, and changes broad-nib or brush behavior. [UUNA TEK specifications](https://uunatek.com/products/uuna-tek-3-0-a2-size-pen-plotter-drawing-robot-drawing-machine-writing-machine), [official G-code guide](https://uunatek.com/blogs/tips-and-tricks/beginner-s-guide-to-g-code-for-uuna-tek-3-0-pen-plotter-step-by-step-tutorial).

I’d use the following plan.

## 1. Product shape

Add an opt-in subsection inside G-code export:

> Expressive 3-axis motion  
> Use continuous Z pressure and compensate for an angled pen. UUNA TEK only.

Behavior:

- Show it only when a UUNA TEK profile is selected.
- Default it to off for every user and every existing project.
- With it off, generated G-code must remain byte-for-byte equivalent to current output.
- Selecting Generic Z-axis plotter hides and disables it.
- Switching profiles should preserve entered settings in memory, but not apply them unless a UUNA profile and the master toggle are both active.
- Do not silently enable it when restoring old parameter snapshots.

The existing binary `penUp`/`penDown` controls remain the basic mode. Advanced mode progressively reveals the additional controls.

## 2. Separate physical setup from artistic behavior

These are different concerns and should be presented separately.

### Physical pen setup

- Pen angle: 0–90°, explicitly defined as “angle above the paper.”
  - 90° means vertical.
  - Near 0° should be rejected because tip-offset compensation becomes unbounded.
- Tilt direction: 0–359°, shown visually as an arrow on the artboard.
- Pen-up Z.
- Contact Z: the point at which the tip first touches the paper.
- Maximum press depth: additional safe downward travel after contact.
- Z feed.
- Optional nib width, used for preview and calibration guidance.
- Tip-offset compensation: on by default when the angle is not 90°.
- Preserve stroke direction: on by default for asymmetric strokes.

The UI needs a small diagram; angle conventions are too easy to misunderstand in prose.

### Expressive Z behavior

Start with four modes:

1. Constant contact  
   Current plotting behavior, but represented by the new 3D pipeline. Useful for testing and angle compensation.

2. Tapered strokes  
   Z eases from contact to selected pressure over a configurable lead-in distance, remains down, then eases out. This gives brush, felt, and flexible nibs more natural starts and endings.

3. Pressure modulation  
   Modulate Z along path length with controllable depth, wavelength, phase, and easing. Useful for dashed-pressure textures, ink variation, and engraving-like effects without lifting completely.

4. Curvature response  
   Reduce pressure around tight turns and increase it on straighter spans. This should help prevent brush bunching, paper damage, and visible corner dwell.

Later modes can include contour-index/depth mapping and user-authored pressure curves, but they require richer toolpath metadata and should not block the first release.

## 3. Define one explicit 3D toolpath model

Today, `ContourToolpathGroup` and `gcode.ts` effectively carry only 2D polylines. Z is inserted as a binary pen-state command during serialization.

Introduce a DOM-free intermediate representation, for example:

```ts
type MachinePoint = {
  x: number;
  y: number;
  z: number;
  pressure: number; // normalized 0–1, useful for preview and diagnostics
};

type MachineStroke = {
  points: MachinePoint[];
  sourceRun: number;
  reversed: boolean;
};

type MachineOperation =
  | { kind: 'travel'; points: MachinePoint[] }
  | { kind: 'stroke'; stroke: MachineStroke }
  | { kind: 'pen-change'; color: string };
```

Pipeline:

```text
2D final toolpaths
  → clipping/layout rotation
  → travel ordering and run orientation
  → bounded resampling
  → pressure profile
  → paper-height correction
  → angled-tip compensation
  → 3D machine operations
  → G-code serialization
  → independent validation
```

This belongs in a new pure module such as `src/lib/gcode-3d-toolpaths.ts`. Keep `gcode.ts` primarily concerned with serialization.

## 4. Continuous Z generation

Resample each final 2D run by arc length before assigning Z. A configurable internal step around 0.5–1 mm is a sensible starting point, with adaptive subdivision where pressure changes rapidly or curvature is high.

For every resampled point:

```text
machine Z =
  contact Z
  + paper-height correction
  - pressure × maximum press depth
```

Use positive “press depth” in the UI even though UUNA’s current coordinate convention moves down toward negative Z. That is easier for users to reason about.

Pressure curves should use smooth easing with zero slope at joins. Abrupt Z changes can mark the paper or lose steps.

Every stroke must still have an explicit safe sequence:

1. Confirm pen at safe Z.
2. Travel to compensated start position.
3. Lower to contact Z.
4. Apply the lead-in pressure ramp.
5. Draw coordinated `G1 X… Y… Z… F…` moves.
6. Apply the lead-out ramp.
7. Raise to pen-up Z.
8. Only then use rapid travel.

No expressive mode should replace the explicit final lift.

## 5. Angled-tip compensation

When a tilted holder moves vertically, its tip does not remain at the same X/Y position. The horizontal shift depends on Z displacement and the pen angle.

Using angle `α` above the paper:

```text
horizontal tip shift = vertical displacement / tan(α)
```

Resolve that shift along the configured tilt direction, then move the carriage oppositely so the tip follows the intended artwork.

Important details:

- Apply compensation after pressure and paper-height Z have been resolved.
- Define a reference Z—normally contact Z—where XY compensation is zero.
- Clamp the accepted angle to a safe minimum determined during calibration.
- Preflight the compensated carriage path, not only the intended tip path.
- If compensation sends the carriage outside the working area, block export and report the required margin.
- Include an option to disable compensation for holders whose mechanical linkage already corrects the offset.
- Auto-rotation must rotate both artwork and pen tilt direction consistently.

This is the first genuinely useful pen-angle feature; merely recording the angle in comments would not be sufficient.

## 6. Broad-nib and brush-aware handling

A fixed pen angle can also inform stroke planning:

- Show a simulated stroke footprint using nib width, tilt direction, path tangent, and pressure.
- Warn when tightly spaced contours are likely to merge at the selected nib width.
- Optionally favor path directions that create consistent calligraphic entries.
- Preserve run direction when asymmetric lead-in/lead-out settings are active.
- When reversal is allowed, apply the pressure profile after the optimizer chooses the final orientation.
- Keep “join tolerance” conservative: a pen-down join made at high pressure may be much more visible than today’s constant-Z bridge.

A later release could support “directional pressure,” where pressure depends on the angle between path tangent and nib orientation.

## 7. Paper-plane compensation

Three-axis motion makes surface compensation possible and is arguably the most practical advanced feature after tapered strokes.

First iteration:

- Let the user enter Z offsets at three calibration points.
- Fit a plane across the sheet.
- Add its interpolated correction to contact and drawing Z.
- Keep pen-up clearance relative to the highest corrected surface.
- Provide a downloadable calibration pattern and instructions.

Later:

- Add a 3×3 manual height grid with bilinear interpolation.
- Potentially support probe-derived maps if the machine/controller workflow can be verified.
- Never assume UUNA TEK has a usable probe input without hardware confirmation.

Height correction and artistic pressure must remain separate layers so users can flatten the bed without changing the visual pressure effect.

## 8. Profile and state changes

Extend `GCodeProfile` with capabilities rather than checking profile IDs throughout the code:

```ts
capabilities: {
  coordinatedXYZ: boolean;
  adjustableFixedPenAngle: boolean;
  zConvention: 'negative-down' | 'positive-up';
  safeAngleRange?: { min: number; max: number };
  zWorkingRange?: { min: number; max: number };
};
```

The UUNA profiles opt into coordinated XYZ and angled-tool configuration. Generic remains conservative until a future generic capability editor exists.

Add a structured state object rather than many unrelated top-level fields:

```ts
uunaExpressiveMotion: {
  enabled: false;
  penAngle: 90;
  tiltDirection: 0;
  tipCompensation: true;
  contactZ: -3;
  maximumPressDepth: 0;
  mode: 'constant';
  leadIn: 2;
  leadOut: 2;
  modulationDepth: 0;
  modulationPeriod: 20;
  curvatureRelief: 0;
  preserveStrokeDirection: true;
  surfaceCompensation: {
    mode: 'off';
  }
}
```

Add explicit migration defaults so old saved state is always safe. Export-only settings currently live in `slicer.ts`; if they should persist across sessions, that should be an intentional separate export-preset feature rather than silently adding them to creative render snapshots.

## 9. Serializer changes

Extend `GCodeOptions` with a discriminated motion mode:

```ts
motion:
  | { kind: 'binary-z'; penUp: number; penDown: number }
  | { kind: 'coordinated-xyz'; operations: MachineOperation[] };
```

For advanced mode:

- Emit coordinated `G1 X Y Z F` drawing moves.
- Keep lift/lower movements as Z-only `G1`.
- Keep rapid moves XY-only and safe-Z-only.
- Include setup comments covering:
  - physical pen angle;
  - tilt direction;
  - contact and maximum pressure Z;
  - compensation status;
  - surface-map status;
  - minimum and maximum emitted Z.
- Do not emit angle commands; the file should instead clearly instruct the operator to set the physical holder angle.

The existing binary serializer should remain intact to minimize regression risk.

## 10. Validator and preflight

`gcode-validation.ts` currently rejects mixed XY/Z movement and treats only exactly two Z values as known pen states. Advanced validation needs a profile-dependent state machine.

In coordinated mode, validate:

- XYZ moves are allowed only for a capable profile.
- All coordinates and feeds are finite.
- Z remains inside the configured/calibrated envelope.
- XY rapid motion happens only at safe Z.
- No pen change occurs below safe Z.
- Pressure changes do not exceed a maximum Z slope or per-segment delta.
- The compensated carriage path remains in bounds.
- The intended tip path remains in sheet bounds.
- The first motion starts raised and shutdown ends raised at X0/Y0.
- Contact is not crossed during nominal travel.
- Pen angle is within the calibrated safe range.
- Surface compensation cannot consume the configured lift clearance.

Update statistics to include:

- 3D drawing distance;
- minimum/maximum Z;
- maximum press depth;
- maximum Z slope;
- pressure-ramp count;
- compensated XY margin;
- estimated duration including coordinated motion.

The preview should add a pressure/Z colour gradient over drawing paths. Keep travel dashed. A legend could show light contact through maximum pressure, and warnings should identify the corresponding G-code line.

## 11. Direct serial safety

Direct sending should use the same serialized and validated artifact, as it does today.

The confirmation dialog should additionally state:

- Expressive 3-axis motion is enabled.
- Required physical pen angle and tilt direction.
- Z range the machine will execute.
- Whether tip and surface compensation are active.
- A recommendation to perform the calibration pattern and a pen-free dry run.

For the first release, I would label direct sending of expressive files “calibration required” until tested across at least A3 and one larger UUNA model or firmware revision.

## 12. Calibration workflow

Ship a small deterministic calibration generator with three tests:

1. Z contact ladder  
   Short lines at increasing press depth to establish contact and safe maximum pressure.

2. Angle-offset crosses  
   Repeated crosses at different Z values to measure whether theoretical tip compensation matches the actual holder.

3. Taper fan  
   Radial strokes with lead-in/out ramps to judge brush and broad-nib behavior in different directions.

Users can enter measured results into the export controls. Store these as local machine presets keyed by UUNA model—not in artwork snapshots.

## 13. Test plan

Closest-boundary tests should cover:

- `gcode-3d-toolpaths.test.ts`
  - deterministic resampling;
  - taper endpoints;
  - modulation continuity;
  - curvature response;
  - surface-plane interpolation;
  - angle compensation;
  - clockwise layout rotation of tilt direction;
  - no non-finite values near angle limits.

- `gcode.test.ts`
  - unchanged legacy output when disabled;
  - coordinated XYZ serialization;
  - safe operation order;
  - comments and precision.

- `gcode-validation.test.ts`
  - valid coordinated programs;
  - unsafe rapid at contact;
  - excess pressure;
  - excess Z slope;
  - compensated XY overflow;
  - invalid angle;
  - incomplete lift and unsafe shutdown.

- `slicer-export.test.ts`
  - UUNA-only activation;
  - Generic fallback;
  - legacy profile migration;
  - auto-rotation parity;
  - byte-identical basic mode.

- `OutputPanel.test.tsx`
  - advanced controls hidden by default;
  - revealed for UUNA plus opt-in;
  - unavailable for Generic;
  - accessible labels and correct defaults.

Also perform physical plots at 90°, a moderate tilt, and the minimum supported angle, using both rigid fineliners and flexible/broad tools.

## 14. Recommended delivery sequence

### Phase 0: Hardware characterization

Before implementation, verify on a real machine:

- whether coordinated `G1 X Y Z` is accepted;
- actual Z sign and useful travel;
- controller/firmware differences;
- physical definition of the advertised angle;
- whether angle adjustment has a fixed tilt direction;
- whether the theoretical tip-shift model matches the holder;
- safe Z speeds and pressure depths.

This should produce a checked-in hardware note and calibration G-code fixtures.

### Phase 1: Safe foundation

- Capability-based profiles.
- Structured advanced settings.
- New 3D operation model.
- Coordinated XYZ serializer.
- Advanced validator.
- Master opt-in UI.
- Constant-pressure mode with exact legacy parity when disabled.

### Phase 2: Useful first release

- Lead-in/out tapered strokes.
- Fixed pen-angle metadata.
- XY tip-offset compensation.
- Pressure/Z preview.
- Calibration patterns.
- Strong direct-send confirmation.

This is the smallest release that provides noticeable creative and mechanical value.

Status: implemented in software; physical characterization remains required.

### Phase 3: Expressive controls

- Arc-length pressure modulation.
- Curvature pressure relief.
- Stroke-direction policies.
- Broad-nib footprint preview and spacing warnings.

Status: implemented in software. Pressure modulation uses final-path arc length and smooth lead-in/out envelopes. Curvature relief responds to final-polyline turns. Direction preservation constrains travel optimization so asymmetric strokes are not reversed. The nib-width overlay and inter-run spacing warning are calibration guidance, not an exact model of flexible or anisotropic nib deformation.

### Phase 4: Surface compensation

- Three-point paper plane.
- Local machine calibration presets.
- Optional 3×3 height maps after physical validation.

Status: the three-point plane, safe surface-relative lift height, full-bed calibration pattern, and local per-machine presets are implemented. The 3×3 height map remains intentionally deferred until physical probing or measurement workflows are validated on target hardware.

The most important scope boundary is that Slicewise’s current final toolpaths are 2D and have lost most original 3D mesh provenance. The first version should therefore derive pressure from final path length, endpoints, and curvature. Mapping pressure to original mesh depth or contour scalar value should be a later feature that deliberately carries metadata through `contour-engine.ts`, rather than trying to reconstruct it during export.
