import { describe, expect, it } from 'vitest';
import { defaultUunaExpressiveMotion } from './gcode-3d-toolpaths';
import {
  createCurrentExport,
  createExportFilename,
  createGCodeExport,
  createGCodeExportPreflight,
  type ExportState,
} from './slicer-export';

const exportState = (overrides: Partial<ExportState> = {}): ExportState => ({
  toolpaths: [{ color: '#123456', label: 'contours', runs: [[10, 20, 30, 40]] }],
  pw: 200,
  ph: 100,
  name: 'study.obj',
  drawFeed: 2400,
  travelFeed: 4800,
  penUp: 3,
  penDown: -2,
  zFeed: 900,
  uunaExpressiveMotion: defaultUunaExpressiveMotion(-2),
  gcodeProfile: 'uunatek3-a3',
  gcodeAutoRotate: true,
  clipToArtboard: true,
  optimizeTravel: false,
  mergeTolerance: 0.15,
  kaleidoscope: false,
  halftone: false,
  chroma: false,
  misregistration: false,
  humanizer: false,
  yarnCurl: false,
  blueprint: false,
  topographicMap: false,
  vectorZoom1Enabled: false,
  vectorZoom2Enabled: false,
  vectorZoom3Enabled: false,
  vectorZoom4Enabled: false,
  exportFormat: 'svg',
  svg: '<svg/>',
  ...overrides,
});

describe('slicer export assembly', () => {
  it('returns SVG without running the G-code serializer', () => {
    expect(createCurrentExport(exportState())).toEqual({
      content: '<svg/>',
      extension: 'svg',
      type: 'image/svg+xml',
    });
  });

  it('maps the UUNA TEK profile and active vector zoom into G-code metadata', () => {
    const output = createGCodeExport(
      exportState({ vectorZoom3Enabled: true, misregistration: true }),
    );

    expect(output).toContain('; Machine: UUNA TEK 3.0 A3');
    expect(output).toContain('; Origin: rear-left of sheet; +X right; +Y toward front');
    expect(output).toContain('G0 X10 Y20 F4800');
    expect(output).toContain('Vector zoom: enlarged detail, borders, and dashed leaders');
    expect(output).toContain('Misregistration: offset colour copies are included');
  });

  it.each([
    ['uunatek3-a3', 'A3', 420, 297],
    ['uunatek3-a2', 'A2', 594, 420],
    ['uunatek3-a1', 'A1', 841, 594],
    ['uunatek3-a0', 'A0', 1189, 841],
  ])('supports the %s machine profile', (gcodeProfile, size, pw, ph) => {
    const preflight = createGCodeExportPreflight(
      exportState({ gcodeProfile, pw, ph, toolpaths: [] }),
    );

    expect(preflight.validation.valid).toBe(true);
    expect(preflight.content).toContain(`; Machine: UUNA TEK 3.0 ${size}`);
    expect(preflight.content).toContain(`; Sheet: ${pw} x ${ph} mm`);
    expect(preflight.content).toContain('; Origin: rear-left of sheet');
  });

  it('keeps the legacy UUNA A3 identifier compatible', () => {
    expect(createGCodeExport(exportState({ gcodeProfile: 'uunatek3' }))).toContain(
      '; Machine: UUNA TEK 3.0 A3',
    );
  });

  it('blocks an artboard that exceeds the selected UUNA working area', () => {
    expect(() =>
      createGCodeExport(exportState({ gcodeProfile: 'uunatek3-a3', pw: 421, ph: 297 })),
    ).toThrow(/421 × 297 mm artboard exceeds.*420 × 297 mm working area/);
  });

  it('rotates a full portrait artboard clockwise to fit the landscape machine', () => {
    const preflight = createGCodeExportPreflight(exportState({ pw: 297, ph: 420 }));

    expect(preflight.validation.valid).toBe(true);
    expect(preflight.rotation).toBe('clockwise-90');
    expect(preflight.sheet).toEqual({ width: 420, height: 297 });
    expect(preflight.content).toContain('; Sheet: 420 x 297 mm');
    expect(preflight.content).toContain(
      '; Layout: rotated 90 degrees clockwise from 297 x 420 mm canvas',
    );
    expect(preflight.content).toContain('G0 X400 Y10 F4800');
    expect(preflight.content).toContain('G1 X380 Y30 F2400');
  });

  it('blocks a portrait artboard when machine auto-rotation is disabled', () => {
    expect(() =>
      createGCodeExport(exportState({ pw: 297, ph: 420, gcodeAutoRotate: false })),
    ).toThrow(/297 × 420 mm artboard exceeds.*420 × 297 mm working area/);
  });

  it('preserves a smaller portrait sheet that already fits', () => {
    const preflight = createGCodeExportPreflight(exportState({ pw: 210, ph: 297 }));

    expect(preflight.rotation).toBe('none');
    expect(preflight.sheet).toEqual({ width: 210, height: 297 });
  });

  it('preflights the serialized machine path before export', () => {
    const preflight = createGCodeExportPreflight(exportState());

    expect(preflight.validation.valid).toBe(true);
    expect(preflight.validation.stats.drawDistance).toBeCloseTo(Math.hypot(20, 20));
    expect(preflight.validation.segments.some(({ kind }) => kind === 'draw')).toBe(true);
  });

  it('gates coordinated XYZ behind both the UUNA capability and explicit opt-in', () => {
    const legacy = createGCodeExport(exportState());
    const expressive = createGCodeExport(
      exportState({
        uunaExpressiveMotion: {
          ...defaultUunaExpressiveMotion(-2.5),
          enabled: true,
        },
      }),
    );
    const generic = createGCodeExport(
      exportState({
        gcodeProfile: 'generic',
        uunaExpressiveMotion: {
          ...defaultUunaExpressiveMotion(-2.5),
          enabled: true,
        },
      }),
    );

    expect(legacy).not.toContain('coordinated XYZ');
    expect(expressive).toContain('G1 X30 Y40 Z-2.5 F2400');
    expect(generic).not.toContain('coordinated XYZ');
    expect(generic).not.toMatch(/G1 X\S+ Y\S+ Z/);
  });

  it('blocks export when runtime machine settings cannot pass preflight', () => {
    expect(() => createGCodeExport(exportState({ drawFeed: Number.NaN }))).toThrow(
      /G-code preflight failed.*Expected draw feed NaN mm\/min/,
    );
  });

  it('maps unknown profiles to the generic bottom-left convention', () => {
    const exported = createCurrentExport(
      exportState({ exportFormat: 'gcode', gcodeProfile: 'custom' }),
    );

    expect(exported.extension).toBe('gcode');
    expect(exported.type).toBe('text/x-gcode');
    expect(exported.content).toContain('; Machine: Generic Z-axis plotter');
    expect(exported.content).toContain('; Origin: bottom-left of sheet; +X right; +Y up');
    expect(exported.content).toContain('G0 X10 Y80 F4800');
    expect(exported.content).toContain('G1 X30 Y60 F2400');
  });

  it('normalizes upload names and falls back for punctuation-only names', () => {
    expect(createExportFilename('My odd model.v2.obj', 'svg')).toBe('My-odd-model-v2-contours.svg');
    expect(createExportFilename(' ... ', 'gcode')).toBe('contours-contours.gcode');
  });
});
