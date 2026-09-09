import { useId, useRef, useState } from 'react';
import { Section } from '../ui/section';
import { PresetsPanel } from './PresetsPanel';
import { SnapshotsPanel } from './SnapshotsPanel';

const tabs = ['Presets', 'Snapshots'] as const;

export function SavedStatesPanel() {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <Section
      title="Presets & snapshots"
      description="Full workspace files or quick drawing states."
      defaultOpen={false}
    >
      <div
        className="saved-state-tabs segmented"
        role="tablist"
        aria-label="Saved states"
        data-preset-panel
      >
        {tabs.map((label, index) => (
          <button
            key={label}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            className="preset-control"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = 1;
              else return;
              event.preventDefault();
              setActive(next);
              buttons.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Keep file sessions, unsaved metadata and snapshot drafts alive across tab switches. */}
      <div
        role="tabpanel"
        id={`${id}-panel-0`}
        aria-labelledby={`${id}-tab-0`}
        hidden={active !== 0}
      >
        <p className="saved-state-description">
          <strong>Complete workspaces, saved as local files.</strong> Presets include all modes,
          drawing and export settings, and optionally source files. Reuse them across sessions or
          start from an app example.
        </p>
        <PresetsPanel />
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel-1`}
        aria-labelledby={`${id}-tab-1`}
        hidden={active !== 1}
      >
        <p className="saved-state-description">
          <strong>Quick drawing states, saved in this browser.</strong> Snapshots capture drawing
          parameters, morph targets, and randomization locks for the current source. They do not
          include source files, mode projects, or export settings.
        </p>
        <p className="snapshot-mode-note">Switch to Config to save or restore drawing snapshots.</p>
        <div className="drawing-only">
          <SnapshotsPanel />
        </div>
      </div>
    </Section>
  );
}
