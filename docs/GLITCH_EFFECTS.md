# Vector glitch effect catalog

This catalog collects glitch post-processing effects that can be expressed as deterministic 2D
polyline transformations. Every effect below can therefore produce the same visible geometry in SVG
and plotter G-code without raster filters, opacity tricks, filled noise textures, or blend modes.

## Plotter-safe design rules

A glitch effect should operate on finished centreline runs and should:

- emit only finite, open or closed polylines;
- split lines exactly where they cross effect-region boundaries;
- preserve geometry outside its selected regions unless the effect explicitly removes it;
- clip transformed output to the artboard and active generative mask;
- reject fragments shorter than a small physical threshold rather than creating pen taps;
- use millimetres or artboard-relative percentages so the result is independent of preview pixels;
- derive all variation from a stable integer seed and stable geometry identifiers;
- cap the number of regions and emitted nodes so dense contour sets remain interactive;
- apply the same transformed runs to SVG and G-code exports.

SVG-only filters, alpha-channel displacement, blur, blend modes, and photographic compression
artifacts are outside the scope of this catalog.

## Catalog

Complexity describes the expected geometry implementation effort, not the visual intensity.

| Effect                         | Vector construction                                                                                                                                                                                            | Useful controls                                                                   | Plotter character                                                     | Complexity  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------- |
| **Block displacement**         | Clip all runs against a rectangle, remove the inside fragments from their original position, translate them, and merge them back with the outside fragments. Optionally clear the destination rectangle first. | Block count, width, height, X/Y shift, direction bias, seed, destination clearing | The canonical cut-and-shift glitch; sharp seams and real blank cuts   | Medium      |
| **Scan-band displacement**     | Partition the sheet into thin horizontal or vertical bands and translate the geometry clipped to selected bands.                                                                                               | Orientation, band count, thickness, shift, selection density, seed                | Familiar video-sync tearing with few extra pen lifts                  | Medium      |
| **Staggered slices**           | Divide one region into adjacent strips and apply a ramp, alternating, or seeded translation to each strip.                                                                                                     | Region, strip width, maximum shift, pattern, seed                                 | A structured stepped fracture; highly legible on contours             | Medium      |
| **Wraparound tear**            | Shift geometry inside a full-width or full-height band and wrap the overflow to the opposite edge of that band.                                                                                                | Orientation, band position/size, shift                                            | Analog horizontal-hold failure without losing displaced marks         | Medium      |
| **Block scatter**              | Generate several non-overlapping rectangles and apply an independent translation to each clipped fragment set.                                                                                                 | Count, size range, displacement range, axis bias, seed                            | More chaotic version of block displacement                            | Medium–high |
| **Tile shuffle**               | Partition a bounded region into a grid, then permute clipped tile contents among cells of equal size.                                                                                                          | Rows, columns, affected fraction, region, seed                                    | Strong digital corruption; preserves all selected geometry            | High        |
| **Block rotate / flip**        | Clip a rectangular patch and rotate it by 90° increments or mirror it about the patch centre.                                                                                                                  | Count, size, transform choices, seed                                              | Pixel-block error translated into crisp vector geometry               | Medium      |
| **Patch echo**                 | Copy rather than remove geometry clipped from a rectangle, then translate one or more duplicates.                                                                                                              | Region, copies, step X/Y, falloff or pen group                                    | Registration ghosts and repeated fragments; increases ink and runtime | Low–medium  |
| **Neighbour patch**            | Replace a rectangular patch with a translated copy sampled from an adjacent source rectangle.                                                                                                                  | Patch size, sample offset, count, seed                                            | Datamosh-like borrowed detail without requiring animation frames      | Medium      |
| **Dropout block**              | Remove all geometry inside one or more rectangles. An optional single-line border can expose the missing area.                                                                                                 | Count, size range, border, seed                                                   | Clean data-loss voids; reduces ink                                    | Low         |
| **Scanline dropout**           | Remove selected thin horizontal or vertical bands.                                                                                                                                                             | Orientation, spacing, thickness, irregularity, seed                               | Fax/scanner dropout with predictable pen lifts                        | Low         |
| **Segment dropout**            | Measure distance along each run and remove deterministic intervals rather than using SVG dashes.                                                                                                               | Gap rate, gap length range, clustering, seed                                      | Broken transmission lines that remain genuine G-code gaps             | Medium      |
| **Burst cut**                  | Remove short intervals where runs cross rays emitted from a seeded point or edge.                                                                                                                              | Origin, ray count, angular spread, cut width, seed                                | Radial signal failure; useful with circular forms                     | Medium      |
| **Misregistration**            | Duplicate selected geometry into separate pen groups with small physical translations or rotations. Unlike the existing chromatic SVG effect, every copy is a real toolpath.                                   | Copy count, offset, rotation, colours, selection scope                            | Multi-pen print-registration error                                    | Low–medium  |
| **Contour desynchronization**  | Translate or rotate whole runs selected by contour index or stable hash.                                                                                                                                       | Selection rate, offset range, rotation range, seed                                | Layers slip out of alignment while individual contours stay intact    | Low         |
| **Alternating contour offset** | Offset alternating contour groups in opposing directions, optionally in periodic blocks.                                                                                                                       | Period, duty cycle, X/Y amount, phase                                             | Rhythmic signal separation with few new path fragments                | Low         |
| **Local shear**                | Clip a patch or band and apply an affine shear around its centre.                                                                                                                                              | Region, shear X/Y, seed                                                           | Slanted digital smear while keeping straight segments straight        | Medium      |
| **Band stretch / squash**      | Clip a band, scale it on one axis around the band centre, and optionally leave a source gap.                                                                                                                   | Orientation, band, scale, anchor                                                  | Time-base expansion or compression                                    | Medium      |
| **Coordinate quantization**    | Snap resampled vertices to an X/Y grid, then remove consecutive duplicates.                                                                                                                                    | Grid X/Y, mix, region                                                             | Vector “bit depth” reduction; blocky stair steps                      | Low–medium  |
| **Sample-and-hold**            | Resample a run by arc length and hold either X or Y for a configurable number of samples.                                                                                                                      | Axis, sample spacing, hold length, mix                                            | Oscilloscope/digital stair-stepping                                   | Medium      |
| **Band jitter**                | Split geometry into narrow bands and add small seeded offsets, usually along the band axis.                                                                                                                    | Orientation, spacing, jitter, correlation, seed                                   | Fine CRT/fax instability; can range from subtle to dense              | Medium      |
| **Periodic phase slip**        | Apply a sine, triangle, or square-wave displacement to points, with abrupt phase jumps at selected positions.                                                                                                  | Axis, amplitude, wavelength, jump count, seed                                     | Signal-wave corruption with visible discontinuities                   | Medium      |
| **Splice mismatch**            | Cut selected runs at two nearby distances and reconnect the opposing ends with an offset or crossed connector.                                                                                                 | Cut rate, separation, offset, connector mode, seed                                | Cable-splice or decoding error; new connectors are plotter-visible    | High        |
| **Endpoint drag**              | Cut runs and extend the new endpoints in a common direction with straight or decaying trails.                                                                                                                  | Cut rate, trail length, direction, decay steps, seed                              | Directional data smear without raster blur                            | Medium      |
| **Barcode substitution**       | Replace geometry inside a block with parallel line segments whose density is derived from the removed geometry.                                                                                                | Region, line angle, pitch, density mapping, seed                                  | A plotted digital-code scar; intentionally changes content            | Medium–high |
| **Density sort strips**        | Measure path length/density per strip, reorder equal-sized strip contents by that value, and translate each into its new slot.                                                                                 | Orientation, strip count, sort direction, region                                  | Vector analogue of pixel sorting                                      | High        |

## Recommended first effect: Block displacement

Implementation status: available in Slicewise as **Block glitch**.

Block displacement is the best first addition because it matches the initial cut-and-move concept,
has an immediately recognizable result, and establishes reusable rectangle clipping and deterministic
region-selection machinery for many later effects.

Suggested first-release controls:

| Control           | Suggested default |            Suggested range | Purpose                                               |
| ----------------- | ----------------: | -------------------------: | ----------------------------------------------------- |
| Glitch            |               Off |                    Boolean | Enables the geometry effect.                          |
| Blocks            |                 3 |                       1–24 | Number of independent displaced rectangles.           |
| Block width       |               18% |                      2–60% | Width relative to the drawable artboard.              |
| Block height      |                6% |                      1–40% | Height relative to the drawable artboard.             |
| Displacement      |              8 mm |                  0.5–60 mm | Maximum translation magnitude.                        |
| Direction         |        Horizontal | Horizontal, vertical, both | Constrains the displacement vector.                   |
| Clear destination |               Off |                    Boolean | Removes original geometry beneath the moved fragment. |
| Seed              |                 1 |                    Integer | Reproduces rectangle placement and movement.          |

The default should favor short, wide rectangles and horizontal movement: it reads as a glitch at low
intensity while avoiding the visual similarity between square patches and the existing Vector zoom
effect. Blocks should be allowed to overlap in a defined order; applying them sequentially creates a
useful cascading corruption, while applying every block to the same immutable source creates a more
controlled result. The controlled, immutable-source interpretation is preferable for the first
version because changing the block count will not repeatedly transform earlier fragments.

### Proposed geometry contract

For each generated rectangle:

1. Clip every source run into inside and outside fragments.
2. Keep the outside fragments at their original coordinates.
3. Translate each inside fragment by the block displacement vector.
4. If destination clearing is enabled, clip current outside geometry against the translated rectangle.
5. Clip translated fragments to the artboard and active mask.
6. Drop degenerate and physically tiny fragments.

The rectangle itself is a processing region, not a plotted outline. A future “show seams” option could
add selected rectangle edges as explicit centreline geometry, but it should not be part of the MVP.

## Suggested implementation sequence

1. **Block displacement** — establishes region clipping, transforms, stable seeded placement, and
   SVG/G-code parity.
2. **Scan-band displacement and dropout** — reuse the rectangle splitter with regular bands.
3. **Patch echo and misregistration** — reuse clipped fragments and pen-group duplication.
4. **Block rotate/flip and local shear** — add affine transforms around region centres.
5. **Tile shuffle and density sort strips** — build on the same primitives once output-size and
   interaction costs are measured.

Block displacement should run after Humanizer and Yarn geometry, and before Kaleidoscope, artboard and
generative-mask clipping, and Vector zoom. That placement lets a displaced fragment participate in
the existing downstream composition rules and keeps the glitch consistent across mesh contours,
imported SVG centrelines, and hyperbolic line art.
