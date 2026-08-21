# Slicewise parameter reference

This document describes the user-facing parameters in Slicewise as implemented in `src/App.jsx` and `src/lib/slicer.js`. Ranges are the limits enforced by the interface. Unless noted otherwise, changing a parameter redraws the preview and affects both SVG and G-code output.

## Source model

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Demo (`demo`) | Select; **Torus knot** | Loads one of the built-in meshes: Torus knot, Ripple sphere, Rounded cube, Soft diamond, Ring torus, Twisted bloom, Hourglass, or Tetrapod. Selecting an uploaded file changes this internally to **Uploaded model**. |
| Model file (`file`) | File; none | Imports an STL (binary or ASCII), OBJ, PLY (binary or ASCII), or filled SVG. OBJ and PLY files initially use Y-up; STL, SVG, and demos initially use Z-up. Processing stays in the browser. SVG strokes must be converted to filled outlines before import. |
| Extrusion (`svgDepth`) | Number; **12%**; 0.5–100, step 0.1 | For an imported SVG, sets extrusion depth as a percentage of the artwork's largest 2D span. This control is hidden for other model types. |
| Round extruded edges (`svgRounded`) | Boolean; **off** | Adds a bevel to the front, back, and sides of an imported SVG extrusion. |
| Roundness (`svgRoundness`) | Number; **25%**; 0–100, step 0.5 | Sets the SVG bevel size relative to the largest safe radius (the smaller of half the extrusion depth and 25% of the SVG span). Enabled only when **Round extruded edges** is on. |
| Model up axis (`upZ` / `upY`) | Choice; **Z up** | Declares whether the source model uses Z or Y as its vertical axis. Y-up input is rotated into Slicewise's internal Z-up coordinate system. |

Imported meshes are welded, centred on their bounding-box midpoint, and uniformly normalized to a bounding-sphere radius of 1. Original model units therefore do not determine output size; artboard, margin, scale, and offsets do.

## Morph

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Enable morph instances (`morphEnabled`) | Boolean; **off** | Generates multiple overlaid contour instances by interpolating selected parameters from their base values to morph targets. At least one parameter must have an active morph target. |
| X steps (`morphSteps`) | Integer; **4**; 2–24 | Number of evenly spaced instances along the X morph dimension, including the base and target endpoints. Used only when an X target exists. |
| Add Y dimension (`morphSecondEnabled`) | Boolean; **off** | Enables a second, independent target per morphable parameter. X and Y interpolation combine into a matrix of overlaid variations. Turning this off clears Y targets. |
| Y steps (`morphStepsY`) | Integer; **4**; 2–24 | Number of evenly spaced instances along the Y morph dimension, including endpoints. Used only when a Y target exists. Total instances are X steps × Y steps when both dimensions have targets. |
| Per-parameter morph target | Number or colour | The arrow beside a morphable control cycles through no target, X target, and—when Y is enabled—X + Y targets. Numeric values interpolate linearly; ink colour interpolates per RGB channel. Each generated instance is placed on the same artboard rather than in a tiled layout. |

Morphable parameters are: Azimuth, Elevation, Roll, Scale, Offset X/Y, Distortion, Line count, Curve quality, Ease strength/cycles/centre, custom slice Azimuth/Elevation, Stroke, Ink colour, Pen colours, Margin, Dot spacing, Contrast, Depth cycles, and RGB split. Source-extrusion, artboard-dimension, morph-step, and G-code parameters are not morphable.

## View

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Azimuth (`az`) | Number; **35°**; −180–180, step 1 | Rotates the camera around the model's Z axis. |
| Elevation (`el`) | Number; **24°**; −180–180, step 1 | Rotates the camera above/below and through the model. The full range permits an inverted view. |
| Roll (`rl`, state key `roll`) | Number; **0°**; −180–180, step 1 | Rotates the projected view around the camera's viewing direction. |
| Scale (`zoom`) | Number; **1×**; 0.2–3, step 0.01 | Multiplies the model's fitted projection size. The initial 1× fit uses the smaller artboard dimension minus the margin. |
| Offset X (`panX`) | Number; **0 mm**; −2000–2000, step 0.1 | Moves the projected model horizontally from the artboard centre. Positive values move it right. |
| Offset Y (`panY`) | Number; **0 mm**; −2000–2000, step 0.1 | Moves the projected model vertically from the artboard centre. Positive values move it down in SVG/artboard coordinates. |
| Camera lens (`lens`) | Select; **50 mm · clean** | Chooses radial projection distortion: `clean` (none), `wide` (barrel), `fisheye` (stronger barrel), or `tele` (pincushion). These are visual presets, not a physical perspective camera simulation. |
| Distortion (`lensAmount`) | Number; **100%**; 0–200, step 1 | Scales the selected lens distortion. Disabled for the clean lens. At 0%, a non-clean lens also has no distortion. |

Canvas gestures provide equivalent controls: drag to change azimuth/elevation, Shift-drag to roll, Space-drag to offset, and use the mouse wheel to scale. Double-click resets Scale and both offsets, but leaves orientation unchanged.

## Contours

### Density and finish

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Line count (`lines`) | Integer; **40**; 1–200 | Sets the number of slice levels. In spiral mode it sets the number of turns in the helicoidal slicing field. Higher values increase density and render cost. |
| Curve quality (`quality`) | Integer; **7**; 1–10 | Controls curved interpolation and path simplification. A higher value more strongly follows mesh vertex normals, uses a tighter simplification tolerance, and emits more detailed paths. At 1, contour spans remain straight. |

### Line spacing

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Gap easing (`gapEase`) | Select; **Linear** | Redistributes slice levels through the selected scalar range. Options are Linear plus Sine, Quadratic, and Cubic variants: In, Out, In & Out, and Out & In. It changes spacing, not the requested line count. |
| Ease strength (`easeStrength`) | Number; **100%**; 0–300, step 1 | Blends/applies the easing curve. 0% produces linear spacing, 100% applies it once, 200% twice, and 300% three times; intermediate values blend toward the next application. |
| Ease cycles (`easeCycles`) | Integer; **1**; 1–12 | Repeats the easing pattern this many times across the model's slice range. |
| Ease centre (`easeCenter`) | Number; **50%**; 5–95, step 1 | Sets the pivot between the two halves of **In & Out** or **Out & In** curves. It is disabled for Linear and one-direction curves. |

### Slice plane

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Slice axis (`axis`) | Select; **Height · topographic** | Chooses the scalar field intersected by the contours: model Z height (`up`), camera depth (`cam`), model X width (`x`), model Y depth (`y`), or a direction defined by a custom plane angle (`custom`). |
| Custom azimuth (`cutAz`) | Number; **0°**; −180–180, step 1 | Sets the horizontal direction of the custom slicing normal. Editing it automatically selects **Custom plane angle**. |
| Custom elevation (`cutEl`) | Number; **90°**; −90–90, step 1 | Sets the vertical angle of the custom slicing normal. 90° is equivalent to the topographic Z direction. Editing it automatically selects **Custom plane angle**. |

### Path construction

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Continuous spiral (`spiral`) | Boolean; **off** | Replaces independent parallel slice levels with a helicoidal field intended to join contours into longer, pen-down spiral paths. Singularities where the winding axis pierces the mesh remain boundaries. |
| Remove hidden lines (`hide`) | Boolean; **on** | Uses a depth buffer to remove contour and silhouette sections occluded from the current camera view. Turning it off is faster and shows paths through the model. |
| Add outer silhouette (`sil`) | Boolean; **on** | Adds projected mesh boundary and front/back-facing transition edges in the ink colour. Hidden-line removal also applies to the silhouette when enabled. |

## Output

### Line style and colour

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Stroke (`sw`) | Number; **0.35 mm**; 0.05–2, step 0.05 | Sets SVG stroke width. It also influences the minimum dash and gap sizes produced by the halftone effect. G-code follows path centre-lines, so this value does not change physical pen width. |
| Ink colour (`color`) | Colour; **#15181a** | Sets the contour and silhouette colour when a gradient or chromatic effect does not replace it. Accepts a colour-picker value or a valid 3/6-digit hex entry; stored/exported values are normally six-digit hex. |
| Background colour (`backgroundColor`) | Colour; **#ffffff** | Sets the preview sheet colour and the exported background rectangle when **Include sheet background** is enabled. Chromatic aberration exports a black background instead. |
| Use colour gradient (`gradientEnabled`) | Boolean; **off** | Colours contours by normalized slice position. Enabling it disables chromatic aberration; it may be combined with halftone. G-code groups the sampled colours as separate pen/tool groups. |
| Gradient preset | Choice; **Rainbow** | Replaces all gradient stops with Rainbow, Sunset, Ocean, Earth, or Mono. Editing a stop clears the active preset label without changing the result. |
| Gradient stop colour | Colour; preset-dependent | Sets a stop's six-digit hex colour. |
| Gradient stop position | Integer percent; **0–100**, step 1 | Places a stop along normalized slice depth/height. Stops are kept sorted. There must be at least two stops; **Add colour stop** inserts a copy of the preceding colour at the midpoint of the widest gap. |
| Pen colours (`gradientColors`) | Integer; **6**; 2–24 | Samples the continuous gradient into this many discrete colours, producing separate plotter-ready path groups. |

The default Rainbow stops are red at 0%, amber at 20%, lime at 40%, cyan at 60%, blue at 80%, and violet at 100%.

### Artboard

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Paper size (`paperPreset`) | Select; **Custom** | Sets width × height to A6, A5, A4, A3, A2, A1, A0, Letter, Legal, or Tabloid in portrait orientation. Direct dimension edits switch the selector to Custom unless they exactly match a preset. |
| Width (`pw`) | Number; **210 mm**; 10–2000, step 1 | Sets the SVG/G-code sheet width and the projection coordinate system. |
| Height (`ph`) | Number; **210 mm**; 10–2000, step 1 | Sets the SVG/G-code sheet height and the projection coordinate system. |
| Margin (`margin`) | Number; **14 mm**; 0–40, step 1 | Insets the 1× projection fit from the artboard edge. It affects model scale, not clipping; scale and offsets can still place paths beyond the artboard. |
| Include sheet background (`bg`) | Boolean; **on** | Adds a full-size background-colour rectangle to SVG output, so randomized ink/background pairs are preserved by default. It has no drawing toolpath in G-code. Chromatic aberration always emits a black SVG background. |

Paper presets are A6 105×148, A5 148×210, A4 210×297, A3 297×420, A2 420×594, A1 594×841, A0 841×1189, Letter 216×279, Legal 216×356, and Tabloid 279×432 mm.

### Post-processing

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| Halftone stroke (`halftone`) | Boolean; **off** | Divides contours into 12 tone bands based on a repeating depth function and applies band-dependent SVG dash patterns. Enabling it disables chromatic aberration. G-code exports these as continuous paths because SVG dash styling is not converted into segmented toolpaths. |
| Dot spacing (`halftoneSize`) | Number; **2.4 mm**; 0.5–8, step 0.1 | Sets the approximate period (dash plus gap) of the halftone stroke pattern. Enabled only with halftone. |
| Contrast (`halftoneContrast`) | Number; **75%**; 0–100, step 1 | Controls how much dash-to-gap ratio varies among tone bands. At 0%, bands approach an even ratio; higher values make light/dark differences stronger. |
| Depth cycles (`halftoneCycles`) | Integer; **2**; 1–8 | Repeats the halftone tone wave this many times across normalized slice depth. |
| Chromatic aberration (`chroma`) | Boolean; **off** | Draws the same contour geometry as red, green, and blue SVG layers with small opposing translations/rotations and screen blending on black. Enabling it disables both halftone and the colour gradient. G-code exports one unsplit base contour set. |
| RGB split (`chromaAmount`) | Number; **1.5 mm**; 0.1–6, step 0.1 | Sets the horizontal red/blue separation and proportionally controls their small opposing rotations; green receives a small vertical shift. Enabled only with chromatic aberration. |
| Humanizer (`humanizer`) | Boolean; **off** | Gives contours a hand-drawn character by applying deterministic, low-frequency variations along each path. The altered geometry is included in both SVG and G-code exports. |
| Human touch (`humanizerAmount`) | Number; **30%**; 0–100, step 1 | Controls the strength and density of Humanizer's deviations. The default stays subtle; higher values create more obvious imprecision. Enabled only with Humanizer. |

## Export

| Parameter (ID) | Type and default | What it does |
|---|---|---|
| File type (`exportFormat`) | Select; **SVG · vector** | Chooses SVG or plotter G-code for download and clipboard copy. |
| Machine (`gcodeProfile`) | Select; **UUNA TEK 3.0 · A3** | Applies a complete set of G-code speed, Z-height, and origin defaults. **UUNA TEK 3.0** uses a rear-left sheet origin; **Generic Z-axis plotter** uses bottom-left. Choosing a profile overwrites all five G-code values below. |
| Draw speed (`drawFeed`) | Number; **3000 mm/min**; 50–12000, step 50 | Feed rate for XY moves while the pen is down. Generic profile default: 1200. |
| Travel speed (`travelFeed`) | Number; **6000 mm/min**; 50–15000, step 50 | Feed rate for pen-up XY travel. Generic profile default: 3000. |
| Pen up Z (`penUp`) | Number; **0 mm**; −20–50, step 0.1 | Absolute Z position used to lift the pen. Generic profile default: 5. |
| Pen down Z (`penDown`) | Number; **−3 mm**; −20–50, step 0.1 | Absolute Z position used to lower the pen. Generic profile default: 0. |
| Z speed (`zFeed`) | Number; **2000 mm/min**; 10–12000, step 10 | Feed rate for pen-up and pen-down Z moves. Generic profile default: 600. |

G-code uses millimetres, absolute positioning, and feed-per-minute mode (`G21`, `G90`, `G94`). Runs are reordered and may be reversed to reduce travel from the current position. Separate colour groups pause with `M0` for a pen change. Every file begins with the pen-up command and ends by returning to X0 Y0, then issuing `M2`. Verify the selected origin, Z heights, and speeds on the target plotter before running a file.

## Randomization, locking, and history

- **Randomize parameters** changes creative view, contour, colour, and effect settings within curated subranges. It deliberately keeps the loaded source and physical sheet dimensions stable. Its ranges can be narrower than the manual control ranges.
- An open-lock button means the parameter participates in randomization. Clicking it shows a closed lock and excludes the base value—and any active morph target for that parameter—from later randomization.
- **Lock all** and **Unlock all** temporarily set every randomization lock at once. Click the active bulk button again to restore the previous individual lock set. Changing an individual lock ends that temporary bulk state; the next bulk action starts from the newly edited set.
- Randomization locks are available for morphable numeric/colour controls, Background colour, Camera lens, Gap easing, Slice axis, Continuous spiral, Remove hidden lines, Add outer silhouette, Use colour gradient, Halftone stroke, and Chromatic aberration.
- **Undo** and **Redo** keep up to 100 snapshots of render parameters. Source selection, SVG extrusion, model up axis, paper preset as a label, export format/profile, and G-code-only values are not part of those snapshots.

## Display-only statistics

These are outputs rather than parameters:

| Readout | Meaning |
|---|---|
| Paths | Number of emitted SVG paths after effects; chromatic aberration triples the displayed count. |
| Nodes | Number of simplified path nodes after effects; chromatic aberration triples the displayed count. |
| File | Estimated size of the currently selected SVG or generated G-code. |
| Render | Time spent computing the most recently applied contour result. |
