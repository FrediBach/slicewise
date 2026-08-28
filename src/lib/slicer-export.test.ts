import { describe, expect, it } from 'vitest';
import {
  createCurrentExport,
  createExportFilename,
  createGCodeExport,
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
  gcodeProfile: 'uunatek3',
  clipToArtboard: true,
  optimizeTravel: false,
  mergeTolerance: 0.15,
  kaleidoscope: false,
  halftone: false,
  chroma: false,
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
    const output = createGCodeExport(exportState({ vectorZoom3Enabled: true }));

    expect(output).toContain('; Machine: UUNA TEK 3.0 A3');
    expect(output).toContain('; Origin: rear-left of sheet; +X right; +Y toward front');
    expect(output).toContain('G0 X10 Y20 F4800');
    expect(output).toContain('Vector zoom: enlarged detail, borders, and dashed leaders');
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
