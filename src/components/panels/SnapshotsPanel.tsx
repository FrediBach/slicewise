import { useCallback, useEffect, useState } from 'react';
import { Camera, RotateCcw, Trash2 } from 'lucide-react';
import type { ContourSettings } from '../../lib/contour-engine';
import {
  deleteParameterSnapshot,
  listParameterSnapshots,
  saveParameterSnapshot,
  type ParameterSnapshot,
} from '../../lib/parameter-snapshots';
import { Button } from '../ui/button';
import { Section } from '../ui/section';

type CapturedParameters = {
  parameters: ContourSettings;
  randomLocks: string[];
};

type CaptureDetail = {
  snapshot?: CapturedParameters;
};

const snapshotDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function snapshotId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function formatSnapshotDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return snapshotDateFormatter.format(date);
}

function restoreSnapshot(snapshot: ParameterSnapshot): void {
  document.dispatchEvent(
    new CustomEvent('applyparametersnapshot', {
      detail: {
        parameters: snapshot.parameters,
        randomLocks: snapshot.randomLocks,
        name: snapshot.name,
      },
    }),
  );
}

export function SnapshotsPanel() {
  const [name, setName] = useState('');
  const [snapshots, setSnapshots] = useState<ParameterSnapshot[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSnapshots(await listParameterSnapshots());
      setStatus('');
    } catch {
      setStatus('Snapshot storage is unavailable in this browser.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    listParameterSnapshots()
      .then((storedSnapshots) => {
        if (!active) return;
        setSnapshots(storedSnapshots);
        setStatus('');
      })
      .catch(() => {
        if (active) setStatus('Snapshot storage is unavailable in this browser.');
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    const detail: CaptureDetail = {};
    document.dispatchEvent(new CustomEvent('captureparametersnapshot', { detail }));
    if (!detail.snapshot) {
      setStatus('Parameters are still loading. Try again in a moment.');
      return;
    }
    setBusy(true);
    try {
      await saveParameterSnapshot({
        id: snapshotId(),
        name: trimmedName,
        createdAt: new Date().toISOString(),
        parameters: detail.snapshot.parameters,
        randomLocks: detail.snapshot.randomLocks,
      });
      setName('');
      await refresh();
    } catch {
      setStatus('Could not save this snapshot.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (snapshot: ParameterSnapshot) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteParameterSnapshot(snapshot.id);
      await refresh();
    } catch {
      setStatus(`Could not delete “${snapshot.name}”.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Snapshots" description="Save and return to named parameter states.">
      <div className="snapshot-create">
        <label htmlFor="snapshotName">Snapshot name</label>
        <div className="snapshot-create-row">
          <input
            id="snapshotName"
            type="text"
            value={name}
            maxLength={80}
            placeholder="e.g. Fine topography"
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="snapshot-save-button"
            disabled={!name.trim() || busy}
            onClick={() => void save()}
          >
            <Camera size={13} />
            Save
          </Button>
        </div>
      </div>

      {status ? (
        <p className="snapshot-status" role="status">
          {status}
        </p>
      ) : null}

      {snapshots.length ? (
        <ul className="snapshot-list" aria-label="Saved parameter snapshots">
          {snapshots.map((snapshot) => (
            <li key={snapshot.id}>
              <div className="snapshot-copy">
                <strong>{snapshot.name}</strong>
                <time dateTime={snapshot.createdAt}>{formatSnapshotDate(snapshot.createdAt)}</time>
              </div>
              <div className="snapshot-actions">
                <button
                  type="button"
                  aria-label={`Restore ${snapshot.name}`}
                  title="Restore snapshot"
                  onClick={() => restoreSnapshot(snapshot)}
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${snapshot.name}`}
                  title="Delete snapshot"
                  disabled={busy}
                  onClick={() => void remove(snapshot)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="snapshot-empty">No saved snapshots yet.</p>
      )}
    </Section>
  );
}
