import { PRINTER_PRESETS, printerPreset } from '../../lib/three-d-printer-presets';
import { DEFAULT_BUILD_VOLUME, buildVolumeOverruns } from '../../lib/three-d-build-volume';
import { PhysicalNumberInput } from './PhysicalNumberInput';
import { ThreeDSurfacePanel } from './ThreeDSurfacePanel';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Section } from '../ui/section';
import {
  initialThreeDState,
  type ThreeDUiState,
  type ThreeDProject,
} from '../../lib/three-d-project';
import type { createThreeDScene, ReferenceView, SceneStyle } from '../../lib/three-d-scene';

function useThreeDState() {
  const [state, setState] = useState(initialThreeDState);
  useEffect(() => {
    const update = (event: Event) => setState((event as CustomEvent<ThreeDUiState>).detail);
    document.addEventListener('threedstatechange', update);
    document.dispatchEvent(new CustomEvent('threedstaterequest'));
    return () => document.removeEventListener('threedstatechange', update);
  }, []);
  return state;
}
function edit(patch: Partial<ThreeDProject>) {
  document.dispatchEvent(new CustomEvent('threedprojectchange', { detail: patch }));
}
export function ThreeDPanel() {
  const state = useThreeDState();
  const project = state.project;
  if (!state.active) return null;
  return (
    <div className="three-d-panel">
      <Section
        title="Physical object"
        badge="3D"
        description="Internal workspace · untreated source inspection"
        defaultOpen
      >
        <p className="gradient-note">
          One Config shape, including Object transformations. Morph grids are not combined.
        </p>
        {project && (
          <>
            <label className="three-d-field">
              Sizing
              <select
                aria-label="3D sizing"
                value={project.sizeMode}
                onChange={(e) =>
                  edit({
                    sizeMode: e.target.value as ThreeDProject['sizeMode'],
                    sizeConfirmed: true,
                  })
                }
              >
                <option value="longest">Choose longest dimension</option>
                {state.source?.imported && (
                  <>
                    <option value="mm">Raw coordinates in millimeters</option>
                    <option value="cm">Raw coordinates in centimeters</option>
                    <option value="in">Raw coordinates in inches</option>
                  </>
                )}
              </select>
            </label>
            {project.sizeMode === 'longest' && (
              <label className="three-d-field">
                Longest dimension (mm)
                <PhysicalNumberInput
                  aria-label="Longest dimension (mm)"
                  type="number"
                  min="0.1"
                  max="2000"
                  step="0.1"
                  value={project.longestMm}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    if (Number.isFinite(v) && v >= 0.1 && v <= 2000)
                      edit({ longestMm: v, sizeConfirmed: true });
                  }}
                />
              </label>
            )}
            {!project.sizeConfirmed && (
              <div className="three-d-notice">
                <p>Choose a physical size for this source. The preview starts at 100 mm.</p>
                <Button variant="outline" onClick={() => edit({ sizeConfirmed: true })}>
                  Use 100 mm
                </Button>
              </div>
            )}
            <p className="three-d-caption">Print orientation · X → Y → Z</p>
            <div className="three-d-fields">
              {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                <label key={axis}>
                  {axis} (°)
                  <PhysicalNumberInput
                    aria-label={`Print rotation ${axis}`}
                    type="number"
                    min="-180"
                    max="180"
                    step="1"
                    value={project.rotation[i]}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber;
                      if (Number.isFinite(v) && Math.abs(v) <= 180) {
                        const rotation = [...project.rotation] as ThreeDProject['rotation'];
                        rotation[i] = v;
                        edit({ rotation });
                      }
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="three-d-caption">Placement (mm) · centered build volume</p>
            <div className="three-d-fields">
              {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                <label key={axis}>
                  {axis}
                  <PhysicalNumberInput
                    aria-label={`Bed position ${axis}`}
                    type="number"
                    min="-2000"
                    max="2000"
                    step="1"
                    value={project.position[i]}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber;
                      if (Number.isFinite(v) && Math.abs(v) <= 2000) {
                        const position = [...project.position] as ThreeDProject['position'];
                        position[i] = v;
                        edit({ position });
                      }
                    }}
                  />
                </label>
              ))}
            </div>
            <Button variant="outline" onClick={() => edit({ onBed: true, position: [0, 0, 0] })}>
              Center & place on bed
            </Button>
            <p className="gradient-note">
              Z adds clearance above the bed. Camera navigation only changes your view.
            </p>
            {state.artifact && (
              <p className="three-d-dimensions">
                {state.artifact.dimensions.map((n) => n.toFixed(2)).join(' × ')} mm
              </p>
            )}
          </>
        )}
      </Section>
      {project && (
        <Section
          title="Print setup"
          description="Rectangular build volume in millimeters."
          defaultOpen
        >
          <label className="three-d-field">
            Printer preset
            <select
              aria-label="Printer preset"
              value={printerPreset(project.printerPresetId)?.id ?? 'custom'}
              onChange={(e) => edit({ printerPresetId: e.target.value })}
            >
              <option value="custom">Custom</option>
              {['Bambu Lab', 'Prusa', 'Creality'].map((brand) => (
                <optgroup label={brand} key={brand}>
                  {PRINTER_PRESETS.filter((p) => p.brand === brand).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.size.join(' × ')} mm
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="gradient-note">
            Nominal build volumes. Printer-specific exclusion zones and slicer margins are not
            included. Edit dimensions for a custom volume.
          </p>
          <div className="three-d-fields">
            {(['Width', 'Depth', 'Height'] as const).map((label, i) => (
              <label key={label}>
                {label} (mm)
                <PhysicalNumberInput
                  aria-label={`Build ${label.toLowerCase()} (mm)`}
                  type="number"
                  min="1"
                  max="2000"
                  step="1"
                  value={(project.buildVolumeMm ?? DEFAULT_BUILD_VOLUME)[i]}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (!Number.isFinite(value) || value < 1 || value > 2000) return;
                    const buildVolumeMm = [
                      ...(project.buildVolumeMm ?? DEFAULT_BUILD_VOLUME),
                    ] as ThreeDProject['buildVolumeMm'];
                    buildVolumeMm[i] = value;
                    edit({ buildVolumeMm });
                  }}
                />
              </label>
            ))}
          </div>
          <p className="gradient-note">
            Print view and manufacturing checks use this volume. X/Y are centered on the bed; height
            starts at Z = 0. Changing the volume does not resize the object.
          </p>
        </Section>
      )}
      {project && <ThreeDSurfacePanel state={state} project={project} />}
    </div>
  );
}
function Viewport({ state }: { state: ThreeDUiState }) {
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<ReturnType<typeof createThreeDScene> | null>(null);
  const current = useRef(state);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [style, setStyle] = useState<SceneStyle>('Studio');
  const fieldKey = state.slices?.fieldKey ?? '';
  const [sliceVisibility, setSliceVisibility] = useState({ fieldKey, visible: true });
  // Reset only when a completed field changes, including undo back to an older field.
  if (state.slices && sliceVisibility.fieldKey !== fieldKey)
    setSliceVisibility({ fieldKey, visible: true });
  const showSlices = sliceVisibility.fieldKey !== fieldKey || sliceVisibility.visible;
  const [comparedArtifact, setComparedArtifact] = useState<WeakRef<
    NonNullable<ThreeDUiState['artifact']>
  > | null>(null);
  const showSource =
    state.preparation?.status === 'accepted' &&
    !!state.artifact &&
    comparedArtifact?.deref() === state.artifact;
  const [ortho, setOrtho] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import('../../lib/three-d-scene')
      .then(({ createThreeDScene }) => {
        if (cancelled || !host.current) return;
        try {
          adapter.current = createThreeDScene(host.current);
          adapter.current.style('Studio');
          adapter.current.setArtifact(current.current.artifact);
          adapter.current.slices(current.current.slices ?? null);
          setReady(true);
        } catch {
          setError('3D rendering is unavailable. Enable WebGL or try another browser.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the 3D viewport. Re-enter 3D to retry.');
      });
    return () => {
      cancelled = true;
      adapter.current?.dispose();
      adapter.current = null;
    };
  }, []);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    adapter.current?.setArtifact(
      showSource ? (state.sourceArtifact ?? state.artifact) : state.artifact,
    );
    adapter.current?.slices(
      showSlices && !(showSource && state.preparation?.status === 'accepted')
        ? (state.slices ?? null)
        : null,
    );
  }, [
    state.artifact,
    state.sourceArtifact,
    state.slices,
    state.preparation?.status,
    showSource,
    showSlices,
    ready,
  ]);
  useEffect(() => {
    adapter.current?.buildVolume(state.project?.buildVolumeMm);
  }, [state.project?.buildVolumeMm, ready]);
  const overruns = state.artifact
    ? buildVolumeOverruns(state.artifact, state.project?.buildVolumeMm)
    : [];
  return (
    <section
      className="three-d-workspace"
      aria-label="3D workspace"
      aria-busy={state.status === 'pending'}
    >
      <div className="three-d-toolbar">
        <div>
          {(['Studio', 'Inspect', 'Print'] as const).map((mode) => (
            <Button
              key={mode}
              disabled={!ready}
              variant="outline"
              aria-pressed={style === mode}
              onClick={() => {
                setStyle(mode);
                adapter.current?.style(mode);
              }}
            >
              {mode}
            </Button>
          ))}
        </div>
        <div>
          {(['Fit', 'Front', 'Side', 'Top', 'Isometric'] as ReferenceView[]).map((view) => (
            <Button
              key={view}
              disabled={!ready}
              variant="outline"
              onClick={() => adapter.current?.view(view)}
            >
              {view}
            </Button>
          ))}
          <Button
            disabled={!ready}
            variant="outline"
            aria-pressed={ortho}
            onClick={() => {
              setOrtho(!ortho);
              adapter.current?.projection(!ortho);
            }}
          >
            {ortho ? 'Orthographic' : 'Perspective'}
          </Button>
        </div>
      </div>
      <div className="three-d-inspection-tools">
        {style === 'Print' && (
          <Button
            disabled={!ready}
            variant="outline"
            onClick={() => adapter.current?.view('Fit build volume')}
          >
            Fit build volume
          </Button>
        )}

        <Button
          variant="outline"
          aria-pressed={showSlices}
          onClick={() => setSliceVisibility({ fieldKey, visible: !showSlices })}
        >
          {showSlices ? 'Hide slices' : 'Show slices'}
        </Button>
        <Button
          variant="outline"
          disabled={state.preparation?.status !== 'accepted'}
          aria-pressed={showSource && state.preparation?.status === 'accepted'}
          onClick={() =>
            setComparedArtifact(showSource || !state.artifact ? null : new WeakRef(state.artifact))
          }
        >
          {showSource && state.preparation?.status === 'accepted'
            ? 'Show result'
            : 'Compare source'}
        </Button>
        <Button
          variant="outline"
          disabled={!ready}
          onClick={() =>
            document.dispatchEvent(
              new CustomEvent('threedalignview', {
                detail: { direction: adapter.current?.direction() },
              }),
            )
          }
        >
          Align slices to view
        </Button>
      </div>
      <div ref={host} className="three-d-canvas" />
      <div className="three-d-scene-label">
        <b>{state.source?.name ?? 'No source'}</b>
        <span>3D / internal prototype</span>
      </div>
      {(error || !ready || (!state.artifact && state.status !== 'ready')) && (
        <p className="three-d-message" role="status">
          {error || (!ready ? 'Loading 3D viewport…' : state.message)}
        </p>
      )}
      <div className="three-d-status" role="status">
        <span>
          {state.artifact
            ? `${state.artifact.dimensions.map((n) => n.toFixed(1)).join(' × ')} mm · ${(state.artifact.T.length / 3).toLocaleString()} triangles`
            : 'No current geometry'}
        </span>
        <span>
          {overruns.length
            ? `Outside build volume: ${overruns.map(({ boundary, mm }) => `${boundary} ${mm < 0.01 ? '<0.01' : mm.toFixed(2)} mm`).join(', ')} · `
            : ''}
          {showSource && state.preparation?.status === 'accepted'
            ? 'Untreated source comparison · prepared result retained'
            : state.message}
        </span>
        {(state.slices?.error || !showSlices) && (
          <span>
            {state.slices?.error
              ? `Contours unavailable: ${state.slices.error}`
              : 'Contours hidden · use Show slices to display them'}
          </span>
        )}
        <span>Drag to orbit · right-drag to pan · scroll to zoom</span>
      </div>
    </section>
  );
}
export function ThreeDWorkspace() {
  const state = useThreeDState();
  return state.active ? <Viewport key={state.source?.id ?? 'empty'} state={state} /> : null;
}
