Yes. The strongest concept is: the Euclidean algorithm provides rhythmic structure, while the actual contour geometry determines rotation, melody, percussion, dynamics, probability, and expression.

## Proposed mode: Contour Sequencer

Add `Sequencer` beside Config and Animation. The existing contour controls remain editable while it plays, so orbiting the model, changing the slice field, or adjusting line spacing regenerates the musical phrase.

The ordered contour stack becomes a continuous “shape signal.” It is resampled onto a conventional grid—typically 16 steps—so the musical timing stays predictable even when the drawing contains anywhere from 1 to 200 contours.

### Default mapping

| Musical property | Contour-derived input                                  |
| ---------------- | ------------------------------------------------------ |
| Rhythm           | Euclidean `steps / pulses`                             |
| Rotation         | Automatically aligned with the strongest contour steps |
| Pitch            | Projected contour area, percentile-mapped into a scale |
| Velocity         | Total contour length                                   |
| Note length      | Closedness versus fragmentation                        |
| Accent           | Local peaks in contour complexity                      |
| Stereo position  | Projected X centroid, optionally                       |
| Play order       | Low-to-high slice order, reversible                    |

Each slice would expose a compact descriptor: normalized level, path count, total length, projected area, centroid, closedness, and angular roughness.

The important architectural detail is that these features must be collected while slice identity still exists. Currently, [contour-engine.ts](/Users/fredibach/Projects/slicewise/src/lib/contour-engine.ts:228) returns paths grouped by colour and line weight; by then the relationship between a path and its source slice has been flattened. Extraction should happen around `contourSlices()` in [contour-engine.ts](/Users/fredibach/Projects/slicewise/src/lib/contour-engine.ts:792), after projection and hidden-line filtering but before decorative output effects.

## Melodic and drum lanes

The sequencer project should contain an ordered array of independently configurable lanes. Every lane shares the Euclidean and contour-mapping controls, then uses a discriminated lane type for its musical output:

### Melodic lane

A melodic lane emits pitched notes through a built-in synth or MIDI track. It owns:

- Root, scale, and octave/register range.
- Pitch source and optional direction inversion.
- Voice-leading strength and maximum melodic leap.
- Instrument voice such as bass, pluck, or soft lead.
- Gate length, velocity range, mute, and solo.
- Monophonic or bounded-polyphonic note handling. Monophonic should be the initial default.

Multiple melodic lanes may share the global harmony or override it locally. Sharing harmony makes it easy to create a bass and lead that remain compatible; a local override permits intentional bitonality later without complicating the common case.

### Drum lane

A drum lane represents one percussion voice rather than a complete kit. A project can therefore combine separate kick, snare, hat, clap, tom, and synthetic percussion lanes, each with its own Euclidean cycle and contour mapping. It owns:

- Drum voice and General MIDI drum note for export.
- Velocity, decay, tone, and optional stereo-position ranges.
- A choke group, initially used for open and closed hats.
- Mute and solo.
- Optional accent and ratchet behavior in a later iteration.

The first built-in kit should be sample-free and synthesized with Web Audio: oscillator pitch envelopes for kick and tom voices, filtered noise plus a tonal body for snare, and filtered noise for hats and claps. This keeps the project small, deterministic, and local-only. Sample import can remain a later extension.

Both lane types use the same contour descriptors differently by default:

| Lane           | Gate alignment                       | Primary value            | Expression                 |
| -------------- | ------------------------------------ | ------------------------ | -------------------------- |
| Bass           | Large/long contours                  | Area → scale pitch       | Length → velocity          |
| Lead/pluck     | High roughness or local peaks        | Centroid Y → scale pitch | Closedness → gate length   |
| Kick           | Large low-frequency shape changes    | Fixed drum voice         | Area → velocity            |
| Snare          | Fragmented contours                  | Fixed drum voice         | Path count → velocity      |
| Hat/percussion | Rough contours and small local peaks | Fixed drum voice         | Roughness → velocity/decay |

These are starting presets, not hard-coded semantics. The user can select a different descriptor for pitch, velocity, gate probability, note length, pan, or drum timbre.

## “Smart” musical quantization

I would avoid simply rounding geometry values to MIDI notes. Different models have wildly different numeric ranges, so that often produces a cluster of identical notes.

Instead:

1. Robustly normalize the chosen feature using its 10th–90th percentile range.
2. Rank-map it across the selected register.
3. Snap it to the chosen root and scale.
4. Choose octave equivalents that minimize melodic leaps.
5. Optionally limit successive jumps to a fifth.
6. Resolve ties deterministically so the same artwork always produces the same sequence.

Initial musical controls:

- Tempo: 40–240 BPM
- Global time signature and optional global harmony.
- Per-lane steps: 1–64, with 8, 12, 16, 24, and 32 as quick choices.
- Per-lane pulses: 0–Steps.
- Per-lane rotation: Auto or manual.
- Swing: 0–70% for compatible fixed-grid lanes.
- Root note and scale: minor pentatonic, major pentatonic, major, natural minor, Dorian, chromatic.
- Register: 1–3 octaves for melodic lanes.
- Mapping source: area, slice level, centroid X/Y, length, path count, closedness, or roughness.
- Direction: forward, reverse, or ping-pong.
- Contour influence: 0–100%.

“Auto rotation” would generate every rotation of `E(steps, pulses)` and select the one placing hits on the highest contour-energy steps. That preserves a real Euclidean rhythm while making the mesh meaningfully shape it.

## Polymeter and polyrhythm

Polymeter and polyrhythm should be explicit timing modes rather than two labels for arbitrary step counts. All lanes share one monotonic transport and tempo, but each lane chooses how its step duration is resolved.

### Fixed grid: polymeter

In `Grid` mode, the lane selects a musical subdivision such as 1/8 or 1/16. Every step has that duration, so lanes with different step counts have different loop lengths. For example:

- A 15-step lane at 1/16 loops after 15 sixteenth notes.
- A 16-step lane at 1/16 loops after 16 sixteenth notes.
- Played together, their downbeats drift and meet again after their least-common-multiple cycle.

This is polymeter: the underlying pulse duration is shared while the lane measures differ. The UI should offer an optional transport reset every 1, 2, 4, 8, or 16 bars so very long least-common-multiple cycles can be intentionally constrained.

### Fit to cycle: polyrhythm

In `Fit` mode, the lane chooses a cycle length of 1, 2, or 4 global bars, and its steps are divided evenly across that duration. A three-step lane against a four-step lane over one bar therefore produces a true 3:4 polyrhythm. Five against four produces 5:4 without representing quintuplets as imprecise floating-point delays.

Internally, timing should use integer transport ticks or rational positions relative to the global bar. Absolute Web Audio times are derived only when events enter the look-ahead window. This prevents cumulative floating-point drift and makes live playback, visual playheads, and MIDI export use the same timing model.

Grid and Fit lanes can coexist. Their shared synchronization rules are:

- Start, stop, seek, and queued project changes use the global transport.
- Pattern changes commit on the next global bar unless the user requests immediate restart.
- Lane rotation changes the Euclidean mask; lane phase offset changes its position against the global transport. These are separate controls.
- Swing applies to compatible paired subdivisions in Grid mode. Fit-mode tuplets remain mathematically even by default so their ratios are preserved.
- Probability is evaluated against the lane's own cycle index, not the animation-frame rate or audio callback order.

## Contour-mapped probability

Probability should be applied after the Euclidean mask. The Euclidean pattern determines candidate hits; probability decides which candidate hits sound on a particular cycle. With probability disabled, every Euclidean hit remains deterministic and always fires.

Each lane supports:

- Mode: Off, Fixed, or Contour.
- Fixed chance: 0–100%.
- Contour source: any normalized slice descriptor.
- Output range: minimum and maximum chance, for example 35–95%.
- Mapping curve: linear, ease-in, ease-out, or threshold.
- Invert mapping.
- Variation behavior: Repeat or Evolve.
- Hold duration: keep one probability result for 1, 2, 4, or 8 lane cycles.
- A project seed plus a lane-level seed offset.

For contour mode, the normalized descriptor is mapped into the selected probability range:

```text
shape = invert ? 1 - normalizedFeature : normalizedFeature
chance = lerp(minChance, maxChance, probabilityCurve(shape))
fires = seededRandom(projectSeed, laneId, heldCycle, stepIndex) < chance
```

`Repeat` omits the cycle index, so the same optional hits recur on every loop. `Evolve` includes a held cycle index, producing controlled variation while remaining reproducible. Random decisions must be derived from stable coordinates—project seed, lane ID, cycle, and step—not consumed from mutable PRNG state. Playback order, scheduler look-ahead, pausing, and offline MIDI export will then produce identical decisions.

The first release should use probability only for trigger/no-trigger decisions. The same deterministic mapping can later drive conditional accents, octave jumps, ratchets, or drum articulations, but those should be separate probability targets so the UI never hides multiple behaviors behind one percentage.

## Visualization

The bottom animation area provides a natural precedent for a sequencer dock:

- One horizontal row per melodic or drum lane, with add, duplicate, reorder, mute, and solo actions.
- Variable-width step grids drawn against one shared time ruler.
- A contour-shaped mini glyph or energy curve in each step.
- A clear gate marker for Euclidean candidate hits.
- Probability shown as a background-height or opacity meter.
- Optional hits shown as outlined markers; the deterministic preview of the next cycle shows which will fire and which will be skipped.
- Pitch shown vertically on scale rows for melodic lanes; drum lanes use voice labels and distinct icons or colours.
- Velocity shown as bar height or opacity.
- Per-lane loop brackets and phase markers, making 15-against-16 polymeter and 3:4 polyrhythm visible without calculation.
- A master-cycle indicator, capped to a useful display horizon when a polymeter's mathematical least-common-multiple is very long.
- Moving playhead driven by audio time.
- Hovering a step highlights its source contour in the main preview.
- The currently sounding contour briefly receives a bright halo.
- A “Pending shape” indicator appears while an exact contour render is completing.

Changes to geometry should not replace the phrase halfway through a bar. The new sequence becomes visible immediately but is committed to playback on the next bar boundary.

## Technical shape

Keep the musical logic DOM-free:

- `contour-features.ts`: deterministic slice measurements.
- `euclidean-rhythm.ts`: Bjorklund generation and shape-aligned rotation.
- `music-quantization.ts`: scales, percentile mapping, and voice leading.
- `contour-sequence.ts`: descriptors → playable steps.
- `sequencer-probability.ts`: stateless seeded decisions and contour probability curves.
- `sequencer-project.ts`: versioned lane unions, global settings, and manual overrides.
- `sequencer-playback.ts`: pure transport, polymeter/polyrhythm resolution, and bar-boundary calculations.
- `web-audio-engine.ts`: browser-only melodic synth, drum voices, choke groups, and look-ahead scheduler.
- `midi-sequence-export.ts`: deterministic melodic tracks plus General MIDI channel-10 drum tracks.
- `SequencerWorkspace.tsx`: transport, grid, mappings, and visualization.

Extend `ContourResult` with a small optional payload:

```ts
type ContourSequenceSource = {
  version: 1;
  slices: ContourSliceFeature[];
};

type ContourSliceFeature = {
  index: number;
  level: number;
  pathCount: number;
  length: number;
  area: number;
  centroidX: number;
  centroidY: number;
  closedness: number;
  roughness: number;
};
```

The project model should make illegal melodic/drum combinations unrepresentable:

```ts
type LaneTiming =
  | { mode: 'grid'; subdivision: '1/4' | '1/8' | '1/16' | '1/32' }
  | { mode: 'fit'; cycleBars: 1 | 2 | 4 };

type LaneProbability =
  | { mode: 'off' }
  | { mode: 'fixed'; chance: number; variation: 'repeat' | 'evolve'; holdCycles: number }
  | {
      mode: 'contour';
      source: ContourFeatureKey;
      minimum: number;
      maximum: number;
      curve: ProbabilityCurve;
      inverted: boolean;
      variation: 'repeat' | 'evolve';
      holdCycles: number;
    };

type SequencerLaneBase = {
  id: string;
  name: string;
  steps: number;
  pulses: number;
  rotation: number | 'auto';
  phase: number;
  timing: LaneTiming;
  probability: LaneProbability;
  seedOffset: number;
  muted: boolean;
  solo: boolean;
};

type MelodicLane = SequencerLaneBase & {
  kind: 'melodic';
  melody: MelodicLaneSettings;
};

type DrumLane = SequencerLaneBase & {
  kind: 'drum';
  drum: DrumLaneSettings;
};

type SequencerLane = MelodicLane | DrumLane;
```

Do not transfer full contour geometry merely for sound. A few numeric fields per slice are enough; a simplified overlay path can be included separately for highlighting.

Audio should use Web Audio with a short look-ahead scheduler—roughly 25 ms polling and 100 ms scheduling—rather than `requestAnimationFrame`. The animation frame loop only moves the visual playhead. This keeps timing stable during expensive contour renders.

## Delivery sequence

1. **Contour-analysis foundation**

   Preserve slice identity, calculate descriptors, extend the worker result, and prove SVG/G-code output remains unchanged when sequencing is inactive.

2. **Lane and voice foundation**

   Implement the shared lane model, Euclidean rhythm, auto rotation, quantization, global transport, one melodic pluck voice, and synthesized kick, snare, and hat voices. Land this incrementally with one active lane before exposing lane creation.

3. **Independent timing and probability**

   Implement Grid polymeter, Fit polyrhythm, lane phase offsets, exact rational/tick timing, reset horizons, and deterministic Fixed/Contour probability.

4. **Sequencer workspace**

   Add the third mode, multiple lane rows, lane type controls, shared ruler, probability preview, active-contour overlay, keyboard controls, responsive layout, and next-bar sequence swapping.

5. **Persistence and export**

   Store a versioned sequencer project locally and export standard MIDI with melodic tracks and channel-10 drum notes. Export takes a user-selected bar duration so evolving probability and long polymeters have a finite, reproducible result. No server or source-content upload is needed.

6. **Expressive expansion**

   Add additional lane presets and conditional variation targets such as:

   - Body/length → bass
   - Fragmentation → pluck
   - Roughness/local peaks → percussion
   - Probability → accent, octave, articulation, or ratchet

   Add sample import, more synth voices, and external MIDI output only after the built-in deterministic path is solid.

## Important edge cases

- Continuous spiral needs phase bins rather than ordinary slice IDs.
- Imported SVG centrelines can treat source runs as pseudo-slices.
- Voronoi mode may produce only one family; the UI should explain its limited variation.
- X/Y Morph results should average corresponding slice features initially.
- Quick renders should not alter a playing sequence; only exact results become musical sources.
- Animation and Sequencer should be mutually exclusive.
- Audio must start only from a user gesture and stop cleanly with no hanging oscillators.
- Very long polymeter least-common-multiple cycles must not create unbounded event arrays or an unusably wide grid.
- Changing a lane between melodic and drum types must use explicit migration defaults rather than retaining incompatible hidden settings.
- Probability previews must be recomputed from absolute cycle coordinates after seek; seeking cannot consume or advance random state.
- MIDI export must ask for a finite number of bars rather than attempting to infer when an evolving pattern “ends.”

## Definition of done for the MVP

- The same mesh, contour settings, and sequencer settings always produce the same notes.
- `16 / 5` produces exactly five evenly distributed hits.
- Every generated note belongs to the selected scale and register.
- A melodic lane and drum lane can play simultaneously from the same contour source.
- A 15-step and 16-step Grid pair remains phase-accurate and repeats according to its polymeter/reset policy.
- Fit lanes with 3 and 4 steps divide the same bar exactly and remain aligned over long playback.
- Fixed probability in Repeat mode produces the same loop, while Evolve mode changes only at the configured held-cycle boundary.
- Live playback and MIDI export make identical seeded probability decisions for the same absolute bars.
- Editing or orbiting the model swaps the phrase cleanly at the next bar.
- Audio remains correctly timed while contour rendering is busy.
- SVG and G-code output are unchanged when Sequencer is off.
- Play, pause, step selection, and mappings are keyboard accessible.
- Everything remains local to the browser.

I’d still implement the audio path with one lane first, but the first public sequencer release should expose multiple melodic and drum lanes, Grid polymeter, Fit polyrhythm, and seeded trigger probability. Treating lane type, timing mode, and probability as versioned discriminated values from the start avoids later persistence migrations and ensures live audio, visualization, and MIDI export all consume the same event model.
