import { Section } from '../ui/section';
import { FieldGroup, SelectControl, ValueControl } from '../controls/FormControls';

export function ViewPanel() {
  return (
    <Section
      title="View"
      description="Frame the model and set its projection on the page."
      badge="02"
    >
      <FieldGroup title="Orientation">
        <ValueControl id="az" label="Azimuth" min="-180" max="180" step="0.1" value="35" unit="°" />
        <ValueControl
          id="el"
          label="Elevation"
          min="-180"
          max="180"
          step="0.1"
          value="24"
          unit="°"
        />
        <ValueControl id="rl" label="Roll" min="-180" max="180" step="0.1" value="0" unit="°" />
      </FieldGroup>
      <FieldGroup title="Framing & lens">
        <ValueControl id="zoom" label="Scale" min="0.2" max="3" step="0.01" value="1" unit="×" />
        <ValueControl
          id="panX"
          label="Offset X"
          min="-2000"
          max="2000"
          step="0.1"
          value="0"
          unit="mm"
        />
        <ValueControl
          id="panY"
          label="Offset Y"
          min="-2000"
          max="2000"
          step="0.1"
          value="0"
          unit="mm"
        />
        <ValueControl
          id="lensFocalLength"
          label="Focal length"
          min="8"
          max="300"
          step="1"
          value="50"
          unit="mm"
        />
        <ValueControl
          id="lensPerspective"
          label="Perspective"
          min="0"
          max="100"
          step="1"
          value="0"
          unit="%"
        />
      </FieldGroup>
      <FieldGroup title="Projection warp">
        <SelectControl
          id="projectionWarpMode"
          label="Projection warp"
          defaultValue="none"
          randomizable
          optionDescriptions={{
            none: 'Keeps the camera projection unchanged. Use this for a conventional orthographic or perspective view.',
            'klein-poincare':
              'Morphs radially between Klein and Poincaré disk coordinates while preserving a centered circular composition.',
            mobius:
              'Navigates and rotates the image inside the Poincaré disk with an asymmetric hyperbolic transformation.',
            stereographic:
              'Lifts the camera plane onto a sphere and projects from a pole, strongly expanding the horizon.',
            gnomonic:
              'Projects the lifted sphere from its centre, keeping great-circle paths straight while stretching the horizon.',
            lambert:
              'Uses an equal-area spherical projection with gentler radial compression than stereographic mode.',
            inversion:
              'Turns geometry inside out around a configurable circle, with a blendable transformation strength.',
          }}
        >
          <option value="none">None</option>
          <option value="klein-poincare">Klein ↔ Poincaré</option>
          <option value="mobius">Hyperbolic Möbius</option>
          <option value="stereographic">Spherical · stereographic</option>
          <option value="gnomonic">Spherical · gnomonic</option>
          <option value="lambert">Spherical · Lambert equal-area</option>
          <option value="inversion">Circle inversion</option>
        </SelectControl>
        <ValueControl
          id="lensWarpExponent"
          label="Klein ↔ Poincaré"
          min="0"
          max="100"
          step="1"
          value="0"
          unit="%"
          disabled
          disabledReason="Select Klein ↔ Poincaré as the projection warp to edit this parameter."
        />
        <ValueControl
          id="mobiusDirection"
          label="Hyperbolic direction"
          min="-180"
          max="180"
          step="1"
          value="0"
          unit="°"
          disabled
          disabledReason="Select Hyperbolic Möbius as the projection warp to edit this parameter."
        />
        <ValueControl
          id="mobiusDisplacement"
          label="Hyperbolic displacement"
          min="0"
          max="95"
          step="1"
          value="0"
          unit="%"
          disabled
          disabledReason="Select Hyperbolic Möbius as the projection warp to edit this parameter."
        />
        <ValueControl
          id="mobiusRotation"
          label="Hyperbolic rotation"
          min="-180"
          max="180"
          step="1"
          value="0"
          unit="°"
          disabled
          disabledReason="Select Hyperbolic Möbius as the projection warp to edit this parameter."
        />
        <ValueControl
          id="mobiusStrength"
          label="Warp strength"
          min="0"
          max="100"
          step="1"
          value="100"
          unit="%"
          disabled
          disabledReason="Select Hyperbolic Möbius as the projection warp to edit this parameter."
        />
        <ValueControl
          id="sphericalStrength"
          label="Spherical strength"
          min="0"
          max="100"
          step="1"
          value="100"
          unit="%"
          disabled
          disabledReason="Select a spherical projection warp to edit this parameter."
        />
        <ValueControl
          id="inversionCenterX"
          label="Inversion centre X"
          min="-100"
          max="100"
          step="1"
          value="0"
          unit="% radius"
          disabled
          disabledReason="Select Circle inversion as the projection warp to edit this parameter."
        />
        <ValueControl
          id="inversionCenterY"
          label="Inversion centre Y"
          min="-100"
          max="100"
          step="1"
          value="0"
          unit="% radius"
          disabled
          disabledReason="Select Circle inversion as the projection warp to edit this parameter."
        />
        <ValueControl
          id="inversionRadius"
          label="Inversion radius"
          min="1"
          max="200"
          step="1"
          value="50"
          unit="% radius"
          disabled
          disabledReason="Select Circle inversion as the projection warp to edit this parameter."
        />
        <ValueControl
          id="inversionStrength"
          label="Inversion strength"
          min="0"
          max="100"
          step="1"
          value="100"
          unit="%"
          disabled
          disabledReason="Select Circle inversion as the projection warp to edit this parameter."
        />
        <p className="gradient-note blueprint-note">
          Spherical modes lift camera-plane radius to angular distance; radius 100% is the spherical
          horizon. Orthographic projection is the neutral None mode.
        </p>
      </FieldGroup>
      <FieldGroup title="Optical finish">
        <ValueControl
          id="lensDistortion"
          label="Lens distortion"
          min="-100"
          max="100"
          step="1"
          value="0"
          unit="%"
        />
      </FieldGroup>
    </Section>
  );
}
