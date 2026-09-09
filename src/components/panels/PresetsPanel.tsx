import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { requestPreset } from '../../lib/presets/bridge';
import { createPresetAsset } from '../../lib/presets/assets';
import { duplicatePreset, serializePreset } from '../../lib/presets/document';
import {
  isPickerCancellation,
  pickPresetDestination,
  pickPresetFiles,
  pickPresetFolder,
  presetFolderPermission,
  PresetFileSession,
  scanPresetFolder,
  type PresetDirectoryHandle,
  type PresetLibraryEntry,
  type PresetPickers,
  type PresetFileHandle,
} from '../../lib/presets/filesystem';
import {
  copyPresetToFolder,
  listExamplePresets,
  loadExamplePreset,
  rememberedPresetFolder,
  rememberPresetFolder,
  renamePresetFile,
  type ExamplePreset,
} from '../../lib/presets/library';
import type { PresetDocument } from '../../lib/presets/types';

type Loaded = { document: PresetDocument; session: PresetFileSession | null; example: boolean };
const sameFile = async (left: PresetFileHandle, right: PresetFileHandle) =>
  left === right || !!(await left.isSameEntry?.(right));
const pickerApi = () => window as unknown as PresetPickers;
export function PresetsPanel() {
  const [tab, setTab] = useState<'local' | 'examples'>('local');
  const [name, setName] = useState('Untitled preset');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [includeSource, setIncludeSource] = useState(true);
  const [folder, setFolder] = useState<PresetDirectoryHandle | null>(null);
  const [entries, setEntries] = useState<PresetLibraryEntry[]>([]);
  const [examples, setExamples] = useState<ExamplePreset[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('all');
  const [sort, setSort] = useState('name');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [pending, setPending] = useState<Loaded | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const operating = useRef(false);
  const loadAbort = useRef<AbortController | null>(null);
  const [preparing, setPreparing] = useState(false);
  const scanVersion = useRef(0);
  const editRevision = useRef(0);
  const [exampleError, setExampleError] = useState('');
  const supported =
    typeof window !== 'undefined' &&
    !!pickerApi().showOpenFilePicker &&
    !!pickerApi().showSaveFilePicker;
  const refresh = useCallback(async (selected: PresetDirectoryHandle) => {
    const version = ++scanVersion.current;
    if (!(await presetFolderPermission(selected, 'read'))) {
      setStatus('Reconnect the preset folder to browse its files.');
      return;
    }
    const result = await scanPresetFolder(selected);
    if (version !== scanVersion.current) return;
    setEntries(result.entries);
    if (result.issues.length) setStatus(result.issues.join(' '));
  }, []);
  const cancelScan = useCallback(() => {
    scanVersion.current++;
  }, []);
  useEffect(() => {
    let active = true;
    rememberedPresetFolder()
      .then((selected) => {
        if (active && selected) {
          setFolder(selected);
          void refresh(selected).catch(() => setStatus('Reconnect the preset folder.'));
        }
      })
      .catch(() => undefined);
    listExamplePresets()
      .then((items) => {
        if (active) setExamples(items);
      })
      .catch(() => {
        if (active) setExampleError('Examples could not be loaded. Try again.');
      });
    const changed = () => {
      editRevision.current++;
      setDirty(true);
      setOperationError(false);
      setStatus('');
    };
    const restored = (event: Event) => setCanUndo((event as CustomEvent).detail.canUndo);
    document.addEventListener('presetdirty', changed);
    document.addEventListener('presetloaded', restored);
    return () => {
      active = false;
      cancelScan();
      document.removeEventListener('presetdirty', changed);
      document.removeEventListener('presetloaded', restored);
    };
  }, [refresh, cancelScan]);
  useEffect(() => {
    const focused = () => {
      if (folder && !operating.current) void refresh(folder).catch(() => undefined);
    };
    window.addEventListener('focus', focused);
    return () => window.removeEventListener('focus', focused);
  }, [folder, refresh]);
  const run = (action: () => Promise<void>) => {
    if (operating.current) return;
    operating.current = true;
    setBusy(true);
    setOperationError(false);
    setStatus('');
    void action()
      .catch((error) => {
        if (!isPickerCancellation(error)) {
          setOperationError(true);
          setStatus(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        operating.current = false;
        setBusy(false);
      });
  };
  const adopt = (value: Loaded) => {
    setLoaded(value);
    setName(value.document.metadata.name);
    setDescription(value.document.metadata.description);
    setTags(value.document.metadata.tags.join(', '));
    setDirty(false);
    setPending(null);
  };
  const apply = async (value: Loaded) => {
    if (Object.values(value.document.assets).some((asset) => asset.content.kind === 'external')) {
      setPending(value);
      setStatus('Locate the source files below to open this preset.');
      return;
    }
    const controller = new AbortController();
    loadAbort.current = controller;
    setPreparing(true);
    let document: PresetDocument;
    try {
      document = await requestPreset({
        command: 'apply',
        document: value.document,
        signal: controller.signal,
      });
    } finally {
      loadAbort.current = null;
      setPreparing(false);
    }
    adopt({ ...value, document });
    setStatus(`Loaded ${document.metadata.name}.`);
  };
  const loadHandle = async (handle: PresetFileHandle) => {
    const value = await PresetFileSession.open(handle);
    await apply({ ...value, example: false });
  };
  const allowLoad = () =>
    !dirty ||
    window.confirm('Replace the current unsaved settings? You can undo this preset load.');
  const save = (copy: boolean) =>
    run(async () => {
      const old = loaded;
      const newIdentity = copy || old?.example || !old;
      // Native picker must precede capture/hash work while the click gesture is active.
      const handle =
        !newIdentity && old?.session
          ? old.session.handle
          : await pickPresetDestination(pickerApi(), name);
      const session =
        !newIdentity && old?.session ? old.session : await PresetFileSession.destination(handle);
      if (
        handle.requestPermission &&
        (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted'
      )
        throw new Error('Write access to the preset file was not granted.');
      const revision = editRevision.current;
      let document = await requestPreset({ command: 'capture', includeSource });
      if (old)
        document = { ...document, id: old.document.id, metadata: { ...old.document.metadata } };
      if (newIdentity && old)
        document = duplicatePreset(
          document,
          crypto.randomUUID(),
          new Date().toISOString(),
          name.trim(),
        );
      document.metadata = {
        ...document.metadata,
        name: name.trim() || 'Untitled preset',
        description,
        tags: [
          ...new Set(
            tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ],
        updatedAt: new Date().toISOString(),
      };
      const bytes = new TextEncoder().encode(serializePreset(document)).byteLength;
      await session.save(document);
      adopt({ document, session, example: false });
      setDirty(editRevision.current !== revision);
      setStatus(`Saved ${handle.name} · ${(bytes / 1024).toFixed(1)} KB.`);
      if (folder) await refresh(folder);
    });
  const chooseFolder = () =>
    run(async () => {
      const selected = await pickPresetFolder(pickerApi());
      setFolder(selected);
      await refresh(selected);
      try {
        await rememberPresetFolder(selected);
      } catch {
        setStatus('Folder connected for this session. This browser could not remember it.');
      }
    });
  const writableFolder = async () => {
    if (!folder || !(await presetFolderPermission(folder, 'readwrite', true)))
      throw new Error('Write access to the preset folder was not granted.');
    return folder;
  };
  const matches = (title: string, itemTags: string[], itemMode: string) =>
    `${title} ${itemTags.join(' ')}`.toLowerCase().includes(query.toLowerCase()) &&
    (mode === 'all' || mode === itemMode);
  const local = entries
    .filter((entry) =>
      matches(
        entry.metadata?.name ?? entry.path,
        entry.metadata?.tags ?? [],
        entry.entryMode ?? '',
      ),
    )
    .sort((a, b) =>
      sort === 'updated'
        ? (b.metadata?.updatedAt ?? '').localeCompare(a.metadata?.updatedAt ?? '')
        : (a.metadata?.name ?? a.path).localeCompare(b.metadata?.name ?? b.path),
    );
  const edit = (setter: (value: string) => void, value: string) => {
    setter(value);
    editRevision.current++;
    setOperationError(false);
    setStatus('');
    setDirty(true);
  };
  return (
    <div data-preset-panel>
      <div className="preset-tabs segmented" role="group" aria-label="Preset library">
        <Button
          className="preset-control"
          variant="outline"
          aria-pressed={tab === 'local'}
          onClick={() => setTab('local')}
        >
          Local
        </Button>
        <Button
          className="preset-control"
          variant="outline"
          aria-pressed={tab === 'examples'}
          onClick={() => setTab('examples')}
        >
          Examples
        </Button>
      </div>
      <div className="preset-fields">
        <label>
          Preset name
          <input
            className="preset-control"
            disabled={busy}
            value={name}
            maxLength={200}
            onChange={(event) => edit(setName, event.target.value)}
          />
        </label>
        <label>
          Description
          <input
            className="preset-control"
            disabled={busy}
            value={description}
            maxLength={16384}
            onChange={(event) => edit(setDescription, event.target.value)}
          />
        </label>
        <label>
          Tags, separated by commas
          <input
            className="preset-control"
            disabled={busy}
            value={tags}
            onChange={(event) => edit(setTags, event.target.value)}
          />
        </label>
        <label className="preset-include">
          <input
            type="checkbox"
            className="preset-control"
            disabled={busy}
            checked={includeSource}
            onChange={(event) => setIncludeSource(event.target.checked)}
          />
          Include source files
        </label>
      </div>
      <div className="preset-actions preset-actions--workspace">
        <Button
          className="preset-control"
          disabled={busy || !supported}
          onClick={() => save(false)}
        >
          {loaded?.example ? 'Save local copy' : 'Save preset'}
        </Button>
        <Button
          className="preset-control"
          variant="outline"
          disabled={busy || !supported}
          onClick={() => save(true)}
        >
          Save as copy
        </Button>
        <Button
          className="preset-control"
          variant="outline"
          disabled={busy || !supported}
          onClick={() => {
            if (allowLoad())
              run(async () => {
                const [handle] = await pickPresetFiles(pickerApi());
                if (handle) await loadHandle(handle);
              });
          }}
        >
          Open file
        </Button>
        <Button
          className="preset-control"
          variant="outline"
          disabled={busy || !canUndo}
          onClick={() =>
            run(async () => {
              const document = await requestPreset({ command: 'undo' });
              adopt({ document, session: null, example: false });
              setDirty(true);
              setStatus('Previous workspace restored.');
            })
          }
        >
          Undo preset load
        </Button>
        {loaded?.session && (
          <Button
            className="preset-control"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (allowLoad()) run(() => loadHandle(loaded!.session!.handle));
            }}
          >
            Reload file
          </Button>
        )}
      </div>
      {preparing && (
        <Button
          className="preset-control"
          variant="outline"
          onClick={() => loadAbort.current?.abort()}
        >
          Cancel loading
        </Button>
      )}
      {!supported && (
        <p className="snapshot-status">
          Local presets need a browser with File System Access support. Examples remain available.
        </p>
      )}
      <p
        className={`snapshot-status${operationError ? ' preset-status--error' : ''}`}
        role="status"
      >
        {busy
          ? 'Working on preset…'
          : status || (dirty ? 'Unsaved changes' : loaded ? 'Preset loaded' : 'No preset loaded')}
      </p>
      {dirty && status && !busy && <p className="snapshot-status">Unsaved changes</p>}
      {pending && (
        <div className="preset-dependencies">
          {Object.entries(pending.document.assets)
            .filter(([, asset]) => asset.content.kind === 'external')
            .map(([id, asset]) => (
              <Button
                className="preset-control"
                variant="outline"
                key={id}
                disabled={busy || !supported}
                onClick={() =>
                  run(async () => {
                    const picker = window as unknown as {
                      showOpenFilePicker(options: object): Promise<PresetFileHandle[]>;
                    };
                    const [handle] = await picker.showOpenFilePicker({ multiple: false });
                    if (!handle) return;
                    const file = await handle.getFile();
                    if (file.size !== asset.byteLength)
                      throw new Error('That source file has a different size.');
                    const resolved = await createPresetAsset(
                      new Uint8Array(await file.arrayBuffer()),
                      asset.name,
                      asset.mediaType,
                    );
                    if (resolved.id !== id)
                      throw new Error('That file does not match the preset’s source.');
                    const next = { ...pending, document: structuredClone(pending.document) };
                    next.document.assets[id] = resolved.asset;
                    setPending(next);
                    await apply(next);
                  })
                }
              >
                Locate {asset.name}
              </Button>
            ))}
          <Button
            className="preset-control"
            variant="outline"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            Cancel opening
          </Button>
        </div>
      )}
      <div className="preset-filters">
        <input
          className="preset-control"
          aria-label="Search presets"
          placeholder="Search names and tags"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="preset-control"
          aria-label="Filter preset mode"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="all">All modes</option>
          {['config', 'animation', 'sequencer', '3d'].map((item) => (
            <option key={item} value={item}>
              {item === '3d' ? '3D' : item[0].toUpperCase() + item.slice(1)}
            </option>
          ))}
        </select>
        <select
          className="preset-control"
          aria-label="Sort presets"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="name">Name</option>
          <option value="updated">Recently saved</option>
        </select>
      </div>
      {tab === 'local' ? (
        <>
          <div className="preset-actions">
            <Button
              className="preset-control"
              variant="outline"
              disabled={busy || !pickerApi().showDirectoryPicker}
              onClick={chooseFolder}
            >
              {folder ? 'Change folder' : 'Choose preset folder'}
            </Button>
            {folder && (
              <>
                <Button
                  className="preset-control"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (await presetFolderPermission(folder, 'read', true)) await refresh(folder);
                      else throw new Error('Folder access was not granted.');
                    })
                  }
                >
                  Refresh / reconnect
                </Button>
                <Button
                  className="preset-control"
                  variant="outline"
                  disabled={busy || !supported}
                  onClick={() =>
                    run(async () => {
                      const handles = await pickPresetFiles(pickerApi(), true);
                      const destination = await writableFolder();
                      let imported = 0;
                      const failures: string[] = [];
                      for (const handle of handles) {
                        try {
                          const { document } = await PresetFileSession.open(handle);
                          await requestPreset({ command: 'validate', document });
                          await copyPresetToFolder(destination, document);
                          imported++;
                        } catch (error) {
                          failures.push(`${handle.name}: ${String(error)}`);
                        }
                      }
                      await refresh(destination);
                      setStatus(
                        `Imported ${imported} presets.${failures.length ? ` ${failures.join(' ')}` : ''}`,
                      );
                    })
                  }
                >
                  Import files
                </Button>
              </>
            )}
          </div>
          {folder && <p className="snapshot-status">Folder: {folder.name}</p>}
          <ul className="snapshot-list" aria-label="Local presets">
            {local.map((entry) => (
              <li key={entry.path}>
                <div className="snapshot-copy">
                  <strong>{entry.metadata?.name ?? entry.path}</strong>
                  <span>{entry.path}</span>
                  {entry.error && <span>{entry.error}</span>}
                </div>
                <div className="preset-actions">
                  <Button
                    className="preset-control"
                    variant="outline"
                    disabled={busy || !!entry.error}
                    onClick={() => {
                      if (allowLoad()) run(() => loadHandle(entry.handle));
                    }}
                  >
                    Load
                  </Button>
                  <Button
                    className="preset-control"
                    variant="outline"
                    disabled={busy || !!entry.error}
                    onClick={() =>
                      run(async () => {
                        const destination = await writableFolder();
                        const { document } = await PresetFileSession.open(entry.handle);
                        await copyPresetToFolder(
                          destination,
                          duplicatePreset(
                            document,
                            crypto.randomUUID(),
                            new Date().toISOString(),
                            `${document.metadata.name} copy`,
                          ),
                        );
                        await refresh(destination);
                      })
                    }
                  >
                    Duplicate
                  </Button>
                  <Button
                    className="preset-control"
                    variant="outline"
                    disabled={busy || !!entry.error}
                    onClick={() => {
                      const next = window.prompt('New preset name', entry.metadata?.name);
                      if (next?.trim())
                        run(async () => {
                          await writableFolder();
                          const renamed = await renamePresetFile(
                            entry.directory,
                            entry.handle,
                            next.trim(),
                          );
                          if (
                            loaded?.session &&
                            (await sameFile(loaded.session.handle, entry.handle))
                          ) {
                            setLoaded({ ...loaded, ...(await PresetFileSession.open(renamed)) });
                            setName(next.trim());
                          }
                          await refresh(folder!);
                        });
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    className="preset-control"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(`Delete ${entry.path}? This may not use the system trash.`)
                      )
                        run(async () => {
                          await writableFolder();
                          await entry.directory.removeEntry(entry.handle.name);
                          if (
                            loaded?.session &&
                            (await sameFile(loaded.session.handle, entry.handle))
                          ) {
                            setLoaded({ ...loaded, session: null });
                            setDirty(true);
                          }
                          await refresh(folder!);
                        });
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {!local.length && (
            <p className="snapshot-empty">
              {folder
                ? 'No matching presets in this folder.'
                : 'Choose a folder to browse and organize local presets.'}
            </p>
          )}
        </>
      ) : (
        <>
          {exampleError && (
            <div role="status">
              {exampleError}
              <Button
                className="preset-control"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    setExamples(await listExamplePresets());
                    setExampleError('');
                  })
                }
              >
                Retry examples
              </Button>
            </div>
          )}
          <ul className="snapshot-list" aria-label="Example presets">
            {examples
              .filter((example) => matches(example.name, example.tags, example.mode))
              .map((example) => (
                <li key={example.id}>
                  <div className="snapshot-copy">
                    <strong>{example.name}</strong>
                    <span>{example.description}</span>
                  </div>
                  <Button
                    className="preset-control"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (allowLoad())
                        run(async () =>
                          apply({
                            document: await loadExamplePreset(example),
                            session: null,
                            example: true,
                          }),
                        );
                    }}
                  >
                    Use example
                  </Button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
