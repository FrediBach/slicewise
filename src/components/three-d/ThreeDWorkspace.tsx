import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
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
// Keep incomplete numeric text editable; only valid values reach the project.
function PhysicalNumberInput({
  value,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value: number }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.value = String(value);
  }, [value]);
  return (
    <input
      {...props}
      ref={input}
      defaultValue={value}
      onBlur={() => {
        if (
          input.current &&
          (!input.current.validity.valid || !Number.isFinite(input.current.valueAsNumber))
        )
          input.current.value = String(value);
      }}
    />
  );
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
            <p className="three-d-caption">Placement (mm) · centered 220 × 220 × 250 bed</p>
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
      <Section
        title="Preparation"
        description="Treatments and export are not available in this milestone."
        defaultOpen
      >
        <p className="gradient-note">
          Surface treatment: Off. Solid validity, wall thickness, support and stability have not
          been checked.
        </p>
        <Button disabled>3D export unavailable</Button>
      </Section>
    </div>
  );
}
function Viewport({ state }: { state: ThreeDUiState }) {
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<ReturnType<typeof createThreeDScene> | null>(null);
  const current = useRef(state.artifact);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [style, setStyle] = useState<SceneStyle>('Studio');
  const [ortho, setOrtho] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import('../../lib/three-d-scene')
      .then(({ createThreeDScene }) => {
        if (cancelled || !host.current) return;
        try {
          adapter.current = createThreeDScene(host.current);
          adapter.current.style('Studio');
          adapter.current.setArtifact(current.current);
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
    current.current = state.artifact;
    adapter.current?.setArtifact(state.artifact);
  }, [state.artifact]);
  const outside =
    state.artifact &&
    (state.artifact.min[0] < -110 ||
      state.artifact.max[0] > 110 ||
      state.artifact.min[1] < -110 ||
      state.artifact.max[1] > 110 ||
      state.artifact.min[2] < -0.01 ||
      state.artifact.max[2] > 250);
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
      <div ref={host} className="three-d-canvas" />
      <div className="three-d-scene-label">
        <b>{state.source?.name ?? 'No source'}</b>
        <span>3D / internal prototype</span>
      </div>
      {(error || !ready || state.status !== 'ready') && (
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
          {outside ? 'Outside reference build volume · ' : ''}
          {state.message}
        </span>
        <span>Drag to orbit · right-drag to pan · scroll to zoom</span>
      </div>
    </section>
  );
}
export function ThreeDWorkspace() {
  const state = useThreeDState();
  return state.active ? <Viewport key={state.source?.id ?? 'empty'} state={state} /> : null;
}
