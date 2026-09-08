import { PhysicalNumberInput } from './PhysicalNumberInput';
import type { ThreeDProject } from '../../lib/three-d-project';

const edit = (detail: Partial<ThreeDProject>) =>
  document.dispatchEvent(new CustomEvent('threedprojectchange', { detail }));

export function ThreeDTreatmentProfile({ project }: { project: ThreeDProject }) {
  const emboss = project.treatment === 'emboss';
  const active = project.treatment !== 'off' && project.radiusMm > 0;
  const width = Number((2 * project.radiusMm).toFixed(6));
  const depth = Number(project.radiusMm.toFixed(6));
  const dimension = emboss ? 'height' : 'depth';
  return (
    <>
      <div className="three-d-fields">
        <label>
          Nominal width (mm)
          <PhysicalNumberInput
            type="number"
            min="0"
            max="20"
            step="0.2"
            value={width}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              if (Number.isFinite(v) && v >= 0 && v <= 20) edit({ radiusMm: v / 2 });
            }}
          />
        </label>
        <label>
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
      </div>
      <figure className="three-d-profile">
        <svg
          viewBox="0 0 320 150"
          role="img"
          aria-label={
            active
              ? `Circular ${project.treatment}: nominal width ${width} mm, ${dimension} ${depth} mm on a flat surface`
              : 'Untreated flat surface'
          }
        >
          <path
            d={
              active
                ? `M16 76H112A48 48 0 0 ${emboss ? 1 : 0} 208 76H304V140H16Z`
                : 'M16 76H304V140H16Z'
            }
            fill="currentColor"
            opacity="0.12"
          />
          {active && (
            <path d="M112 76H208" stroke="currentColor" strokeDasharray="3 3" opacity="0.4" />
          )}
          <path
            d={active ? `M16 76H112A48 48 0 0 ${emboss ? 1 : 0} 208 76H304` : 'M16 76H304'}
            fill="none"
            stroke="currentColor"
          />
          {active && (
            <g fill="currentColor" fontSize="11" textAnchor="middle">
              <path d="M112 13V21M112 17H208M208 13V21" stroke="currentColor" />
              <text x="160" y="10">
                {width} mm wide
              </text>
              <path
                d={
                  emboss ? 'M232 28H240M236 28V76M232 76H240' : 'M232 76H240M236 76V124M232 124H240'
                }
                stroke="currentColor"
              />
              <text x="268" y={emboss ? 48 : 96}>
                {depth} mm
              </text>
              <text x="268" y={emboss ? 62 : 110}>
                {dimension}
              </text>
            </g>
          )}
        </svg>
        <figcaption>
          {active
            ? 'Ideal flat-surface cross-section · not to scale'
            : 'Treatment off or zero width · unchanged source'}
        </figcaption>
      </figure>
      <p className="gradient-note">
        Width is twice the radius. Nominal {dimension} equals the radius; these dimensions change
        together. Actual width and {dimension} vary at corners and on curved surfaces.
      </p>
      <label className="three-d-field">
        Profile precision
        <select
          aria-label="Profile precision"
          value={project.profileToleranceMm ?? 0.05}
          onChange={(e) => edit({ profileToleranceMm: Number(e.target.value) })}
        >
          <option value="0.1">Draft · 0.10 mm</option>
          <option value="0.05">Standard · 0.05 mm</option>
          <option value="0.02">Fine · 0.02 mm</option>
        </select>
      </label>
      <p className="gradient-note">
        Smaller tolerance makes the circular tool smoother and increases preparation work. This is
        separate from contour approximation and does not change printer layer height.
      </p>
    </>
  );
}
