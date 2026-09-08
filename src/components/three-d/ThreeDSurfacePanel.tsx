import { ROUNDED_TOOL_LIMITS } from '../../lib/slice-treatment';
import { Button } from '../ui/button';
import { Section } from '../ui/section';
import { PhysicalNumberInput } from './PhysicalNumberInput';
import type { ThreeDProject, ThreeDUiState } from '../../lib/three-d-project';

const edit = (detail: Partial<ThreeDProject>) =>
  document.dispatchEvent(new CustomEvent('threedprojectchange', { detail }));
export function ThreeDSurfacePanel({
  state,
  project,
}: {
  state: ThreeDUiState;
  project: ThreeDProject;
}) {
  const selection = project.selection;
  const pending = state.preparation?.status === 'pending';
  const canPrepare =
    state.status === 'ready' &&
    project.sizeConfirmed &&
    project.treatment !== 'off' &&
    project.radiusMm > 0 &&
    !!state.slices?.selectedCount &&
    !state.slices.error;
  return (
    <Section
      title="Surface treatment"
      description="Experimental circular grooves and ribs. Export remains unavailable."
      defaultOpen
    >
      <p className="gradient-note">
        Line count, spacing and Slice field above are shared with Config. View depth uses a fixed
        direction; camera navigation does not change the slices.
      </p>
      <label className="three-d-field">
        Treatment
        <select
          aria-label="Surface treatment"
          value={project.treatment}
          onChange={(e) => edit({ treatment: e.target.value as ThreeDProject['treatment'] })}
        >
          <option value="off">Off</option>
          <option value="inset">Inset · experimental</option>
          <option value="emboss">Emboss · experimental</option>
        </select>
      </label>
      <label className="three-d-field">
        Circular tool radius (mm)
        <PhysicalNumberInput
          type="number"
          min="0"
          max="10"
          step="0.1"
          value={project.radiusMm}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v) && v >= 0 && v <= 10) edit({ radiusMm: v });
          }}
        />
      </label>
      <p className="gradient-note">
        Width and penetration are coupled by the circular tool. Surface-normal depth and width are
        not guaranteed on arbitrary surfaces. Zero radius leaves the source unchanged.
      </p>
      <label className="three-d-field">
        Slice selection
        <select
          aria-label="Slice selection"
          value={selection.mode}
          onChange={(e) =>
            edit({
              selection:
                e.target.value === 'all'
                  ? { mode: 'all' }
                  : e.target.value === 'range'
                    ? { mode: 'range', first: 0, last: Math.max(0, (state.slices?.count ?? 1) - 1) }
                    : { mode: 'every', step: 2, offset: 0 },
            })
          }
        >
          <option value="all">All slices</option>
          <option value="range">Contiguous range</option>
          <option value="every">Every Nth slice</option>
        </select>
      </label>
      {selection.mode === 'range' && (
        <div className="three-d-fields">
          {(['first', 'last'] as const).map((key) => (
            <label key={key}>
              {key === 'first' ? 'First slice' : 'Last slice'}
              <PhysicalNumberInput
                aria-label={key === 'first' ? 'First design slice' : 'Last design slice'}
                type="number"
                min="1"
                max="200"
                step="1"
                value={selection[key] + 1}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (Number.isInteger(v) && v >= 1 && v <= 200)
                    edit({ selection: { ...selection, [key]: v - 1 } });
                }}
              />
            </label>
          ))}
        </div>
      )}
      {selection.mode === 'every' && (
        <div className="three-d-fields">
          <label>
            Every N
            <PhysicalNumberInput
              type="number"
              min="1"
              max="32"
              step="1"
              value={selection.step}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isInteger(v) && v >= 1 && v <= 32)
                  edit({ selection: { ...selection, step: v, offset: selection.offset % v } });
              }}
            />
          </label>
          <label>
            Offset
            <PhysicalNumberInput
              type="number"
              min="0"
              max={selection.step - 1}
              step="1"
              value={selection.offset}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isInteger(v) && v >= 0 && v < selection.step)
                  edit({ selection: { ...selection, offset: v } });
              }}
            />
          </label>
        </div>
      )}
      <label className="three-d-field">
        Contour approximation
        <select
          aria-label="Contour approximation"
          value={project.pathToleranceMm}
          onChange={(e) => edit({ pathToleranceMm: Number(e.target.value) })}
        >
          <option value="0">Exact extracted paths</option>
          <option value="0.05">Allow 0.05 mm path deviation</option>
        </select>
      </label>
      <label className="three-d-field">
        Result vertex cleanup
        <select
          aria-label="Result vertex cleanup"
          value={project.resultWeldToleranceMm ?? 0}
          onChange={(e) => edit({ resultWeldToleranceMm: Number(e.target.value) })}
        >
          <option value="0.00001">Resolve rounding within 0.00001 mm</option>
          <option value="0">Exact coordinates only</option>
        </select>
      </label>
      <p className="gradient-note">
        Cleanup applies to generated result vertices, never the source. Movement is bounded by the
        selected tolerance and reported below; the result is fully checked afterward.
      </p>
      <p className="gradient-note">
        Profile tolerance: 0.05 mm. Construction allows {ROUNDED_TOOL_LIMITS.runs} tool loops,{' '}
        {ROUNDED_TOOL_LIMITS.vertices.toLocaleString('en-US')} path vertices and{' '}
        {ROUNDED_TOOL_LIMITS.primitiveTriangles.toLocaleString('en-US')} estimated construction
        triangles. The combined source/tools and final result remain limited to 500,000 triangles.
        Exact paths follow mesh detail; allowing contour approximation can reduce construction work.
      </p>
      <p className="three-d-slice-status" role="status">
        {state.slices?.error ??
          (state.slices
            ? `${state.slices.selectedCount} / ${state.slices.count} design slices selected · ${state.slices.runs} contour runs`
            : 'Updating slices…')}
      </p>
      {!project.sizeConfirmed && (
        <p className="gradient-note">Confirm a physical size before preparing.</p>
      )}
      <div className="three-d-prepare-actions">
        <Button
          disabled={!canPrepare || pending}
          onClick={() => document.dispatchEvent(new CustomEvent('threedprepare'))}
        >
          Prepare treatment
        </Button>
        {pending && (
          <Button
            variant="outline"
            onClick={() => document.dispatchEvent(new CustomEvent('threedcancel'))}
          >
            Cancel
          </Button>
        )}
      </div>
      <p role="status" className="three-d-preparation-status">
        {state.preparation?.message ?? 'Untreated source'}
      </p>
      {!!state.preparation?.cleanup?.length && (
        <details className="three-d-diagnostics">
          <summary>Generated mesh cleanup</summary>
          <p>Generated geometry only. Vertex movement is reported for each stage.</p>
          <ul className="three-d-diagnostic-list">
            {state.preparation.cleanup.map((item) => (
              <li key={item.stage}>
                {item.stage}: {item.mergedVertices} vertices merged, {item.removedFaces} zero-area
                faces removed, {item.removedUnusedVertices} unused vertices removed. Maximum vertex
                movement: {(item.maximumDisplacementMm ?? 0).toFixed(8)} mm (limit{' '}
                {(item.toleranceMm ?? 0).toFixed(8)} mm).
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!state.preparation?.checks && (
        <details className="three-d-diagnostics">
          <summary>Geometry checks</summary>
          <dl>
            {Object.entries(state.preparation.checks).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replace(/([A-Z])/g, ' $1')}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {!!state.preparation?.issues?.length && (
        <ul className="three-d-diagnostic-list">
          {state.preparation.issues.map(({ code, count }) => (
            <li key={code}>
              {code} · {count}
            </li>
          ))}
        </ul>
      )}
      {state.preparation?.bodyCount !== undefined && (
        <p className="gradient-note">
          {state.preparation.bodyCount} {state.preparation.bodyCount === 1 ? 'body' : 'bodies'} ·{' '}
          {state.preparation.volumeMm3?.toFixed(1)} mm³
        </p>
      )}
      {!!state.preparation?.advisories?.length && (
        <p className="gradient-note">
          Manufacturing advisories: {state.preparation.advisories.join(', ')}.
        </p>
      )}
      {state.preparation?.approximation && (
        <p className="gradient-note">
          Approximate paths: {state.preparation.approximation.inputVertices} →{' '}
          {state.preparation.approximation.outputVertices} vertices; maximum measured deviation{' '}
          {state.preparation.approximation.maximumDeviationMm.toFixed(4)} mm.
        </p>
      )}
      <p className="gradient-note">
        Completed geometry audits do not establish print readiness. Global wall thickness, support
        and stability remain unchecked.
      </p>
      <Button disabled>3D export unavailable</Button>
    </Section>
  );
}
