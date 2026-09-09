# Portable presets plan

Status: proposed design; no preset runtime or file API changes implemented.

## Scope and recommendation

Use one UTF-8 JSON document per preset, named `name.slicewise-preset.json`. A preset is a complete authored configuration across Config, Animation, Sequencer, and 3D, including inactive modes and disabled controls. The same document works as a local preset and as an application example.

Save explicit values, including defaults, rather than differences against the current application defaults. Loading a full preset replaces authored state; it must not inherit unrelated values from the previously open preset. Future selective application can be a separate command with explicit dependencies, without introducing a second file format.

This extends the current named snapshots, which only capture render settings, morph targets, and randomization locks. `settingsSnapshot()` and `renderSettingKeys` are useful inputs, but neither is the complete persistence contract. Export settings live separately in `slicer.ts`; Animation and Sequencer have independent storage formats; 3D has source-associated session state.

## Document structure

The following TypeScript describes the proposed envelope, not a complete schema or an implementation:

```ts
interface PresetDocument {
  format: 'slicewise-preset';
  formatVersion: 1;
  id: string; // UUID, independent of filename and display name
  metadata: {
    name: string;
    description: string;
    tags: string[];
    createdAt: string; // ISO 8601 UTC
    updatedAt: string;
    author?: string;
    license?: string;
    derivedFrom?: string; // original preset UUID
  };
  createdWith: { appVersion: string; build?: string };
  entryMode: 'config' | 'animation' | 'sequencer' | '3d';
  sections: Record<
    string,
    {
      version: number;
      requiredFeatures: string[];
      data: unknown; // validated against the named section's schema
    }
  >;
  assets: Record<
    string,
    {
      mediaType: string;
      name: string;
      byteLength: number;
      sha256: string; // digest of original bytes
      content: { kind: 'embedded'; encoding: 'base64'; data: string } | { kind: 'external' }; // user must locate matching bytes
    }
  >;
  extensions?: Record<string, unknown>; // namespaced vendor data
}
```

The standard sections are `source`, `drawing`, `animation`, `sequencer`, `threeD`, `export`, and `authoring`. Each owns an explicit schema and migration chain. All are emitted by the current full exporter, even if a mode has never been opened; use its canonical default state or an explicit uninitialized state where initialization requires a source. An unsupported future section can remain opaque. The envelope version changes only for incompatible document/container changes; section versions change when their interpretation changes. App release versions are diagnostic, not migration selectors.

Metadata is editable and does not change rendering. Save retains the UUID and creation date; Duplicate and Save As Copy generate a new UUID and record `derivedFrom`. Copying a file in Finder may create two files with the same UUID: list both by file identity and never silently deduplicate or overwrite them.

## Coverage contract

| Section     | Persisted state                                                                                                                                                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`    | Source kind and stable built-in ID/revision; imported asset reference; up axis; all mesh/terrain/tiling generator controls and seeds; SVG import mode, extrusion, rounding, centreline pruning, and other import options. Store inactive source-family settings too.                                           |
| `drawing`   | Every authored render setting: Object, view/projection, contours and fields, slice SVG asset/path data, both morph dimensions and targets, appearance, gradients/stops, indexed colours, artboard dimensions/orientation/preset identity, masks, effects, and all their seeds. Disabled values remain present. |
| `animation` | Frozen base settings, all keyframes and values, IDs, easing, duration, FPS, looping, and video export choices. Save the authored project, never a temporary evaluated playback frame.                                                                                                                          |
| `sequencer` | Complete musical project, tempo, seed, scales, all lanes, rhythm/timing, sound, traversal/mapping, probability, variation/expression, mute/solo, lane names/colours, and MIDI export duration.                                                                                                                 |
| `threeD`    | Source association, sizing and units, physical orientation/position, bed placement, build volume and printer identity, treatment/selection/tolerances, captured slice-view direction, configurable diagnostics, and authored presentation/camera choices.                                                      |
| `export`    | Output format, plotter profile, feed rates, pen heights, path optimization/merging, auto-rotation, all expressive-motion settings, and active surface compensation values. Other mode-specific export choices have their single owner above.                                                                   |
| `authoring` | Randomization locks and persistent options that influence subsequent editing. Store effective locks, not the temporary bulk-toggle undo buffer.                                                                                                                                                                |

Use stable domain keys rather than translated labels or DOM IDs as the public contract. Existing control IDs remain an internal adapter. Specify units, bounds, enum IDs, array ordering, nullability, and defaults in each schema. Preserve numerical precision; display rounding must not alter saved values.

There must be one canonical owner for each value. Procedural base settings belong to `source`; animation base snapshots and morph/keyframe values are intentional independent values referring to stable parameter IDs. Capture Config's frozen state separately from Animation's base. Restore both explicitly, rather than passing preset imports through the existing animation autosave base-match heuristic.

Build a parameter inventory from runtime state, React-owned complex controls, source controls, all mode projects, export dialogs, and viewport settings. Assign every authored field a persistence owner. Classify remaining state explicitly as transient or derived. Extend the existing setting catalogs rather than creating an unrelated duplicate list. A compile-time exhaustiveness check plus tests must fail when an authored field is added without a persistence decision. Adding a control must include its schema/default, capture/restore binding, migration when needed, and coverage check.

Exclude generated SVG/toolpaths/meshes, prepared 3D artifacts, validation results, audio nodes, caches, worker revisions, serial connections, permissions, undo stacks, playheads, selection/hover state, and accordion layout. These are outputs or session state, not authored parameters. Store the active calibration values, but do not replace the user's separate machine-calibration library. Loading parameters never restores a previous preflight pass, starts playback, prepares a solid, or sends machine commands.

## Source assets and portability

Default to a self-contained preset: generated/built-in sources use stable recipes and explicit generator revisions; imported meshes and SVGs embed their original bytes. Capture original bytes on import, since the normalized mesh alone cannot recover original coordinates or source options. This also preserves imported-unit sizing in 3D. Assign asset IDs by content hash to share a single asset across sections.

Offer **Include source files**, enabled by default. Turning it off produces an explicitly labelled source-dependent preset with the same hashes and descriptors but no bytes. Import resolves a matching already-loaded asset or asks the user to locate it; filenames alone are insufficient. Never substitute the current mesh silently. Missing dependencies block full application, while metadata can still be inspected.

Built-in and procedural generator IDs must survive display-name changes. Changed generation algorithms need retained revision implementations or a documented migration. A version number alone does not guarantee identical geometry; if historical reconstruction becomes unavailable, offer a resolved embedded asset or report the incompatibility. Exact output across arbitrary future engine changes is not promised.

JSON with embedded bytes makes a preset a single file that can be renamed, moved, backed up, and published easily. Base64 adds roughly one-third to binary size, so show estimated size before saving. Start with this simple format; compressed packaging can be introduced later as another transport around the same document if real usage warrants it.

## Compatibility and validation

1. Parse as untrusted data with bounded file size, nesting, strings, asset bytes, lane/keyframe counts, and SVG/path complexity. Define concrete limits before shipping; reuse existing geometry and project budgets where applicable. Reject malformed numbers, invalid enums, prototype-related keys, and inconsistent cross-field references. Never execute document content or automatically fetch URLs from presets.
2. Identify the envelope, then migrate each supported section through pure, tested steps. Reuse existing parameter, animation, and sequencer migrations behind validated adapters; do not rely on permissive local-storage recovery to validate arbitrary files.
3. For older files, supply version-specific compatibility defaults. A newly added effect normally defaults to disabled for old presets, even if the app's new-project default changes. Intentionally changed semantics require a migration and fixture.
4. Validate the resulting complete state and source relationships before modifying the workspace. Report repairs explicitly; do not silently clamp an incompatible preset into a different artwork.
5. Preserve unknown keys and sections in a detached document alongside the validated runtime projection, including unknown values inside nested records and ID-addressed arrays. Saving overlays supported edits onto that retained document. Deleting a supported parent intentionally deletes its contents. Reject duplicate IDs that make merging ambiguous.
6. An unknown feature used by the active configuration, unknown discriminant, or newer incompatible section blocks full application. The file remains inspectable and copyable. Unknown inactive sections may be preserved without execution, with a visible compatibility notice. Never silently substitute another mode or source. Requirements are explicit stable feature IDs and are also checked against section contents, not trusted declarations alone.
7. Do not overwrite a document whose active semantics the app cannot interpret. A future explicit partial-import action may create a new copy, but is outside the first implementation. Opening an old file never rewrites it automatically; an explicit Save writes the supported migrated form.

Backward compatibility is the primary guarantee. Forward compatibility means preserving unfamiliar data and explaining limitations, not pretending an old renderer implements future features. Export deterministic JSON with consistent key ordering, two-space indentation, and a trailing newline; meaningful array order remains unchanged.

## Applying a preset

Read → validate/migrate → resolve dependencies → prepare detached source/state → commit once → render. Failure or cancellation before commit leaves the current authored workspace intact. Pause transports only when committing, reject imports during an active machine send, and use a generation token so stale worker replies cannot replace the imported result. Retain an in-memory pre-import checkpoint for a single **Undo preset load**, since existing render-only history cannot undo cross-mode/source replacement.

Install the source before dependent mode projects; remap runtime-only source IDs to the new source identity. Restore all four modes even when only one is displayed. Publish existing control synchronization events after the state is coherent. Recompute contours and sequencer descriptors; invalidate 3D preparation and export preflight. Write browser autosaves only after successful commit so they cannot overwrite the imported projects during initialization.

Loading records active machine values without changing the local calibration library; existing export and direct-send validation remains authoritative. Published examples should ship with neutral machine compensation.

## Local preset library

Provide a single Presets panel with **Local** and **Examples** views. Local supports a list/grid, search by name and tags, mode filters, sorting, editable metadata, and a clear changed-since-save indicator.

| Action                   | Behavior                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Choose preset folder     | `showDirectoryPicker`; index preset files in that folder and its subfolders with bounded traversal. Folder names remain normal filesystem organization.                                                                        |
| Open file                | `showOpenFilePicker`; load one preset without requiring a library folder.                                                                                                                                                      |
| Import into library      | Select one or more files, validate and copy them into the selected folder; leave originals intact and report individual failures.                                                                                              |
| Save                     | Write a complete captured document to its current writable local handle; first save asks for a destination. No automatic disk writes during parameter edits.                                                                   |
| Save As Copy / Duplicate | Create a new preset identity and a collision-free file. Use `showSaveFilePicker` for an arbitrary destination.                                                                                                                 |
| Rename                   | Edit display name independently; offer filename rename in the library using verified copy-then-delete when direct rename is unavailable. Never delete the original unless the new copy was successfully written and read back. |
| Delete                   | Confirm the named local file, then remove only that file. Do not recursively delete folders. Make clear that deletion may not use the OS trash.                                                                                |
| Refresh / Reconnect      | Rescan external edits or reconnect a remembered folder after permission expires.                                                                                                                                               |

The folder is authoritative. IndexedDB stores handles and a disposable metadata/thumbnail index, never the only copy of a saved preset. Refresh on explicit request and when the app regains focus; do not depend on filesystem watching. Malformed files show a per-file error and do not prevent other presets from loading. Show relative paths to distinguish duplicate names.

Before overwriting, obtain a fresh `File` and compare its digest with the version last read or written. On external changes, offer Reload or Save As Copy. This is best-effort conflict detection, not an OS-level compare-and-swap guarantee. Serialize writes within the app, retain dirty state on failure, and show success only after `createWritable()` / write / close completes. Abort failed streams where possible. Preserve both copies and report recovery details if the delete stage of a rename fails.

Call pickers directly from user gestures, before expensive capture/encoding. Use a secure context, feature-detect each operation, request read permission for browsing and write permission when needed, and treat cancellation as normal. Persisted handles do not guarantee persisted permission; query permission on reuse and offer a user-initiated reconnect. These constraints follow the [Chrome File System Access guide](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) and [MDN permission documentation](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission).

The picker API is not available in every browser. Keep local filesystem management explicitly unavailable where required capabilities are missing, with a concise explanation; Examples can remain usable. A conventional upload/download fallback can be a later product choice rather than silently replacing the requested folder workflow. See [MDN directory-picker support](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker).

## Application examples

Store curated presets under `public/presets/` using exactly the same files, validators, migrations, and application path. Add a separately versioned `index.json` catalog with preset UUID, relative URL, title, description, tags, relevant modes, thumbnail URL, and file digest. The catalog supports browsing without loading every document or asset; it is not another preset schema.

Examples are read-only by their repository/provider origin, not a trusted `readOnly` flag inside JSON. **Use example** loads the document; **Save a local copy** assigns a new UUID and retains attribution through `derivedFrom`. Local changes never update the application catalog. Selecting a downloaded example through the file picker works identically.

Require self-contained assets or supported built-in recipes, attribution/licensing for included artwork, and no local paths, handle data, or machine-specific calibrations in published examples. Validate the catalog and every example in CI, including source resolution and an appropriate render/mode smoke check. Publication is an explicit repository workflow; local presets are never uploaded automatically. No marketplace or backend is needed.

## Implementation sequence and acceptance

1. Inventory every authored parameter and establish domain ownership. Implement DOM-free document types, JSON Schema, defaults, bounded validation, migrations, unknown-data retention, and deterministic serialization under `src/lib/presets/`.
2. Add source-byte retention and complete runtime capture/transactional application adapters. Keep browser orchestration in `slicer.ts`; keep geometry and codecs DOM-free. Integrate existing mode validators and control events.
3. Add the file API adapter, reusable Local/Examples repository interface, handle/index persistence, and library UI using existing controls and visual primitives. Migrate existing IndexedDB named snapshots only through an explicit export action: their missing state comes from a clearly identified current-workspace completion, never a claim that old snapshots contained it.
4. Add the static catalog and representative examples for every mode and source family. Update ARCHITECTURE, PARAMETERS, and TESTING when behavior is implemented; existing descriptions remain accurate until then.

Acceptance tests must cover:

- Capture/save/load/capture equivalence for every authored field, including disabled effects, inactive modes/source settings, morphs, locks, export controls, and complex arrays.
- Every historical version fixture, changed-default migrations, unknown nested data retention, unsupported active features, and repeated save/load without drift.
- Embedded/missing/incorrect assets, original 3D coordinate units, stable generator revisions, source remapping, and Config versus Animation base isolation.
- Corrupt and oversized documents, invalid references, atomic application failure, stale worker results, checkpoint restoration, and autosave ordering.
- Picker cancellation, denied/revoked permission, reconnect, write/close failure, external changes, duplicate UUIDs/names, rename recovery, and independent library-file failures.
- Shared local/example import behavior, local-copy attribution, and validation of the complete bundled catalog.

Run relevant unit/runtime/component tests and the project's full verification commands for implementation. Manually exercise pickers, permissions across reloads, folder operations, and each mode in a supporting browser; jsdom alone cannot verify native filesystem behavior.
